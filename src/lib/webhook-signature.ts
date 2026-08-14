import { createHmac } from "node:crypto";

/**
 * Assinatura HMAC-SHA256 dos webhooks (docs/ARQUITETURA.md §02,
 * "Integração com n8n"): `sha256=HMAC(secret, timestamp + "." + body)`.
 * O timestamp entra na assinatura para o receptor recusar entregas velhas
 * reenviadas (replay).
 */
export function signWebhookPayload(secret: string, timestampMs: string, rawBody: string): string {
  const hmac = createHmac("sha256", secret).update(`${timestampMs}.${rawBody}`).digest("hex");
  return `sha256=${hmac}`;
}
