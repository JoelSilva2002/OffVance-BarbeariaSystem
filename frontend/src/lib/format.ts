import { DateTime } from "luxon";

export function formatTime(iso: string, timezone: string): string {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(timezone).toFormat("HH:mm");
}

export function formatDateLabel(iso: string, timezone: string): string {
  return DateTime.fromISO(iso, { zone: "utc" }).setZone(timezone).setLocale("pt-BR").toFormat("EEE, dd/MM");
}

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** `from`/`to` do dia selecionado, em UTC, cobrindo o dia inteiro no fuso da loja. */
export function dayRangeInTimezone(date: string, timezone: string): { from: string; to: string } {
  const start = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  const end = start.endOf("day");
  return { from: start.toUTC().toISO()!, to: end.toUTC().toISO()! };
}
