import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma.js";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import {
  createAdmin,
  createBarberWithService,
  createClientUser,
  createService,
  enableBarberService,
  seedShopSettings,
  staffLogin,
} from "../setup/fixtures.js";
import { nextWeekdayAt } from "../setup/dates.js";

describe("pacotes e créditos de cliente", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let clientId: string;
  let barberId: string;
  let serviceId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedShopSettings();
    const admin = await createAdmin();
    const { client } = await createClientUser();
    const { barber, service } = await createBarberWithService();
    clientId = client.id;
    barberId = barber.id;
    serviceId = service.id;

    app = await createTestApp();
    ({ accessToken: adminToken } = await staffLogin(app, admin.user.email!, admin.password));
  });

  afterEach(async () => {
    await app.close();
  });

  function authHeader() {
    return { authorization: `Bearer ${adminToken}` };
  }

  async function createPackage(overrides: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: "POST",
      url: "/packages",
      headers: authHeader(),
      payload: {
        name: "Combo 5 cortes",
        priceCents: 20000,
        creditsQty: 5,
        validityDays: 90,
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function purchase(packageId: string) {
    const res = await app.inject({
      method: "POST",
      url: `/clients/${clientId}/packages`,
      headers: authHeader(),
      payload: { packageId, method: "PIX" },
    });
    return res;
  }

  async function createAppointment(overrides: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: authHeader(),
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt: nextWeekdayAt(10), ...overrides },
    });
    expect(res.statusCode).toBe(201);
    const appointment = res.json();
    await app.inject({ method: "POST", url: `/appointments/${appointment.id}/confirm`, headers: authHeader(), payload: {} });
    return appointment;
  }

  it("cadastro de pacote é restrito a ADMIN; catálogo é público", async () => {
    const pkg = await createPackage();
    expect(pkg.creditsQty).toBe(5);

    const listRes = await app.inject({ method: "GET", url: "/packages" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().packages.map((p: { id: string }) => p.id)).toContain(pkg.id);

    const getRes = await app.inject({ method: "GET", url: `/packages/${pkg.id}` });
    expect(getRes.statusCode).toBe(200);

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/packages/${pkg.id}`,
      headers: authHeader(),
      payload: { priceCents: 18000 },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().priceCents).toBe(18000);
  });

  it("compra gera ClientPackage com créditos e vencimento corretos, mais um pagamento PAID", async () => {
    const pkg = await createPackage({ creditsQty: 3, validityDays: 30 });
    const beforePurchase = Date.now();
    const res = await purchase(pkg.id);
    expect(res.statusCode).toBe(201);
    const clientPackage = res.json();
    expect(clientPackage.creditsTotal).toBe(3);
    expect(clientPackage.status).toBe("ACTIVE");
    expect(clientPackage.payment.amountCents).toBe(pkg.priceCents);
    expect(clientPackage.payment.status).toBe("PAID");

    const expiresAt = new Date(clientPackage.expiresAt).getTime();
    const expectedExpiry = beforePurchase + 30 * 24 * 60 * 60_000;
    expect(Math.abs(expiresAt - expectedExpiry)).toBeLessThan(60_000);

    const listRes = await app.inject({ method: "GET", url: `/clients/${clientId}/packages`, headers: authHeader() });
    expect(listRes.statusCode).toBe(200);
    const listed = listRes.json().packages[0];
    expect(listed.creditsRemaining).toBe(3);
    expect(listed.isExpired).toBe(false);
  });

  it("recusa comprar pacote inativo (422) ou pra cliente inexistente (404)", async () => {
    const pkg = await createPackage({ active: false });
    const inactiveRes = await purchase(pkg.id);
    expect(inactiveRes.statusCode).toBe(422);
    expect(inactiveRes.json().title).toBe("PACKAGE_INACTIVE");

    const activePkg = await createPackage();
    const badClientRes = await app.inject({
      method: "POST",
      url: "/clients/id-que-nao-existe/packages",
      headers: authHeader(),
      payload: { packageId: activePkg.id, method: "PIX" },
    });
    expect(badClientRes.statusCode).toBe(404);
    expect(badClientRes.json().title).toBe("CLIENT_NOT_FOUND");
  });

  it("concluir atendimento com method=PACKAGE consome 1 crédito e zera o valor cobrado", async () => {
    const pkg = await createPackage({ creditsQty: 2 });
    const purchased = (await purchase(pkg.id)).json();
    const appointment = await createAppointment();

    const completeRes = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "PACKAGE", clientPackageId: purchased.id } },
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().payment.amountCents).toBe(0);
    expect(completeRes.json().pointsEarned).toBe(0);

    const listRes = await app.inject({ method: "GET", url: `/clients/${clientId}/packages`, headers: authHeader() });
    expect(listRes.json().packages[0].creditsRemaining).toBe(1);
  });

  it("escopo do pacote: serviço fora do scopeServiceIds recusa consumo (422)", async () => {
    const otherService = await createService({ name: "Serviço fora do escopo" });
    await enableBarberService(barberId, otherService.id);

    const pkg = await createPackage({ creditsQty: 2, scopeServiceIds: [serviceId] });
    const purchased = (await purchase(pkg.id)).json();
    const appointment = await createAppointment({ serviceIds: [otherService.id] });

    const completeRes = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "PACKAGE", clientPackageId: purchased.id } },
    });
    expect(completeRes.statusCode).toBe(422);
    expect(completeRes.json().title).toBe("CLIENT_PACKAGE_SCOPE_MISMATCH");
  });

  it("sem créditos restantes recusa novo consumo (422 NO_CREDITS_LEFT)", async () => {
    const pkg = await createPackage({ creditsQty: 1 });
    const purchased = (await purchase(pkg.id)).json();

    const first = await createAppointment();
    const firstComplete = await app.inject({
      method: "POST",
      url: `/appointments/${first.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "PACKAGE", clientPackageId: purchased.id } },
    });
    expect(firstComplete.statusCode).toBe(200);

    const second = await createAppointment({ startsAt: nextWeekdayAt(11) });
    const secondComplete = await app.inject({
      method: "POST",
      url: `/appointments/${second.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "PACKAGE", clientPackageId: purchased.id } },
    });
    expect(secondComplete.statusCode).toBe(422);
    expect(secondComplete.json().title).toBe("NO_CREDITS_LEFT");
  });

  it("pacote vencido recusa consumo (422 CLIENT_PACKAGE_EXPIRED)", async () => {
    const pkg = await createPackage({ creditsQty: 1 });
    const purchased = (await purchase(pkg.id)).json();
    await prisma.clientPackage.update({ where: { id: purchased.id }, data: { expiresAt: new Date("2000-01-01") } });

    const appointment = await createAppointment();
    const completeRes = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "PACKAGE", clientPackageId: purchased.id } },
    });
    expect(completeRes.statusCode).toBe(422);
    expect(completeRes.json().title).toBe("CLIENT_PACKAGE_EXPIRED");
  });

  it("pacote de outro cliente não pode ser usado (403 CLIENT_PACKAGE_NOT_OWNED)", async () => {
    const pkg = await createPackage({ creditsQty: 1 });
    const purchased = (await purchase(pkg.id)).json();

    const { client: otherClient } = await createClientUser();
    const otherAppointment = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: authHeader(),
      payload: { barberId, clientId: otherClient.id, serviceIds: [serviceId], startsAt: nextWeekdayAt(10) },
    });
    const appointment = otherAppointment.json();
    await app.inject({ method: "POST", url: `/appointments/${appointment.id}/confirm`, headers: authHeader(), payload: {} });

    const completeRes = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "PACKAGE", clientPackageId: purchased.id } },
    });
    expect(completeRes.statusCode).toBe(403);
    expect(completeRes.json().title).toBe("CLIENT_PACKAGE_NOT_OWNED");
  });
});
