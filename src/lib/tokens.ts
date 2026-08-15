import { randomBytes, createHash } from "node:crypto";

/** Refresh token é opaco (não-JWT) — só existe hash dele no banco, nunca o valor. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const API_KEY_PREFIX = "sk_";

/** API key de máquina — prefixo reconhecível (`sk_...`) pra decidir o caminho de auth sem consultar o banco antes. */
export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(24).toString("hex")}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function isApiKeyFormat(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

/** Só os primeiros caracteres — o que fica visível numa listagem, nunca o segredo inteiro de novo. */
export function apiKeyPrefix(key: string): string {
  return key.slice(0, API_KEY_PREFIX.length + 8);
}
