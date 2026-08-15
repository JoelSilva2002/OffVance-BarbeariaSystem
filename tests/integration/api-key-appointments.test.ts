import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma.js";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import {
  createAdmin,
  createApiKey,
  createBarberWithService,
  createClientUser,
  seedShopSettings,
  staffLogin,
} from "../setup/fixtures.js";
import { nextWeekdayAt } from "../setup/dates.js";

/**
 * API key com escopo appointments:write age como um ADMIN sobre
 * agendamentos — é o que permite o n8n criar/confirmar/cancelar em nome do
 * sistema quando o cliente responde no WhatsApp (docs/ARQUITETURA.md §02).
 */
describe("API key — escopo de agendamentos", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let barberId: string;
  let serviceId: string;
  let clientId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedShopSettings();
    const admin = await createAdmin();
    const { barber, service } = await createBarberWithService();
    const { client } = await createClientUser();
    barberId = barber.id;
    serviceId = service.id;
    clientId = client.id;

    app = await createTestApp();
    ({ accessToken: adminToken } = await staffLogin(app, admin.user.email!, admin.password));
  });

  afterEach(async () => {
    await app.close();
  });

  it("chave com appointments:write cria, confirma e cancela um agendamento", async () => {
    const apiKey = await createApiKey(app, adminToken, ["appointments:write"]);

    const createRes = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${apiKey.key}` },
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt: nextWeekdayAt(10) },
    });
    expect(createRes.statusCode).toBe(201);
    const appointment = createRes.json();

    const confirmRes = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/confirm`,
      headers: { authorization: `Bearer ${apiKey.key}` },
      payload: {},
    });
    expect(confirmRes.statusCode).toBe(200);
    expect(confirmRes.json().status).toBe("CONFIRMADO");

    const cancelRes = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/cancel`,
      headers: { authorization: `Bearer ${apiKey.key}` },
      payload: { reason: "cliente pediu por WhatsApp" },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().status).toBe("CANCELADO");
  });

  it("o histórico registra actorType API com o id da chave, nunca o que o corpo declarar", async () => {
    const apiKey = await createApiKey(app, adminToken, ["appointments:write"]);

    const createRes = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${apiKey.key}` },
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt: nextWeekdayAt(10) },
    });
    const appointment = createRes.json();

    await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/confirm`,
      headers: { authorization: `Bearer ${apiKey.key}` },
      // mesmo se o corpo tentasse declarar outra identidade, o schema nem aceita mais o campo
      payload: { actorType: "ADMIN", actorId: "alguem-que-nao-sou-eu" },
    });

    const history = await prisma.appointmentStatusHistory.findMany({
      where: { appointmentId: appointment.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history).toHaveLength(2);
    // criação e confirmação — as duas atribuídas à chave, não ao que o corpo tentou declarar
    for (const entry of history) {
      expect(entry.actorType).toBe("API");
      expect(entry.actorId).toBe(apiKey.id);
    }
  });

  it("chave sem appointments:write recebe 403 INSUFFICIENT_SCOPE, não 401", async () => {
    const apiKey = await createApiKey(app, adminToken, ["events:read"]);

    const res = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${apiKey.key}` },
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt: nextWeekdayAt(10) },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().title).toBe("INSUFFICIENT_SCOPE");
  });

  it("chave com appointments:read lista agendamentos; sem o escopo, é recusada", async () => {
    const readKey = await createApiKey(app, adminToken, ["appointments:read"]);
    const writeOnlyKey = await createApiKey(app, adminToken, ["notifications:write"]);

    const ok = await app.inject({ method: "GET", url: "/appointments", headers: { authorization: `Bearer ${readKey.key}` } });
    expect(ok.statusCode).toBe(200);

    const blocked = await app.inject({
      method: "GET",
      url: "/appointments",
      headers: { authorization: `Bearer ${writeOnlyKey.key}` },
    });
    expect(blocked.statusCode).toBe(403);
  });

  it("chave inválida (formato certo, valor errado) é recusada com 401 — nunca 500", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/appointments",
      headers: { authorization: "Bearer sk_chave_que_nao_existe_00000000000000000000" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().title).toBe("INVALID_API_KEY");
  });

  it("chave revogada para de funcionar imediatamente", async () => {
    const apiKey = await createApiKey(app, adminToken, ["appointments:read"]);

    await app.inject({
      method: "PATCH",
      url: `/api-keys/${apiKey.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { active: false },
    });

    const res = await app.inject({
      method: "GET",
      url: "/appointments",
      headers: { authorization: `Bearer ${apiKey.key}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
