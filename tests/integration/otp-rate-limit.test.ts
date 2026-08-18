import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma.js";
import { requestOtp } from "../../src/modules/auth/otp.service.js";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";

describe("rate limit do OTP", () => {
  // App novo por teste — @fastify/rate-limit guarda estado em memória por
  // instância, mesmo motivo documentado em staff-auth.test.ts.
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("limite por IP: a 6ª chamada de /auth/otp/request no mesmo IP em 10min vira 429 RATE_LIMITED", async () => {
    // telefones diferentes a cada chamada — sem isso o cooldown de 30s por
    // telefone (OTP_RATE_LIMITED) dispararia antes do limite por IP
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        app.inject({ method: "POST", url: "/auth/otp/request", payload: { phone: `+551190000${i.toString().padStart(4, "0")}` } }),
      ),
    );
    const rateLimited = attempts.filter((r) => r.statusCode === 429 && r.json().title === "RATE_LIMITED");
    expect(rateLimited.length).toBeGreaterThan(0);
  });

  it("limite por IP: a 11ª chamada de /auth/otp/verify no mesmo minuto vira 429 RATE_LIMITED", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 11 }, () =>
        app.inject({ method: "POST", url: "/auth/otp/verify", payload: { phone: "+5511999998888", code: "000000" } }),
      ),
    );
    const rateLimited = attempts.filter((r) => r.statusCode === 429 && r.json().title === "RATE_LIMITED");
    expect(rateLimited.length).toBeGreaterThan(0);
    // as que não bateram no limite ainda são 401 (código errado) — o limite
    // por IP não deveria mudar a resposta de negócio das que passaram
    const notRateLimited = attempts.filter((r) => r.statusCode !== 429);
    expect(notRateLimited.every((r) => r.statusCode === 401)).toBe(true);
  });

  it("teto diário por telefone: a 11ª chamada em 24h vira 429 OTP_DAILY_LIMIT — distinto do cooldown de 30s", async () => {
    const phone = "+5511988887777";
    // 10 pedidos "antigos" (fora da janela do cooldown de 30s, dentro das 24h) —
    // inseridos direto no banco pra não esbarrar no cooldown nem no limite por IP
    await prisma.otpCode.createMany({
      data: Array.from({ length: 10 }, (_, i) => ({
        phone,
        code: "000000",
        createdAt: new Date(Date.now() - (i + 1) * 3_600_000), // 1h, 2h, ... atrás
        expiresAt: new Date(Date.now() - (i + 1) * 3_600_000 + 5 * 60_000),
      })),
    });

    await expect(requestOtp(phone)).rejects.toMatchObject({ status: 429, code: "OTP_DAILY_LIMIT" });
  });

  it("com menos de 10 pedidos nas últimas 24h, um novo pedido passa normalmente", async () => {
    const phone = "+5511977776666";
    await prisma.otpCode.createMany({
      data: Array.from({ length: 9 }, (_, i) => ({
        phone,
        code: "000000",
        createdAt: new Date(Date.now() - (i + 1) * 3_600_000),
        expiresAt: new Date(Date.now() - (i + 1) * 3_600_000 + 5 * 60_000),
      })),
    });

    const result = await requestOtp(phone);
    expect(result.code).toHaveLength(6);
  });

  it("o cooldown de 30s por telefone continua funcionando como antes (OTP_RATE_LIMITED, não OTP_DAILY_LIMIT)", async () => {
    const phone = "+5511966665555";
    await requestOtp(phone);
    await expect(requestOtp(phone)).rejects.toMatchObject({ status: 429, code: "OTP_RATE_LIMITED" });
  });
});
