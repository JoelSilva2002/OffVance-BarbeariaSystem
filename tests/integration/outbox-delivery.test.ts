import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma.js";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { createAdmin, staffLogin } from "../setup/fixtures.js";
import { deliverPendingWebhooks, fanOutPendingEvents } from "../../src/modules/outbox/dispatcher.js";

/**
 * Servidor HTTP real fazendo o papel do n8n do outro lado — é o proxy mais
 * próximo que dá pra ter, num teste automatizado, de "o n8n de verdade
 * conseguiria verificar essa assinatura": recalcula o HMAC sobre o corpo
 * cru recebido (nunca reparseado/reserializado) e compara.
 */
class FakeReceiver {
  server: Server;
  port = 0;
  requests: { headers: Record<string, string | string[] | undefined>; rawBody: string }[] = [];
  responseStatus = 200;

  constructor() {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        this.requests.push({ headers: req.headers, rawBody: Buffer.concat(chunks).toString("utf8") });
        res.writeHead(this.responseStatus);
        res.end();
      });
    });
  }

  async start(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("endereço do servidor de teste inválido");
    this.port = address.port;
    return `http://127.0.0.1:${this.port}/webhook`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

describe("entrega de webhook (outbox → n8n)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let receiver: FakeReceiver;
  let webhookUrl: string;

  beforeEach(async () => {
    await resetDatabase();
    const admin = await createAdmin();
    app = await createTestApp();
    ({ accessToken: adminToken } = await staffLogin(app, admin.user.email!, admin.password));

    receiver = new FakeReceiver();
    webhookUrl = await receiver.start();
  });

  afterEach(async () => {
    await app.close();
    await receiver.stop();
  });

  async function registerEndpoint(events: string[] = ["appointment.created"]) {
    const res = await app.inject({
      method: "POST",
      url: "/webhook-endpoints",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { url: webhookUrl, subscribedEvents: events },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; secret: string };
  }

  async function emitEvent(eventType = "appointment.created") {
    return prisma.outboxEvent.create({
      data: { aggregateType: "appointment", aggregateId: "apt_test", eventType, payload: { hello: "world" } },
    });
  }

  it("entrega com headers corretos, e o HMAC recalculado sobre o corpo cru bate", async () => {
    const endpoint = await registerEndpoint();
    await emitEvent();

    const fanOut = await fanOutPendingEvents();
    expect(fanOut).toBe(1);
    const result = await deliverPendingWebhooks();
    expect(result).toEqual({ attempted: 1, succeeded: 1, retried: 0, abandoned: 0 });

    expect(receiver.requests).toHaveLength(1);
    const received = receiver.requests[0]!;
    expect(received.headers["x-prisma-event"]).toBe("appointment.created");
    expect(received.headers["x-prisma-delivery"]).toBeTruthy();
    const timestamp = received.headers["x-prisma-timestamp"] as string;
    const signature = received.headers["x-prisma-signature"] as string;
    expect(timestamp).toBeTruthy();

    const expected = `sha256=${createHmac("sha256", endpoint.secret).update(`${timestamp}.${received.rawBody}`).digest("hex")}`;
    expect(signature).toBe(expected);

    const parsed = JSON.parse(received.rawBody);
    expect(parsed.type).toBe("appointment.created");
    expect(parsed.data).toEqual({ hello: "world" });

    const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { webhookEndpointId: endpoint.id } });
    expect(delivery.status).toBe("SUCCEEDED");
    expect(delivery.attempts).toBe(1);
  });

  it("endpoint sem inscrição no tipo de evento não recebe nada", async () => {
    await registerEndpoint(["appointment.cancelled"]);
    await emitEvent("appointment.created");

    await fanOutPendingEvents();
    await deliverPendingWebhooks();

    expect(receiver.requests).toHaveLength(0);
  });

  it("falha na entrega agenda retry com o backoff certo, sem abandonar antes da hora", async () => {
    const endpoint = await registerEndpoint();
    await emitEvent();
    receiver.responseStatus = 500;

    await fanOutPendingEvents();
    const result = await deliverPendingWebhooks();
    expect(result).toEqual({ attempted: 1, succeeded: 0, retried: 1, abandoned: 0 });

    const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { webhookEndpointId: endpoint.id } });
    expect(delivery.status).toBe("PENDING");
    expect(delivery.attempts).toBe(1);
    // primeiro backoff é 60s — só confere que ficou no futuro, sem acoplar no valor exato
    expect(delivery.nextRetryAt.getTime()).toBeGreaterThan(Date.now() + 30_000);

    const refreshedEndpoint = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(refreshedEndpoint.active).toBe(true);
    expect(refreshedEndpoint.consecutiveFailures).toBe(0); // só incrementa quando a entrega é ABANDONADA, não a cada tentativa
  });

  it("esgota as 5 tentativas de uma entrega → ABANDONED, e soma 1 na falha consecutiva do endpoint", async () => {
    const endpoint = await registerEndpoint();
    await emitEvent();
    receiver.responseStatus = 500;

    await fanOutPendingEvents();
    for (let attempt = 1; attempt <= 5; attempt++) {
      await prisma.webhookDelivery.updateMany({
        where: { webhookEndpointId: endpoint.id, status: "PENDING" },
        data: { nextRetryAt: new Date() }, // força a tentativa acontecer agora, sem esperar horas de backoff de verdade
      });
      await deliverPendingWebhooks();
    }

    const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { webhookEndpointId: endpoint.id } });
    expect(delivery.status).toBe("ABANDONED");
    expect(delivery.attempts).toBe(5);

    const refreshedEndpoint = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(refreshedEndpoint.consecutiveFailures).toBe(1);
    expect(refreshedEndpoint.active).toBe(true); // só 1 de 5 necessárias pra desativar
  });

  it("desativa o endpoint sozinho depois de 5 entregas abandonadas seguidas", async () => {
    const endpoint = await registerEndpoint();
    receiver.responseStatus = 500;

    for (let eventNumber = 1; eventNumber <= 5; eventNumber++) {
      await emitEvent();
      await fanOutPendingEvents();
      for (let attempt = 1; attempt <= 5; attempt++) {
        await prisma.webhookDelivery.updateMany({
          where: { webhookEndpointId: endpoint.id, status: "PENDING" },
          data: { nextRetryAt: new Date() },
        });
        await deliverPendingWebhooks();
      }
    }

    const refreshedEndpoint = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(refreshedEndpoint.consecutiveFailures).toBe(5);
    expect(refreshedEndpoint.active).toBe(false);

    const abandoned = await prisma.webhookDelivery.count({ where: { webhookEndpointId: endpoint.id, status: "ABANDONED" } });
    expect(abandoned).toBe(5);
  }, 20_000);

  it("um sucesso depois de falhas zera o contador de falhas consecutivas do endpoint", async () => {
    const endpoint = await registerEndpoint();
    receiver.responseStatus = 500;
    await emitEvent();
    await fanOutPendingEvents();
    for (let attempt = 1; attempt <= 5; attempt++) {
      await prisma.webhookDelivery.updateMany({
        where: { webhookEndpointId: endpoint.id, status: "PENDING" },
        data: { nextRetryAt: new Date() },
      });
      await deliverPendingWebhooks();
    }
    let refreshedEndpoint = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(refreshedEndpoint.consecutiveFailures).toBe(1);

    receiver.responseStatus = 200;
    await emitEvent();
    await fanOutPendingEvents();
    await deliverPendingWebhooks();

    refreshedEndpoint = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(refreshedEndpoint.consecutiveFailures).toBe(0);
  });
});
