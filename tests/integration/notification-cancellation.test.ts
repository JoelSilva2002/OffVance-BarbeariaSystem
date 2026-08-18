import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma.js";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { clientLogin, createAdmin, createBarberWithService, createClientUser, seedShopSettings, staffLogin } from "../setup/fixtures.js";
import { nextWeekdayAt } from "../setup/dates.js";

/**
 * Fase 5 do plano WhatsApp/n8n: "a fatia que prova a arquitetura" — mensagem
 * nova pro cliente (cancelamento/remarcação) entrando com ZERO mudança em
 * n8n, porque a API já resolve destinatário/texto/canal pra qualquer
 * template (Fase 2). Só o backend sabe quem cancelou/remarcou
 * (`appointmentEventPayload()` não carrega `actorType`) — por isso o
 * early-return quando `actorType === "CLIENT"` é testado tão explicitamente
 * quanto o caminho que efetivamente cria o aviso.
 */
describe("aviso de cancelamento e remarcação", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let barberId: string;
  let serviceId: string;
  let clientId: string;
  let clientPhone: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedShopSettings();
    const admin = await createAdmin();
    const { barber, service } = await createBarberWithService();
    const { user: clientUser, client } = await createClientUser();
    barberId = barber.id;
    serviceId = service.id;
    clientId = client.id;
    clientPhone = clientUser.phone;

    app = await createTestApp();
    ({ accessToken: adminToken } = await staffLogin(app, admin.user.email!, admin.password));
  });

  afterEach(async () => {
    await app.close();
  });

  function authHeader() {
    return { authorization: `Bearer ${adminToken}` };
  }

  async function createAppointment(startsAt = nextWeekdayAt(14)) {
    const res = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: authHeader(),
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it("cancelamento pela equipe cria o aviso (PENDING) e mata o lembrete pendente (CANCELLED)", async () => {
    const appointment = await createAppointment();

    const reminderBefore = await prisma.notification.findUniqueOrThrow({ where: { dedupKey: `reminder:${appointment.id}` } });
    expect(reminderBefore.status).toBe("PENDING");

    const res = await app.inject({ method: "POST", url: `/appointments/${appointment.id}/cancel`, headers: authHeader(), payload: {} });
    expect(res.statusCode).toBe(200);

    const reminderAfter = await prisma.notification.findUniqueOrThrow({ where: { dedupKey: `reminder:${appointment.id}` } });
    expect(reminderAfter.status).toBe("CANCELLED");

    const cancellation = await prisma.notification.findUniqueOrThrow({ where: { dedupKey: `cancellation:${appointment.id}` } });
    expect(cancellation.status).toBe("PENDING");
    expect(cancellation.channel).toBe("WHATSAPP");
    expect(cancellation.clientId).toBe(clientId);
    expect(cancellation.template).toBe("appointment_cancelled");
  });

  it("cancelar de novo não duplica o aviso (upsert por dedup_key, update: {})", async () => {
    const appointment = await createAppointment();
    await app.inject({ method: "POST", url: `/appointments/${appointment.id}/cancel`, headers: authHeader(), payload: {} });

    const count = await prisma.notification.count({ where: { dedupKey: `cancellation:${appointment.id}` } });
    expect(count).toBe(1);
  });

  it("cancelamento pelo próprio cliente NÃO cria aviso — ele já sabe que cancelou", async () => {
    const appointment = await createAppointment();
    const { accessToken: clientToken } = await clientLogin(app, clientPhone);

    const res = await app.inject({
      method: "POST",
      url: `/me/appointments/${appointment.id}/cancel`,
      headers: { authorization: `Bearer ${clientToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    const cancellation = await prisma.notification.findUnique({ where: { dedupKey: `cancellation:${appointment.id}` } });
    expect(cancellation).toBeNull();
    // o lembrete continua morrendo normalmente — só o aviso extra que não existe
    const reminder = await prisma.notification.findUniqueOrThrow({ where: { dedupKey: `reminder:${appointment.id}` } });
    expect(reminder.status).toBe("CANCELLED");
  });

  it("remarcação pela equipe grava o horário anterior e re-arma o lembrete", async () => {
    const oldStartsAt = nextWeekdayAt(10);
    const appointment = await createAppointment(oldStartsAt);

    // simula lembrete já enviado, pra provar que a remarcação de fato re-arma (não só cria o aviso à parte)
    await prisma.notification.update({
      where: { dedupKey: `reminder:${appointment.id}` },
      data: { status: "SENT", sentAt: new Date() },
    });

    const newStartsAt = nextWeekdayAt(15);
    const res = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/reschedule`,
      headers: authHeader(),
      payload: { startsAt: newStartsAt },
    });
    expect(res.statusCode).toBe(200);

    const reminderAfter = await prisma.notification.findUniqueOrThrow({ where: { dedupKey: `reminder:${appointment.id}` } });
    expect(reminderAfter.status).toBe("PENDING");

    const notice = await prisma.notification.findUniqueOrThrow({ where: { dedupKey: `reschedule:${appointment.id}` } });
    expect(notice.status).toBe("PENDING");
    expect(notice.template).toBe("appointment_rescheduled");
    const payload = notice.payload as { previousStartsAt: string; startsAt: string };
    expect(new Date(payload.previousStartsAt).toISOString()).toBe(new Date(oldStartsAt).toISOString());
    expect(new Date(payload.startsAt).toISOString()).toBe(new Date(newStartsAt).toISOString());
  });

  it("segunda remarcação reenvia (scheduledFor/status re-armados, não presos na primeira)", async () => {
    const appointment = await createAppointment(nextWeekdayAt(9));
    await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/reschedule`,
      headers: authHeader(),
      payload: { startsAt: nextWeekdayAt(11) },
    });
    await prisma.notification.update({
      where: { dedupKey: `reschedule:${appointment.id}` },
      data: { status: "SENT", sentAt: new Date() },
    });

    const secondStartsAt = nextWeekdayAt(16);
    await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/reschedule`,
      headers: authHeader(),
      payload: { startsAt: secondStartsAt },
    });

    const notice = await prisma.notification.findUniqueOrThrow({ where: { dedupKey: `reschedule:${appointment.id}` } });
    expect(notice.status).toBe("PENDING");
    const payload = notice.payload as { startsAt: string };
    expect(new Date(payload.startsAt).toISOString()).toBe(new Date(secondStartsAt).toISOString());
  });

  it("remarcação pelo próprio cliente NÃO cria aviso", async () => {
    const appointment = await createAppointment();
    const { accessToken: clientToken } = await clientLogin(app, clientPhone);

    const res = await app.inject({
      method: "POST",
      url: `/me/appointments/${appointment.id}/reschedule`,
      headers: { authorization: `Bearer ${clientToken}` },
      payload: { startsAt: nextWeekdayAt(16) },
    });
    expect(res.statusCode).toBe(200);

    const notice = await prisma.notification.findUnique({ where: { dedupKey: `reschedule:${appointment.id}` } });
    expect(notice).toBeNull();
  });
});
