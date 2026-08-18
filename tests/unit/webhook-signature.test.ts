import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signWebhookPayload } from "../../src/lib/webhook-signature.js";

/**
 * Este contrato vai ser reimplementado num nó de Code do n8n (que não
 * importa nosso código, só reescreve a fórmula) — travar aqui contra um
 * valor calculado à mão é o que garante que um refactor futuro não quebre
 * a verificação de assinatura silenciosamente do outro lado.
 */
describe("signWebhookPayload", () => {
  it("produz sha256= + HMAC-SHA256 hex minúsculo de `timestamp.body`", () => {
    const secret = "whsec_test";
    const timestamp = "1700000000000";
    const body = '{"hello":"world"}';

    const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

    expect(signWebhookPayload(secret, timestamp, body)).toBe(`sha256=${expected}`);
    // valor fixo calculado fora do código de produção — se a fórmula
    // mudar (ordem dos campos, separador, algoritmo), este teste acusa
    // mesmo que a comparação acima (que reusa a mesma lógica) não acuse.
    expect(signWebhookPayload(secret, timestamp, body)).toBe(
      "sha256=195306fc6e208b472595aee6784b376a8e70d774a8dc37119a209093c6923ee5",
    );
  });

  it("é determinístico", () => {
    const a = signWebhookPayload("s", "123", "{}");
    const b = signWebhookPayload("s", "123", "{}");
    expect(a).toBe(b);
  });

  it("timestamp diferente muda a assinatura (defesa contra replay)", () => {
    const a = signWebhookPayload("s", "123", "{}");
    const b = signWebhookPayload("s", "456", "{}");
    expect(a).not.toBe(b);
  });

  it("segredo diferente muda a assinatura", () => {
    const a = signWebhookPayload("secret-a", "123", "{}");
    const b = signWebhookPayload("secret-b", "123", "{}");
    expect(a).not.toBe(b);
  });

  it("corpo diferente muda a assinatura", () => {
    const a = signWebhookPayload("s", "123", '{"a":1}');
    const b = signWebhookPayload("s", "123", '{"a":2}');
    expect(a).not.toBe(b);
  });
});
