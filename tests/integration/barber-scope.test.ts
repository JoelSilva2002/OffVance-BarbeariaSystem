import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import {
  createBarberWithSchedule,
  createClientUser,
  createService,
  enableBarberService,
  seedShopSettings,
  staffLogin,
} from "../setup/fixtures.js";
import { nextWeekdayAt } from "../setup/dates.js";

describe("escopo por barbeiro (assertBarberScope)", () => {
  let app: FastifyInstance;
  let joaoToken: string;
  let pedroToken: string;
  let joaoBarberId: string;
  let pedroBarberId: string;
  let serviceId: string;
  let clientId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedShopSettings();
    app = await createTestApp();

    const joao = await createBarberWithSchedule({ displayName: "João" });
    const pedro = await createBarberWithSchedule({ displayName: "Pedro" });
    const service = await createService();
    await enableBarberService(joao.barber.id, service.id);
    await enableBarberService(pedro.barber.id, service.id);
    const { client } = await createClientUser();

    joaoBarberId = joao.barber.id;
    pedroBarberId = pedro.barber.id;
    serviceId = service.id;
    clientId = client.id;

    joaoToken = (await staffLogin(app, joao.user.email!, joao.password)).accessToken;
    pedroToken = (await staffLogin(app, pedro.user.email!, pedro.password)).accessToken;
  });

  afterEach(async () => {
    await app.close();
  });

  it("barbeiro não vê a grade de outro barbeiro", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/barbers/${pedroBarberId}/schedule`,
      headers: { authorization: `Bearer ${joaoToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("barbeiro vê a própria grade", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/barbers/${joaoBarberId}/schedule`,
      headers: { authorization: `Bearer ${joaoToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("barbeiro não vê a agenda de outro barbeiro", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/barbers/${pedroBarberId}/agenda?date=2026-08-18`,
      headers: { authorization: `Bearer ${joaoToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("barbeiro não cria agendamento em nome de outro barbeiro", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${joaoToken}` },
      payload: { barberId: pedroBarberId, clientId, serviceIds: [serviceId], startsAt: nextWeekdayAt(10) },
    });
    expect(res.statusCode).toBe(403);
  });

  it("barbeiro cria agendamento pra si mesmo normalmente", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${joaoToken}` },
      payload: { barberId: joaoBarberId, clientId, serviceIds: [serviceId], startsAt: nextWeekdayAt(10) },
    });
    expect(res.statusCode).toBe(201);
  });

  it("barbeiro não confirma agendamento de outro barbeiro; o dono do agendamento consegue", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${pedroToken}` },
      payload: { barberId: pedroBarberId, clientId, serviceIds: [serviceId], startsAt: nextWeekdayAt(10) },
    });
    const appointment = createRes.json();

    const blocked = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/confirm`,
      headers: { authorization: `Bearer ${joaoToken}` },
      payload: {},
    });
    expect(blocked.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/confirm`,
      headers: { authorization: `Bearer ${pedroToken}` },
      payload: {},
    });
    expect(allowed.statusCode).toBe(200);
  });

  it("listar agendamentos como barbeiro ignora barberId de outro e mostra só os próprios", async () => {
    await app.inject({
      method: "POST",
      url: "/appointments",
      headers: { authorization: `Bearer ${joaoToken}` },
      payload: { barberId: joaoBarberId, clientId, serviceIds: [serviceId], startsAt: nextWeekdayAt(10) },
    });

    const res = await app.inject({
      method: "GET",
      url: `/appointments?barberId=${pedroBarberId}`,
      headers: { authorization: `Bearer ${joaoToken}` },
    });
    expect(res.statusCode).toBe(200);
    const appointments = res.json().appointments as { barberId: string }[];
    expect(appointments.every((a) => a.barberId === joaoBarberId)).toBe(true);
  });
});
