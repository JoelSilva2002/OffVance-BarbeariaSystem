import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { DateTime } from "luxon";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import {
  createAdmin,
  createBarberWithSchedule,
  createBarberWithService,
  createClientUser,
  seedShopSettings,
  staffLogin,
} from "../setup/fixtures.js";
import { nextWeekdayAt } from "../setup/dates.js";

const TZ = "America/Sao_Paulo";
function isoDateOf(iso: string): string {
  return DateTime.fromISO(iso, { setZone: true }).setZone(TZ).toISODate()!;
}
function todayIso(): string {
  return DateTime.now().setZone(TZ).toISODate()!;
}

describe("relatórios (dashboards de agendamento e financeiro)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let barberId: string;
  let serviceId: string;
  let clientId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedShopSettings();
    const admin = await createAdmin();
    const { barber, service } = await createBarberWithService({ durationMin: 30, bufferAfterMin: 5, priceCents: 5000 });
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

  function authHeader() {
    return { authorization: `Bearer ${adminToken}` };
  }

  async function createAppointment(startsAt: string) {
    const res = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: authHeader(),
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  async function confirm(id: string) {
    const res = await app.inject({ method: "POST", url: `/appointments/${id}/confirm`, headers: authHeader(), payload: {} });
    expect(res.statusCode).toBe(200);
  }

  describe("acesso", () => {
    it("é restrito a ADMIN: barbeiro recebe 403, sem token recebe 401", async () => {
      const { user: barberUser, password } = await createBarberWithSchedule();
      const { accessToken: barberToken } = await staffLogin(app, barberUser.email!, password);
      const today = todayIso();

      const asBarber = await app.inject({
        method: "GET",
        url: `/reports/appointments?from=${today}&to=${today}`,
        headers: { authorization: `Bearer ${barberToken}` },
      });
      expect(asBarber.statusCode).toBe(403);

      const unauth = await app.inject({ method: "GET", url: `/reports/revenue?from=${today}&to=${today}` });
      expect(unauth.statusCode).toBe(401);
    });
  });

  describe("dashboard de agendamentos", () => {
    it("agrupa por dia, calcula taxa de no-show/cancelamento e ocupação por barbeiro", async () => {
      const apt1 = await createAppointment(nextWeekdayAt(9, 3));
      await confirm(apt1.id);
      const completeRes = await app.inject({
        method: "POST",
        url: `/appointments/${apt1.id}/complete`,
        headers: authHeader(),
        payload: { payment: { method: "CASH" } },
      });
      expect(completeRes.statusCode).toBe(200);

      const apt2 = await createAppointment(nextWeekdayAt(9, 7));
      await confirm(apt2.id);
      const cancelRes = await app.inject({ method: "POST", url: `/appointments/${apt2.id}/cancel`, headers: authHeader(), payload: {} });
      expect(cancelRes.statusCode).toBe(200);

      const apt3 = await createAppointment(nextWeekdayAt(9, 11));
      await confirm(apt3.id);
      const noShowRes = await app.inject({ method: "POST", url: `/appointments/${apt3.id}/no-show`, headers: authHeader(), payload: {} });
      expect(noShowRes.statusCode).toBe(200);

      const dates = [apt1, apt2, apt3].map((a) => isoDateOf(a.startsAt));
      const from = dates.slice().sort()[0]!;
      const to = dates.slice().sort()[dates.length - 1]!;

      const res = await app.inject({
        method: "GET",
        url: `/reports/appointments?from=${from}&to=${to}&granularity=day&barberId=${barberId}`,
        headers: authHeader(),
      });
      expect(res.statusCode).toBe(200);
      const report = res.json();

      const bucketFor = (a: { startsAt: string }) => report.series.find((s: { period: string }) => s.period === isoDateOf(a.startsAt));

      const b1 = bucketFor(apt1);
      expect(b1.byStatus.CONCLUIDO).toBe(1);
      expect(b1.cancelRate).toBe(0);
      expect(b1.noShowRate).toBe(0);

      const b2 = bucketFor(apt2);
      expect(b2.byStatus.CANCELADO).toBe(1);
      expect(b2.cancelRate).toBe(1);

      const b3 = bucketFor(apt3);
      expect(b3.byStatus.NAO_COMPARECEU).toBe(1);
      expect(b3.noShowRate).toBe(1);

      const occupancy = report.occupancyByBarber.find((o: { barberId: string }) => o.barberId === barberId);
      expect(occupancy).toBeDefined();
      // CANCELADO não ocupa a agenda pra fins de ocupação; CONCLUIDO e NAO_COMPARECEU ocupam.
      const durationMin = (new Date(apt1.endsAt).getTime() - new Date(apt1.startsAt).getTime()) / 60_000;
      expect(occupancy.bookedMinutes).toBe(Math.round(durationMin * 2));
    });

    it("recusa `to` antes de `from` (422 INVALID_RANGE) e intervalo maior que o máximo (422 RANGE_TOO_LARGE)", async () => {
      const invalidOrder = await app.inject({
        method: "GET",
        url: "/reports/appointments?from=2026-06-10&to=2026-06-01",
        headers: authHeader(),
      });
      expect(invalidOrder.statusCode).toBe(422);
      expect(invalidOrder.json().title).toBe("INVALID_RANGE");

      const tooLarge = await app.inject({
        method: "GET",
        url: "/reports/appointments?from=2020-01-01&to=2026-01-01",
        headers: authHeader(),
      });
      expect(tooLarge.statusCode).toBe(422);
      expect(tooLarge.json().title).toBe("RANGE_TOO_LARGE");
    });
  });

  describe("dashboard financeiro", () => {
    it("soma receita de serviço/produto/pacote no período e quebra por barbeiro/serviço/método", async () => {
      // serviço
      const apt = await createAppointment(nextWeekdayAt(9, 3));
      await confirm(apt.id);
      const completeRes = await app.inject({
        method: "POST",
        url: `/appointments/${apt.id}/complete`,
        headers: authHeader(),
        payload: { payment: { method: "CASH" } },
      });
      expect(completeRes.statusCode).toBe(200);

      // produto
      const productRes = await app.inject({
        method: "POST",
        url: "/products",
        headers: authHeader(),
        payload: { name: "Produto", costPriceCents: 1000, salePriceCents: 3000, stockQty: 10 },
      });
      const product = productRes.json();
      const orderRes = await app.inject({
        method: "POST",
        url: "/orders",
        headers: authHeader(),
        payload: { clientId, method: "PIX", items: [{ productId: product.id, qty: 2 }] },
      });
      expect(orderRes.statusCode).toBe(201);

      // pacote
      const pkgRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: authHeader(),
        payload: { name: "Pacote", priceCents: 15000, creditsQty: 3, validityDays: 60 },
      });
      const pkg = pkgRes.json();
      const purchaseRes = await app.inject({
        method: "POST",
        url: `/clients/${clientId}/packages`,
        headers: authHeader(),
        payload: { packageId: pkg.id, method: "CREDIT_CARD" },
      });
      expect(purchaseRes.statusCode).toBe(201);

      const today = todayIso();
      const totalsRes = await app.inject({
        method: "GET",
        url: `/reports/revenue?from=${today}&to=${today}&granularity=month`,
        headers: authHeader(),
      });
      expect(totalsRes.statusCode).toBe(200);
      const totals = totalsRes.json();
      expect(totals.series).toHaveLength(1);
      expect(totals.series[0].serviceRevenueCents).toBe(5000);
      expect(totals.series[0].productRevenueCents).toBe(6000);
      expect(totals.series[0].packageRevenueCents).toBe(15000);
      expect(totals.series[0].totalRevenueCents).toBe(5000 + 6000 + 15000);

      const byBarberRes = await app.inject({
        method: "GET",
        url: `/reports/revenue?from=${today}&to=${today}&groupBy=barber`,
        headers: authHeader(),
      });
      const byBarber = byBarberRes.json().byBarber;
      expect(byBarber).toEqual([{ barberId, displayName: expect.any(String), serviceRevenueCents: 5000, commissionCents: 0 }]);

      const byServiceRes = await app.inject({
        method: "GET",
        url: `/reports/revenue?from=${today}&to=${today}&groupBy=service`,
        headers: authHeader(),
      });
      const byService = byServiceRes.json().byService;
      expect(byService).toEqual([{ serviceId, name: expect.any(String), revenueCents: 5000, count: 1 }]);

      const byMethodRes = await app.inject({
        method: "GET",
        url: `/reports/revenue?from=${today}&to=${today}&groupBy=method`,
        headers: authHeader(),
      });
      const byMethod = byMethodRes.json().byMethod as { method: string; amountCents: number; count: number }[];
      const cash = byMethod.find((m) => m.method === "CASH");
      const pix = byMethod.find((m) => m.method === "PIX");
      const card = byMethod.find((m) => m.method === "CREDIT_CARD");
      expect(cash).toEqual({ method: "CASH", amountCents: 5000, count: 1 });
      expect(pix).toEqual({ method: "PIX", amountCents: 6000, count: 1 });
      expect(card).toEqual({ method: "CREDIT_CARD", amountCents: 15000, count: 1 });

      expect(totals.productMargin).toEqual({
        revenueCents: 6000,
        costCents: 2000,
        marginCents: 4000,
        marginPct: expect.closeTo(4000 / 6000, 4),
      });
    });
  });
});
