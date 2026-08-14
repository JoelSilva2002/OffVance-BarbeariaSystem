import { randomBytes, createHash } from "node:crypto";

/** Refresh token é opaco (não-JWT) — só existe hash dele no banco, nunca o valor. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
