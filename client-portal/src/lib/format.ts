import { DateTime } from "luxon";

/**
 * Fuso fixo, não `GET /shop-settings` (staff-only — o portal do cliente não
 * tem acesso) — mesma simplificação já aceita no workflow de WhatsApp
 * (n8n/workflows/evolution-inbound-reply.json): uma barbearia só, não
 * multi-tenant. Se a loja um dia mudar de fuso, isto precisa ser atualizado
 * manualmente (mesmo aviso documentado lá).
 */
export const SHOP_TIMEZONE = "America/Sao_Paulo";

export function formatDateTime(iso: string): string {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(SHOP_TIMEZONE).setLocale("pt-BR").toFormat("dd/MM 'às' HH:mm");
}

export function formatDateLabel(iso: string): string {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(SHOP_TIMEZONE).setLocale("pt-BR").toFormat("EEE, dd/MM");
}

/** Sem hora — validade de pacote, data de compra: hora do dia não é informação útil aqui. */
export function formatDate(iso: string): string {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(SHOP_TIMEZONE).setLocale("pt-BR").toFormat("dd/MM/yyyy");
}

export function formatTime(iso: string): string {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(SHOP_TIMEZONE).toFormat("HH:mm");
}

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
