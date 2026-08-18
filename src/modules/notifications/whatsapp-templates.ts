import { env } from "../../config/env.js";

/**
 * A API renderiza o texto, não o n8n: fuso e formatação pt-BR já vivem
 * aqui (luxon + ShopSettings.timezone) — reimplementar isso num Function
 * node do n8n duplicaria e divergiria cedo ou tarde. Copy em git é
 * revisável e testável; copy numa GUI não é. O ganho aparece quando um
 * template novo (cancelamento, remarcação) custa zero mudança de n8n —
 * o workflow só encaminha `message.text`.
 */

export function renderOtpCodeWhatsApp(payload: { code: string; expiresInMin: number }): string {
  return `${payload.code} é o seu código de acesso na ${env.SHOP_NAME}. Vale por ${payload.expiresInMin} minutos.\nNão compartilhe com ninguém.`;
}

export function renderAppointmentReminderWhatsApp(payload: {
  clientName: string;
  startsAtLocal: string;
  barberName?: string;
}): string {
  const withBarber = payload.barberName ? ` — com ${payload.barberName}` : "";
  return [
    `Oi, ${payload.clientName}! Lembrete do seu horário na ${env.SHOP_NAME}:`,
    `📅 ${payload.startsAtLocal}${withBarber}`,
    "Responda *SIM* pra confirmar.",
    "Precisa cancelar ou remarcar? É só falar com a gente.",
  ].join("\n");
}

export function renderAppointmentReceiptWhatsApp(payload: {
  clientName: string;
  amountReais: string;
  paymentMethodLabel: string;
}): string {
  return [
    `Valeu pela visita, ${payload.clientName}!`,
    `Total R$ ${payload.amountReais} (${payload.paymentMethodLabel})`,
    "Até a próxima ✂️",
  ].join("\n");
}

export function renderAppointmentCancelledWhatsApp(payload: { clientName: string; startsAtLocal: string }): string {
  return [
    `Oi, ${payload.clientName}. Seu horário na ${env.SHOP_NAME} de ${payload.startsAtLocal} foi cancelado.`,
    "Quer marcar outro horário? É só falar com a gente.",
  ].join("\n");
}

export function renderAppointmentRescheduledWhatsApp(payload: {
  clientName: string;
  previousStartsAtLocal: string;
  startsAtLocal: string;
}): string {
  return [
    `Oi, ${payload.clientName}! Seu horário na ${env.SHOP_NAME} foi remarcado:`,
    `De ${payload.previousStartsAtLocal} para 📅 ${payload.startsAtLocal}`,
    "Precisa mudar de novo? Fale com a gente.",
  ].join("\n");
}
