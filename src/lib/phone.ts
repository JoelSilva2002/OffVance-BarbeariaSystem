/**
 * Normalização de telefone pra casar o que o Evolution manda (JID tipo
 * `5511999998888@s.whatsapp.net`) com o que está salvo em `users.phone`
 * (formato livre — o que o cliente digitou no cadastro). Funções puras,
 * sem banco: `User.phone` é `@unique` (logo indexado), então
 * `WHERE phone IN (...)` é index scan em valores exatos — sem migração,
 * sem coluna normalizada, sem backfill. Isso é a resposta certa nesta
 * escala; com 100 mil usuários seria outra.
 */

/** Tira sufixo de JID, tudo que não é dígito, e o "00" de discagem internacional. */
export function normalizePhone(raw: string): string {
  let digits = raw
    .replace(/@s\.whatsapp\.net$/i, "")
    .replace(/@c\.us$/i, "")
    .replace(/@g\.us$/i, "")
    .replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);
  // número BR "nu" (sem código de país) tem 10 (fixo) ou 11 (celular) dígitos
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;

  return digits;
}

/**
 * Gera as grafias plausíveis do que pode estar salvo no banco pro mesmo
 * número: com/sem `+`, e com/sem o 9º dígito — celular ganhou um "9" extra
 * na frente do número em 2012 (fixo nunca teve), e sem saber se é celular
 * ou fixo só de olhar os dígitos, geram-se as duas variantes plausíveis.
 * Sabidamente imperfeito (DDD 55 é Rio Grande do Sul, não só prefixo de
 * país — ambiguidade aceita conscientemente nesta escala).
 */
export function phoneLookupVariants(raw: string): string[] {
  const normalized = normalizePhone(raw);
  if (!normalized) return [];

  const variants = new Set<string>([normalized, `+${normalized}`]);

  const countryAndDdd = normalized.slice(0, 4); // "55" + DDD (2 dígitos)
  const rest = normalized.slice(4);

  if (rest.length === 9 && rest.startsWith("9")) {
    const withoutNine = countryAndDdd + rest.slice(1);
    variants.add(withoutNine);
    variants.add(`+${withoutNine}`);
  } else if (rest.length === 8) {
    const withNine = `${countryAndDdd}9${rest}`;
    variants.add(withNine);
    variants.add(`+${withNine}`);
  }

  return [...variants];
}
