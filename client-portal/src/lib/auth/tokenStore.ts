const REFRESH_TOKEN_KEY = "prisma_client_refresh_token";

/**
 * Único lugar que lê/escreve o refresh token no localStorage. O access
 * token nunca passa por aqui — fica só em memória (authSession.ts) — pra
 * reduzir a superfície de um XSS conseguir roubar a sessão inteira.
 */
export const tokenStore = {
  get(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  set(token: string): void {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  },
  clear(): void {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};
