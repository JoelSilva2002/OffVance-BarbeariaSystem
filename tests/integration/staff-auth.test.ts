import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { createAdmin } from "../setup/fixtures.js";

describe("autenticação de equipe", () => {
  let app: FastifyInstance;

  // App novo por teste: @fastify/rate-limit guarda estado em memória por
  // instância — reusar o app entre testes de login faria as tentativas de
  // um teste contarem pro limite/bloqueio do próximo.
  beforeEach(async () => {
    await resetDatabase();
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("login com credenciais corretas devolve access token + refresh token", async () => {
    const { user, password } = await createAdmin();
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.role).toBe("ADMIN");
  });

  it("senha errada → 401 INVALID_CREDENTIALS", async () => {
    const { user } = await createAdmin();
    const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password: "senha-errada" } });
    expect(res.statusCode).toBe(401);
    expect(res.json().title).toBe("INVALID_CREDENTIALS");
  });

  it("bloqueia a conta após 5 senhas erradas seguidas — a senha certa também é recusada enquanto bloqueada", async () => {
    const { user, password } = await createAdmin();

    for (let i = 0; i < 4; i++) {
      const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password: "errada" } });
      expect(res.statusCode).toBe(401);
    }

    const fifth = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password: "errada" } });
    expect(fifth.statusCode).toBe(429);
    expect(fifth.json().title).toBe("ACCOUNT_LOCKED");

    const withCorrectPassword = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password } });
    expect(withCorrectPassword.statusCode).toBe(429);
    expect(withCorrectPassword.json().title).toBe("ACCOUNT_LOCKED");
  });

  it("login bem-sucedido depois de erros zera o contador de tentativas", async () => {
    const { user, password } = await createAdmin();
    await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password: "errada" } });
    await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password: "errada" } });

    const success = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password } });
    expect(success.statusCode).toBe(200);

    // se o contador não tivesse zerado, mais 3 erradas bastariam pra bloquear (2+3=5) — não deve bloquear
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password: "errada" } });
    }
    const stillOk = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password } });
    expect(stillOk.statusCode).toBe(200);
  });

  it("limite por IP: a 11ª tentativa de login no mesmo minuto vira 429 RATE_LIMITED", async () => {
    const { user } = await createAdmin();
    const attempts = await Promise.all(
      Array.from({ length: 11 }, () =>
        app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password: "errada" } }),
      ),
    );
    const rateLimited = attempts.filter((r) => r.statusCode === 429 && r.json().title === "RATE_LIMITED");
    expect(rateLimited.length).toBeGreaterThan(0);
  });

  it("refresh rotaciona o token — o antigo vira inválido, o novo funciona", async () => {
    const { user, password } = await createAdmin();
    const login = (await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password } })).json();

    const refreshed = await app.inject({ method: "POST", url: "/auth/staff/refresh", payload: { refreshToken: login.refreshToken } });
    expect(refreshed.statusCode).toBe(200);
    const rotated = refreshed.json();
    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    expect(rotated.accessToken).toBeTruthy();
  });

  it("reapresentar um refresh token já rotacionado derruba TODAS as sessões do usuário", async () => {
    const { user, password } = await createAdmin();
    const login = (await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password } })).json();

    const rotated = (
      await app.inject({ method: "POST", url: "/auth/staff/refresh", payload: { refreshToken: login.refreshToken } })
    ).json();

    const reuse = await app.inject({ method: "POST", url: "/auth/staff/refresh", payload: { refreshToken: login.refreshToken } });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().title).toBe("REFRESH_TOKEN_REUSED");

    // o token novo, que até aqui era legítimo, também deve ter morrido
    const afterReuse = await app.inject({ method: "POST", url: "/auth/staff/refresh", payload: { refreshToken: rotated.refreshToken } });
    expect(afterReuse.statusCode).toBe(401);
  });

  it("logout revoga a sessão — usar o refresh token depois falha", async () => {
    const { user, password } = await createAdmin();
    const login = (await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password } })).json();

    const logout = await app.inject({ method: "POST", url: "/auth/staff/logout", payload: { refreshToken: login.refreshToken } });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await app.inject({ method: "POST", url: "/auth/staff/refresh", payload: { refreshToken: login.refreshToken } });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("rota protegida sem token → 401; com token → 200", async () => {
    const { user, password } = await createAdmin();
    const login = (await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email: user.email, password } })).json();

    const withoutToken = await app.inject({ method: "GET", url: "/appointments" });
    expect(withoutToken.statusCode).toBe(401);

    const withToken = await app.inject({
      method: "GET",
      url: "/appointments",
      headers: { authorization: `Bearer ${login.accessToken}` },
    });
    expect(withToken.statusCode).toBe(200);
  });
});
