import { DateTime } from "luxon";
import type { PaymentMethod } from "@prisma/client";

/** Compartilhado entre e-mail e WhatsApp — os dois canais mostram a mesma forma de pagamento. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Dinheiro",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  PIX: "Pix",
  PACKAGE: "Pacote",
};

export function formatLocalDateTime(iso: string, timezone: string): string {
  return DateTime.fromISO(iso).setZone(timezone).setLocale("pt-BR").toFormat("dd/MM 'às' HH:mm");
}
