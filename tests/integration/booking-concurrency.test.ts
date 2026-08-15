import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma.js";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { createAdmin, createBarberWithService, createClientUser, seedShopSettings, staffLogin } from "../setup/fixtures.js";
import { nextWeekdayAt } from "../setup/dates.js";

/**
 * A garantia mais importante do sistema (docs/ARQUITETURA.md §03): a
 * constraint de exclusão do Postgres nunca deixa dois agendamentos
 * sobrepostos para o mesmo barbeiro existirem, não importa a concorrência.
 * Versão automatizada de scripts/concurrency-test.ts.
 */
describe("reserva de agendamento — anti double-booking", () => {
  let app: FastifyInstance;
  let accessToken: string;
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
    ({ accessToken } = await staffLogin(app, admin.user.email!, admin.password));
  });

  afterEach(async () => {
    await app.close();
  });

  it("50 requisições simultâneas para o mesmo horário: exatamente uma vence", async () => {
    const startsAt = nextWeekdayAt(10);

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        app.inject({
          method: "POST",
          url: "/appointments",
          headers: { authorization: `Bearer ${accessToken}` },
          payload: { barberId, clientId, serviceIds: [serviceId], startsAt },
        }),
      ),
    );

    const created = results.filter((r) => r.statusCode === 201);
    const conflicted = results.filter((r) => r.statusCode === 409);

    expect(created).toHaveLength(1);
    expect(conflicted).toHaveLength(49);
    expect(conflicted.every((r) => r.json().title === "SLOT_TAKEN")).toBe(true);

    const count = await prisma.appointment.count({ where: { barberId, status: { not: "CANCELADO" } } });
    expect(count).toBe(1);
  });

  it("um horário colado ao fim de outro (sem sobreposição real) é aceito", async () => {
    const first = nextWeekdayAt(9);

    const firstRes = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt: first },
    });
    expect(firstRes.statusCode).toBe(201);
    const firstAppointment = firstRes.json();

    // o serviço dura 30min + 5min de buffer = 35min — colar exatamente no fim não deve colidir
    const secondRes = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt: firstAppointment.endsAt },
    });
    expect(secondRes.statusCode).toBe(201);
  });

  it("horário fora do expediente é recusado", async () => {
    const midnight = nextWeekdayAt(23);
    const res = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt: midnight },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("OUTSIDE_WORKING_HOURS");
  });

  it("agendamento cancelado libera o horário para outro cliente", async () => {
    const startsAt = nextWeekdayAt(10);

    const firstRes = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt },
    });
    const appointment = firstRes.json();

    const cancelRes = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/cancel`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { actorType: "ADMIN" },
    });
    expect(cancelRes.statusCode).toBe(200);

    const secondRes = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt },
    });
    expect(secondRes.statusCode).toBe(201);
  });
});
