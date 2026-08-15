import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma.js";
import { hashPasswordResetToken } from "../../src/lib/tokens.js";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { createAdmin } from "../setup/fixtures.js";

describe("recuperação de senha de equipe (esqueci minha senha)", () => {
  let app: FastifyInstance;

  // App novo por teste: @fastify/rate-limit guarda estado em memória por
  // instância (mesmo motivo de staff-auth.test.ts).
  beforeEach(async () => {
    await resetDatabase();
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  async function forgotPassword(email: string) {
    return app.inject({ method: "POST", url: "/auth/staff/forgot-password", payload: { email } });
  }

  async function latestTokenFor(userId: string) {
    return prisma.passwordResetToken.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  }

  /**
   * O token cru só existe em memória no instante do envio — o e-mail é o
   * único canal de entrega, de propósito nunca volta na resposta HTTP. Sem
   * RESEND_API_KEY no ambiente de teste (a suíte não fala com o Resend de
   * verdade — ver lib/email.ts), plantamos direto no banco um token com o
   * mesmo hash que o serviço geraria: testa o caminho de CONSUMO (rota →
   * serviço → banco) de ponta a ponta de verdade, contornando só a entrega
   * por e-mail em si — uma dependência externa já tratada como best-effort
   * no resto do sistema (ver email-dispatch.service.ts).
   */
  async function plantResetToken(userId: string, overrides: Partial<{ expiresAt: Date }> = {}) {
    const raw = `raw-token-${Math.random().toString(36).slice(2)}`;
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashPasswordResetToken(raw),
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 30 * 60_000),
      },
    });
    return raw;
  }

  it("pedido de reset pra e-mail existente devolve 202 e cria token com validade de 30 minutos", async () => {
    const { user } = await createAdmin();
    const res = await forgotPassword(user.email!);
    expect(res.statusCode).toBe(202);

    const token = await latestTokenFor(user.id);
    expect(token).not.toBeNull();
    expect(token!.usedAt).toBeNull();
    const minutesLeft = (token!.expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutesLeft).toBeGreaterThan(29);
    expect(minutesLeft).toBeLessThanOrEqual(30);
  });

  it("pedido de reset pra e-mail inexistente também devolve 202 — não revela se a conta existe", async () => {
    const res = await forgotPassword("ninguem-usa-este-email@test.dev");
    expect(res.statusCode).toBe(202);
    expect(await prisma.passwordResetToken.findFirst()).toBeNull();
  });

  it("um pedido novo invalida o token anterior não usado", async () => {
    const { user } = await createAdmin();
    await forgotPassword(user.email!);
    const first = await latestTokenFor(user.id);

    await forgotPassword(user.email!);
    const stillFirst = await prisma.passwordResetToken.findUnique({ where: { id: first!.id } });
    expect(stillFirst!.usedAt).not.toBeNull();
  });

  it("token válido troca a senha e revoga todos os refresh tokens ativos", async () => {
    const { user, password: oldPassword } = await createAdmin();
    const login = (
      await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password: oldPassword } })
    ).json();

    const rawToken = await plantResetToken(user.id);
    const resetRes = await app.inject({
      method: "POST",
      url: "/auth/staff/reset-password",
      payload: { token: rawToken, newPassword: "senha-nova-123" },
    });
    expect(resetRes.statusCode).toBe(204);

    const oldLoginRes = await app.inject({
      method: "POST",
      url: "/auth/staff/login",
      payload: { email: user.email, password: oldPassword },
    });
    expect(oldLoginRes.statusCode).toBe(401);

    const newLoginRes = await app.inject({
      method: "POST",
      url: "/auth/staff/login",
      payload: { email: user.email, password: "senha-nova-123" },
    });
    expect(newLoginRes.statusCode).toBe(200);

    const refreshRes = await app.inject({
      method: "POST",
      url: "/auth/staff/refresh",
      payload: { refreshToken: login.refreshToken },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it("token não pode ser reusado", async () => {
    const { user } = await createAdmin();
    const rawToken = await plantResetToken(user.id);

    const first = await app.inject({
      method: "POST",
      url: "/auth/staff/reset-password",
      payload: { token: rawToken, newPassword: "senha-nova-123" },
    });
    expect(first.statusCode).toBe(204);

    const second = await app.inject({
      method: "POST",
      url: "/auth/staff/reset-password",
      payload: { token: rawToken, newPassword: "outra-senha-456" },
    });
    expect(second.statusCode).toBe(401);
    expect(second.json().title).toBe("INVALID_RESET_TOKEN");
  });

  it("token expirado é recusado", async () => {
    const { user } = await createAdmin();
    const rawToken = await plantResetToken(user.id, { expiresAt: new Date(Date.now() - 1000) });

    const res = await app.inject({
      method: "POST",
      url: "/auth/staff/reset-password",
      payload: { token: rawToken, newPassword: "senha-nova-123" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().title).toBe("INVALID_RESET_TOKEN");
  });

  it("token que nunca existiu é recusado com a mesma mensagem (não distingue os dois casos)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/staff/reset-password",
      payload: { token: "token-que-nao-existe", newPassword: "senha-nova-123" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().title).toBe("INVALID_RESET_TOKEN");
  });

  it("resetar a senha também limpa o bloqueio de conta por tentativas erradas", async () => {
    const { user } = await createAdmin();
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password: "errada" } });
    }
    const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.lockedUntil).not.toBeNull();

    const rawToken = await plantResetToken(user.id);
    await app.inject({
      method: "POST",
      url: "/auth/staff/reset-password",
      payload: { token: rawToken, newPassword: "senha-nova-123" },
    });

    const unlocked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unlocked.lockedUntil).toBeNull();
    expect(unlocked.failedLoginAttempts).toBe(0);

    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/staff/login",
      payload: { email: user.email, password: "senha-nova-123" },
    });
    expect(loginRes.statusCode).toBe(200);
  });

  it("limite por IP no forgot-password: a 6ª tentativa no mesmo minuto vira 429 RATE_LIMITED", async () => {
    const attempts = await Promise.all(Array.from({ length: 6 }, () => forgotPassword("qualquer@test.dev")));
    const rateLimited = attempts.filter((r) => r.statusCode === 429 && r.json().title === "RATE_LIMITED");
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});
