import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { createAdmin, createBarberWithSchedule, seedShopSettings, staffLogin } from "../setup/fixtures.js";

describe("configuração da loja (shop-settings)", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedShopSettings();
    const admin = await createAdmin();
    app = await createTestApp();
    ({ accessToken: adminToken } = await staffLogin(app, admin.user.email!, admin.password));
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET exige sessão de equipe; PATCH exige ADMIN (BARBER recebe 403)", async () => {
    const unauth = await app.inject({ method: "GET", url: "/shop-settings" });
    expect(unauth.statusCode).toBe(401);

    const getRes = await app.inject({
      method: "GET",
      url: "/shop-settings",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().loyaltyPointsExpirationDays).toBeNull();

    const { user: barberUser, password } = await createBarberWithSchedule();
    const { accessToken: barberToken } = await staffLogin(app, barberUser.email!, password);
    const patchAsBarber = await app.inject({
      method: "PATCH",
      url: "/shop-settings",
      headers: { authorization: `Bearer ${barberToken}` },
      payload: { loyaltyPointsExpirationDays: 90 },
    });
    expect(patchAsBarber.statusCode).toBe(403);
  });

  it("PATCH atualiza campos parcialmente; null desliga expiração de pontos de novo", async () => {
    const setRes = await app.inject({
      method: "PATCH",
      url: "/shop-settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { loyaltyPointsExpirationDays: 180, cancelDeadlineHours: 4 },
    });
    expect(setRes.statusCode).toBe(200);
    expect(setRes.json().loyaltyPointsExpirationDays).toBe(180);
    expect(setRes.json().cancelDeadlineHours).toBe(4);
    // campo não enviado permanece intocado
    expect(setRes.json().minLeadTimeMin).toBe(60);

    const unsetRes = await app.inject({
      method: "PATCH",
      url: "/shop-settings",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { loyaltyPointsExpirationDays: null },
    });
    expect(unsetRes.statusCode).toBe(200);
    expect(unsetRes.json().loyaltyPointsExpirationDays).toBeNull();
  });
});
