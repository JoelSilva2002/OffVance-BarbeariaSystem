import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { createAdmin, createBarberWithService, createClientUser, seedShopSettings, staffLogin } from "../setup/fixtures.js";
import { nextWeekdayAt } from "../setup/dates.js";

// Padrão default de shop-settings (docs/ARQUITETURA.md §06): 1 ponto por
// R$1 gasto, cada ponto vale 5 centavos no resgate.
describe("fidelidade (pontos ganhos/resgatados em atendimentos)", () => {
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
    const { barber, service } = await createBarberWithService({ priceCents: 5000 });
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

  async function createConfirmedAppointment(startsAt: string) {
    const res = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: authHeader(),
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt },
    });
    expect(res.statusCode).toBe(201);
    const appointment = res.json();
    await app.inject({ method: "POST", url: `/appointments/${appointment.id}/confirm`, headers: authHeader(), payload: {} });
    return appointment;
  }

  async function getSummary() {
    const res = await app.inject({ method: "GET", url: `/clients/${clientId}/loyalty`, headers: authHeader() });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  it("concluir atendimento pago em dinheiro credita pontos proporcionais ao valor pago", async () => {
    const appointment = await createConfirmedAppointment(nextWeekdayAt(10));
    const completeRes = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "CASH" } },
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().pointsEarned).toBe(50);

    const summary = await getSummary();
    expect(summary.balance).toBe(50);
    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0]).toMatchObject({ deltaPoints: 50, reason: "EARN", refType: "appointment", refId: appointment.id });
  });

  it("resgate abate do valor cobrado e reduz o saldo; pontos novos incidem só sobre o valor efetivamente pago", async () => {
    const first = await createConfirmedAppointment(nextWeekdayAt(10));
    await app.inject({
      method: "POST",
      url: `/appointments/${first.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "CASH" } },
    });
    // saldo agora: 50 pontos

    const second = await createConfirmedAppointment(nextWeekdayAt(11));
    const completeRes = await app.inject({
      method: "POST",
      url: `/appointments/${second.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "CASH", redeemPoints: 10 } },
    });
    expect(completeRes.statusCode).toBe(200);
    // 10 pontos * 5 centavos = 50 centavos de desconto sobre 5000 -> pago 4950 -> ganha floor(49.5) = 49
    expect(completeRes.json().payment.amountCents).toBe(4950);
    expect(completeRes.json().pointsEarned).toBe(49);

    const summary = await getSummary();
    expect(summary.balance).toBe(50 - 10 + 49);
    expect(summary.entries.map((e: { reason: string }) => e.reason)).toEqual(["EARN", "REDEEM", "EARN"]);
  });

  it("resgatar mais pontos do que o saldo disponível é recusado com 422", async () => {
    const appointment = await createConfirmedAppointment(nextWeekdayAt(10));
    const completeRes = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "CASH", redeemPoints: 999 } },
    });
    expect(completeRes.statusCode).toBe(422);
    expect(completeRes.json().title).toBe("INSUFFICIENT_LOYALTY_POINTS");

    const summary = await getSummary();
    expect(summary.balance).toBe(0);
  });

  it("pagar com pacote não gera pontos novos (o dinheiro já entrou na compra do pacote)", async () => {
    const pkgRes = await app.inject({
      method: "POST",
      url: "/packages",
      headers: authHeader(),
      payload: { name: "Pacote", priceCents: 10000, creditsQty: 1, validityDays: 30 },
    });
    const pkg = pkgRes.json();
    const purchaseRes = await app.inject({
      method: "POST",
      url: `/clients/${clientId}/packages`,
      headers: authHeader(),
      payload: { packageId: pkg.id, method: "PIX" },
    });
    const clientPackage = purchaseRes.json();

    const appointment = await createConfirmedAppointment(nextWeekdayAt(10));
    const completeRes = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "PACKAGE", clientPackageId: clientPackage.id } },
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().pointsEarned).toBe(0);

    const summary = await getSummary();
    expect(summary.balance).toBe(0);
    expect(summary.entries).toHaveLength(0);
  });

  it("consultar saldo de fidelidade exige sessão de equipe (401 sem token)", async () => {
    const res = await app.inject({ method: "GET", url: `/clients/${clientId}/loyalty` });
    expect(res.statusCode).toBe(401);
  });
});
