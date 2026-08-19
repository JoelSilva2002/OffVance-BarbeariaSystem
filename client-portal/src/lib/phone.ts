/** Formatação/normalização de telefone BR pro formulário de login — barbearia única, sem outro país a considerar. */

export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function isValidPhoneInput(formatted: string): boolean {
  return formatted.replace(/\D/g, "").length >= 10;
}

export function toE164BR(formatted: string): string {
  return `+55${formatted.replace(/\D/g, "")}`;
}
