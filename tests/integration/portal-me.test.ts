import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma.js";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import {
  clientLogin,
  createAdmin,
  createBarberWithService,
  createClientUser,
  seedShopSettings,
  staffLogin,
} from "../setup/fixtures.js";
import { nextWeekdayAt } from "../setup/dates.js";

/**
 * Portal do cliente (Fase 0): GET/PATCH /me não pode vazar o `User` cru —
 * `passwordHash`/`failedLoginAttempts`/`lockedUntil` não têm nada a fazer
 * numa resposta que vai direto pra tela de Perfil de um app público.
 */
describe("GET/PATCH /me — não vaza o User cru", () => {
  let app: FastifyInstance;
  let clientToken: string;
  let clientPhone: string;

  beforeEach(async () => {
    await resetDatabase();
    const { user } = await createClientUser({ email: "cliente@teste.dev" });
    clientPhone = user.phone;
    app = await createTestApp();
    ({ accessToken: clientToken } = await clientLogin(app, clientPhone));
  });

  afterEach(async () => {
    await app.close();
  });

  function authHeader() {
    return { authorization: `Bearer ${clientToken}` };
  }

  it("GET /me devolve phone/email do usuário, mas não passwordHash/failedLoginAttempts/lockedUntil", async () => {
    const res = await app.inject({ method: "GET", url: "/me", headers: authHeader() });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.user.phone).toBe(clientPhone);
    expect(body.user.email).toBe("cliente@teste.dev");
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(body.user).not.toHaveProperty("failedLoginAttempts");
    expect(body.user).not.toHaveProperty("lockedUntil");
    expect(body.user).not.toHaveProperty("role");
  });

  it("PATCH /me também não vaza o User cru na resposta atualizada", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: authHeader(),
      payload: { fullName: "Nome Atualizado" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.fullName).toBe("Nome Atualizado");
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(body.user).not.toHaveProperty("failedLoginAttempts");
  });
});

describe("GET /me/appointments e /me/appointments/last — inclui review", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let clientToken: string;
  let barberId: string;
  let serviceId: string;
  let clientId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedShopSettings();
    const admin = await createAdmin();
    const { barber, service } = await createBarberWithService();
    const { user: clientUser, client } = await createClientUser();
    barberId = barber.id;
    serviceId = service.id;
    clientId = client.id;

    app = await createTestApp();
    ({ accessToken: adminToken } = await staffLogin(app, admin.user.email!, admin.password));
    ({ accessToken: clientToken } = await clientLogin(app, clientUser.phone));
  });

  afterEach(async () => {
    await app.close();
  });

  async function createConcludedAppointment() {
    const createRes = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt: nextWeekdayAt(10) },
    });
    const appointment = createRes.json();
    // status CONCLUIDO some sozinho não move o agendamento pro passado — scope=past
    // filtra por startsAt, então startsAt também precisa recuar.
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: "CONCLUIDO", startsAt: new Date(Date.now() - 24 * 3_600_000) },
    });
    return appointment.id;
  }

  it("agendamento concluído sem avaliação traz review: null", async () => {
    await createConcludedAppointment();

    const res = await app.inject({
      method: "GET",
      url: "/me/appointments?scope=past",
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().appointments[0].review).toBeNull();

    const lastRes = await app.inject({
      method: "GET",
      url: "/me/appointments/last",
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(lastRes.json().appointment.review).toBeNull();
  });

  it("depois de avaliado, review vem populado nos dois endpoints", async () => {
    const appointmentId = await createConcludedAppointment();

    const reviewRes = await app.inject({
      method: "POST",
      url: `/me/appointments/${appointmentId}/review`,
      headers: { authorization: `Bearer ${clientToken}` },
      payload: { rating: 5, comment: "Muito bom" },
    });
    expect(reviewRes.statusCode).toBe(201);

    const res = await app.inject({
      method: "GET",
      url: "/me/appointments?scope=past",
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(res.json().appointments[0].review).toMatchObject({ rating: 5, comment: "Muito bom" });

    const lastRes = await app.inject({
      method: "GET",
      url: "/me/appointments/last",
      headers: { authorization: `Bearer ${clientToken}` },
    });
    expect(lastRes.json().appointment.review).toMatchObject({ rating: 5 });
  });
});
