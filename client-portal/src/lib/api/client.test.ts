import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authSession } from "../auth/authSession";
import { tokenStore } from "../auth/tokenStore";
import { apiRequest } from "./client";

/**
 * A guarda de concorrência do refresh (client.ts) é a lógica mais sutil e
 * mais fácil de quebrar silenciosamente do projeto inteiro: o backend
 * revoga TODA sessão se detectar reuso de um refresh token já rotacionado
 * (ver src/lib/refresh-tokens.ts na API), e duas chamadas paralelas de
 * refresh com o mesmo token são exatamente esse cenário. Este teste prova
 * que N chamadas concorrentes tomando 401 disparam UMA única renovação
 * real, compartilhada, não N.
 */
describe("apiRequest — guarda de concorrência do refresh", () => {
  beforeEach(() => {
    localStorage.clear();
    authSession.set({ accessToken: "token-velho" });
    tokenStore.set("refresh-velho");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    authSession.set(null);
    tokenStore.clear();
  });

  it("N chamadas concorrentes com 401 disparam só UMA chamada real a /auth/otp/refresh", async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.includes("/auth/otp/refresh")) {
        refreshCalls++;
        return new Response(JSON.stringify({ accessToken: "token-novo", refreshToken: "refresh-novo" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // primeira tentativa de cada chamada: token velho -> 401. Depois do
      // refresh, `apiRequest` reenvia com Authorization novo -> 200.
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (auth === "Bearer token-novo") {
        return new Response(JSON.stringify({ ok: true, path: url }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ type: "about:blank", title: "UNAUTHENTICATED", status: 401 }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.all([
      apiRequest<{ ok: boolean }>("/me"),
      apiRequest<{ ok: boolean }>("/me/appointments"),
      apiRequest<{ ok: boolean }>("/me/loyalty"),
      apiRequest<{ ok: boolean }>("/me/packages"),
    ]);

    expect(refreshCalls).toBe(1);
    expect(results).toEqual([{ ok: true, path: expect.any(String) }, { ok: true, path: expect.any(String) }, { ok: true, path: expect.any(String) }, { ok: true, path: expect.any(String) }]);
    expect(authSession.get()?.accessToken).toBe("token-novo");
    expect(tokenStore.get()).toBe("refresh-novo");
  });

  it("segunda tentativa também tomando 401 não entra em loop — o erro sobe de verdade", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/otp/refresh")) {
        return new Response(JSON.stringify({ accessToken: "token-novo", refreshToken: "refresh-novo" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // toda chamada não-refresh continua 401, mesmo depois do retry
      return new Response(JSON.stringify({ type: "about:blank", title: "UNAUTHENTICATED", status: 401 }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest("/me")).rejects.toMatchObject({ status: 401 });
    // 1 chamada original + 1 refresh + 1 retry = 3, não um loop infinito
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
