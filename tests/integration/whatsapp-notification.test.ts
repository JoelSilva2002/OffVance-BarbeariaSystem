import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma.js";
import { fireDueNotifications } from "../../src/modules/notifications/notification-dispatcher.js";
import { requestOtp } from "../../src/modules/auth/otp.service.js";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { createAdmin, createBarberWithService, createClientUser, seedShopSettings, staffLogin } from "../setup/fixtures.js";
import { nextWeekdayAt } from "../setup/dates.js";

describe("despacho de WhatsApp (destinatário + texto da mensagem)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let barberId: string;
  let serviceId: string;
  let clientId: string;
  let clientPhone: string;
  let clientFullName: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedShopSettings();
    const admin = await createAdmin();
    const { barber, service } = await createBarberWithService({ priceCents: 5000 });
    const { user: clientUser, client } = await createClientUser({ email: "cliente@teste.dev" });
    barberId = barber.id;
    serviceId = service.id;
    clientId = client.id;
    clientPhone = clientUser.phone;
    clientFullName = client.fullName!;

    app = await createTestApp();
    ({ accessToken: adminToken } = await staffLogin(app, admin.user.email!, admin.password));
  });

  afterEach(async () => {
    await app.close();
  });

  function authHeader() {
    return { authorization: `Bearer ${adminToken}` };
  }

  async function forcePastDue(dedupKey: string) {
    await prisma.notification.updateMany({
      where: { dedupKey },
      data: { scheduledFor: new Date(Date.now() - 60_000) },
    });
  }

  it("lembrete: outbox_event carrega telefone, nome e hora local formatada — não só clientId", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: authHeader(),
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt: nextWeekdayAt(14) },
    });
    expect(createRes.statusCode).toBe(201);
    const appointment = createRes.json();

    await forcePastDue(`reminder:${appointment.id}`);
    const fired = await fireDueNotifications();
    expect(fired).toBeGreaterThan(0);

    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { eventType: "notification.due", aggregateId: { in: await notificationIdsFor(`reminder:${appointment.id}`) } },
    });
    const payload = event.payload as {
      recipient: { phone: string; name: string };
      message: { text: string };
      template: string;
    };

    expect(payload.recipient.phone).toBe(clientPhone);
    expect(payload.recipient.name).toBe(clientFullName);
    expect(payload.template).toBe("appointment_reminder");
    expect(payload.message.text).toContain(clientFullName);
    expect(payload.message.text).toContain("14:00"); // hora local, no fuso da loja — não um ISO cru em UTC
    expect(payload.message.text).toContain("Responda *SIM*");

    const notification = await prisma.notification.findFirstOrThrow({ where: { dedupKey: `reminder:${appointment.id}` } });
    expect(notification.status).toBe("SENT");
  });

  it("recibo: mesma coisa depois de concluir o atendimento", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: authHeader(),
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt: nextWeekdayAt(10) },
    });
    const appointment = createRes.json();
    await app.inject({ method: "POST", url: `/appointments/${appointment.id}/confirm`, headers: authHeader(), payload: {} });
    const completeRes = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "PIX" } },
    });
    expect(completeRes.statusCode).toBe(200);

    await fireDueNotifications(); // receipt é agendado pra "agora", já vence sem precisar forçar

    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { eventType: "notification.due", aggregateId: { in: await notificationIdsFor(`receipt:${appointment.id}`) } },
    });
    const payload = event.payload as { recipient: { phone: string; name: string }; message: { text: string } };
    expect(payload.recipient.phone).toBe(clientPhone);
    expect(payload.message.text).toContain("R$ 50,00");
    expect(payload.message.text).toContain("Pix");
  });

  it("OTP: sem cliente ainda existir, o telefone vem do payload da própria notificação", async () => {
    const phone = "+5511955554444";
    await requestOtp(phone);
    await fireDueNotifications();

    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { eventType: "notification.due" } });
    const payload = event.payload as { clientId: string | null; recipient: { phone: string }; message: { text: string } };
    expect(payload.clientId).toBeNull();
    expect(payload.recipient.phone).toBe(phone);
    expect(payload.message.text).toMatch(/^\d{6} é o seu código/);
  });

  it("sem telefone resolvível, a notificação falha e nenhum evento é emitido", async () => {
    await prisma.notification.create({
      data: {
        clientId: null,
        channel: "WHATSAPP",
        template: "otp_code",
        payload: { code: "123456", expiresInMin: 5 }, // sem `phone` no payload, de propósito
        scheduledFor: new Date(Date.now() - 1000),
        dedupKey: "teste:sem-telefone",
      },
    });

    const fired = await fireDueNotifications();
    expect(fired).toBe(1); // "disparado" = processado, não necessariamente enviado

    const notification = await prisma.notification.findFirstOrThrow({ where: { dedupKey: "teste:sem-telefone" } });
    expect(notification.status).toBe("FAILED");

    const events = await prisma.outboxEvent.count({ where: { eventType: "notification.due" } });
    expect(events).toBe(0);
  });

  it("cliente com e-mail cadastrado continua recebendo o canal EMAIL normalmente (sem regressão)", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: authHeader(),
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt: nextWeekdayAt(14) },
    });
    const appointment = createRes.json();
    await forcePastDue(`reminder-email:${appointment.id}`);
    await forcePastDue(`reminder:${appointment.id}`);

    await fireDueNotifications();

    const emailNotification = await prisma.notification.findFirstOrThrow({
      where: { dedupKey: `reminder-email:${appointment.id}` },
    });
    // sem RESEND_API_KEY configurada no ambiente de teste, o envio falha — o
    // que importa aqui é que o caminho de e-mail ainda RODA (não quebrou
    // com a mudança no dispatcher), não que a Resend aceite de verdade.
    expect(["SENT", "FAILED"]).toContain(emailNotification.status);
  });

  async function notificationIdsFor(dedupKey: string): Promise<string[]> {
    const notification = await prisma.notification.findUnique({ where: { dedupKey } });
    return notification ? [notification.id] : [];
  }
});
