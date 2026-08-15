import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma.js";
import { cleanupExpiredRefreshTokens } from "../../src/lib/refresh-tokens.js";
import { hashRefreshToken } from "../../src/lib/tokens.js";
import { expireLoyaltyPoints } from "../../src/modules/loyalty/loyalty.service.js";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { createAdmin, createBarberWithService, createClientUser, seedShopSettings, staffLogin } from "../setup/fixtures.js";
import { nextWeekdayAt } from "../setup/dates.js";

/**
 * Jobs de manutenção (chamados pelo loop de background em server.ts, não
 * por rota) — testados chamando a função diretamente, igual a qualquer
 * outra lógica de serviço.
 */
describe("manutenção em background", () => {
  describe("expireLoyaltyPoints", () => {
    let app: FastifyInstance;
    let adminToken: string;
    let barberId: string;
    let serviceId: string;
    let clientId: string;

    beforeEach(async () => {
      await resetDatabase();
      const admin = await createAdmin();
      const { client } = await createClientUser();
      const { barber, service } = await createBarberWithService({ priceCents: 10000 });
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

    async function completeAppointment(payment: Record<string, unknown>, startsAt = nextWeekdayAt(10)) {
      const createRes = await app.inject({
        method: "POST",
        url: "/appointments",
        headers: authHeader(),
        payload: { barberId, clientId, serviceIds: [serviceId], startsAt },
      });
      const appointment = createRes.json();
      await app.inject({ method: "POST", url: `/appointments/${appointment.id}/confirm`, headers: authHeader(), payload: {} });
      const res = await app.inject({
        method: "POST",
        url: `/appointments/${appointment.id}/complete`,
        headers: authHeader(),
        payload: { payment },
      });
      expect(res.statusCode).toBe(200);
      return res.json();
    }

    it("sem loyaltyPointsExpirationDays configurado, pontos ganhos nunca carregam expiresAt", async () => {
      await seedShopSettings();
      await completeAppointment({ method: "CASH" });

      const entry = await prisma.loyaltyEntry.findFirstOrThrow({ where: { clientId, reason: "EARN" } });
      expect(entry.expiresAt).toBeNull();

      const expiredCount = await expireLoyaltyPoints();
      expect(expiredCount).toBe(0);
    });

    it("baixa o saldo remanescente de um lote vencido; não toca em lote ainda dentro do prazo", async () => {
      await seedShopSettings({ loyaltyPointsExpirationDays: 30 });
      await completeAppointment({ method: "CASH" }); // ganha 100 pontos, expiresAt ~30 dias no futuro

      const entry = await prisma.loyaltyEntry.findFirstOrThrow({ where: { clientId, reason: "EARN" } });
      expect(entry.expiresAt).not.toBeNull();

      // ainda dentro do prazo: nada acontece
      expect(await expireLoyaltyPoints()).toBe(0);

      // empurra o vencimento pro passado, direto no banco — não dá pra esperar 30 dias de verdade
      await prisma.loyaltyEntry.update({ where: { id: entry.id }, data: { expiresAt: new Date("2000-01-01") } });

      const expiredCount = await expireLoyaltyPoints();
      expect(expiredCount).toBe(1);

      const balance = await prisma.loyaltyEntry.aggregate({ where: { clientId }, _sum: { deltaPoints: true } });
      expect(balance._sum.deltaPoints).toBe(0);

      const expireEntry = await prisma.loyaltyEntry.findFirstOrThrow({ where: { clientId, reason: "EXPIRE" } });
      expect(expireEntry.deltaPoints).toBe(-100);
      expect(expireEntry.refId).toBe(entry.id);
    });

    it("resgate parcial antes da expiração só baixa o que sobrou do lote (FIFO)", async () => {
      await seedShopSettings({ loyaltyPointsExpirationDays: 30 });
      await completeAppointment({ method: "CASH" }); // ganha 100 pontos
      const firstEarn = await prisma.loyaltyEntry.findFirstOrThrow({ where: { clientId, reason: "EARN" } });

      // resgata 30 (desconto de 150 centavos sobre 10000) e ganha de volta floor(9850/100) = 98
      const second = await completeAppointment({ method: "CASH", redeemPoints: 30 }, nextWeekdayAt(11));
      expect(second.pointsEarned).toBe(98);

      await prisma.loyaltyEntry.update({ where: { id: firstEarn.id }, data: { expiresAt: new Date("2000-01-01") } });
      await expireLoyaltyPoints();

      const expireEntry = await prisma.loyaltyEntry.findFirstOrThrow({ where: { clientId, reason: "EXPIRE" } });
      // 100 ganhos - 30 já resgatados = 70 restantes no lote, é só isso que expira
      expect(expireEntry.deltaPoints).toBe(-70);

      const balance = await prisma.loyaltyEntry.aggregate({ where: { clientId }, _sum: { deltaPoints: true } });
      // o lote antigo fecha em zero (100 - 30 - 70); só sobra o ganho da segunda visita
      expect(balance._sum.deltaPoints).toBe(98);
    });

    it("é idempotente — rodar de novo não duplica a baixa", async () => {
      await seedShopSettings({ loyaltyPointsExpirationDays: 30 });
      await completeAppointment({ method: "CASH" });
      const entry = await prisma.loyaltyEntry.findFirstOrThrow({ where: { clientId, reason: "EARN" } });
      await prisma.loyaltyEntry.update({ where: { id: entry.id }, data: { expiresAt: new Date("2000-01-01") } });

      expect(await expireLoyaltyPoints()).toBe(1);
      expect(await expireLoyaltyPoints()).toBe(0);

      const expireEntries = await prisma.loyaltyEntry.findMany({ where: { clientId, reason: "EXPIRE" } });
      expect(expireEntries).toHaveLength(1);
    });
  });

  describe("cleanupExpiredRefreshTokens", () => {
    beforeEach(async () => {
      await resetDatabase();
    });

    it("apaga só o que já venceu; preserva revogado-mas-ainda-dentro-da-validade (precisa da detecção de reuso)", async () => {
      const { user } = await createAdmin();
      const future = new Date(Date.now() + 30 * 24 * 3_600_000);
      const past = new Date(Date.now() - 30 * 24 * 3_600_000);

      const expiredActive = await prisma.refreshToken.create({
        data: { userId: user.id, tokenHash: hashRefreshToken("a"), expiresAt: past, revokedAt: null },
      });
      const expiredRevoked = await prisma.refreshToken.create({
        data: { userId: user.id, tokenHash: hashRefreshToken("b"), expiresAt: past, revokedAt: past },
      });
      const revokedButNotYetExpired = await prisma.refreshToken.create({
        data: { userId: user.id, tokenHash: hashRefreshToken("c"), expiresAt: future, revokedAt: new Date() },
      });
      const stillActive = await prisma.refreshToken.create({
        data: { userId: user.id, tokenHash: hashRefreshToken("d"), expiresAt: future, revokedAt: null },
      });

      const deletedCount = await cleanupExpiredRefreshTokens();
      expect(deletedCount).toBe(2);

      const remaining = await prisma.refreshToken.findMany({ where: { userId: user.id } });
      const remainingIds = remaining.map((r) => r.id);
      expect(remainingIds).not.toContain(expiredActive.id);
      expect(remainingIds).not.toContain(expiredRevoked.id);
      expect(remainingIds).toContain(revokedButNotYetExpired.id);
      expect(remainingIds).toContain(stillActive.id);
    });
  });
});
