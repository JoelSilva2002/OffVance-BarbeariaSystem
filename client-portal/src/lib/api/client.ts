import { authSession } from "../auth/authSession";
import { tokenStore } from "../auth/tokenStore";
import { ApiError, type ProblemBody } from "./errors";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * Promise compartilhada entre chamadores concorrentes — é o ponto mais
 * crítico de todo o cliente de API. O backend rotaciona o refresh token a
 * cada uso e revoga TODAS as sessões se um token já trocado for reusado
 * (ver src/lib/refresh-tokens.ts na API). Duas chamadas paralelas de
 * refresh com o mesmo token derrubariam a sessão inteira; este singleton
 * garante que só a primeira dispara a requisição de verdade — as demais
 * esperam o mesmo resultado.
 */
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = tokenStore.get();
    if (!refreshToken) throw new Error("Sem sessão pra renovar.");

    const res = await fetch(`${API_URL}/auth/otp/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      tokenStore.clear();
      authSession.set(null);
      throw new Error("Sessão expirada — faça login de novo.");
    }

    const data: RefreshResponse = await res.json();
    // sempre grava o token NOVO antes de qualquer outra coisa — reusar o
    // velho por engano é exatamente o cenário que a API trata como roubo.
    tokenStore.set(data.refreshToken);
    authSession.set({ accessToken: data.accessToken });
    return data.accessToken;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, query?: ApiRequestOptions["query"]): string {
  const url = new URL(path, API_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body: ProblemBody = await res.json();
    return new ApiError(body);
  } catch {
    return new ApiError({ type: "about:blank", title: "UNKNOWN_ERROR", status: res.status });
  }
}

/**
 * `isRetry` garante no máximo UMA tentativa de refresh por chamada — se a
 * segunda tentativa também tomar 401, o erro sobe de verdade em vez de
 * entrar num loop.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}, isRetry = false): Promise<T> {
  const session = authSession.get();
  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && session && !isRetry) {
    try {
      await refreshAccessToken();
    } catch {
      throw await toApiError(res);
    }
    return apiRequest<T>(path, options, true);
  }

  if (!res.ok) {
    throw await toApiError(res);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Exportado só pro bootstrap de sessão (AuthContext) restaurar o login após um F5. */
export { refreshAccessToken };
