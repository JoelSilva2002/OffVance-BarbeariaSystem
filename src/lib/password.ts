import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

/** scrypt do próprio Node — sem dependência externa para algo tão sensível quanto hash de senha. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const hashBuffer = Buffer.from(hash, "hex");
  const derivedBuffer = scryptSync(password, salt, KEY_LENGTH);
  if (hashBuffer.length !== derivedBuffer.length) return false;

  return timingSafeEqual(hashBuffer, derivedBuffer);
}
