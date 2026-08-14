/**
 * Catálogo de eventos (docs/ARQUITETURA.md §02). payment.*, order.* e
 * product.low_stock ainda não são emitidos como eventos de webhook — as
 * tabelas existem, mas nada os dispara ainda; ver docs/ARQUITETURA.md §04.
 */
export const APPOINTMENT_EVENT = {
  CREATED: "appointment.created",
  CONFIRMED: "appointment.confirmed",
  RESCHEDULED: "appointment.rescheduled",
  CANCELLED: "appointment.cancelled",
  COMPLETED: "appointment.completed",
  NO_SHOW: "appointment.no_show",
} as const;

export type AppointmentEventType = (typeof APPOINTMENT_EVENT)[keyof typeof APPOINTMENT_EVENT];

/**
 * Disparado quando uma `notifications` agendada chega no `scheduled_for`
 * (lembrete, pedido de confirmação, recibo, código OTP). O n8n assina este
 * evento para de fato entregar por WhatsApp/e-mail — o backend só decide
 * quando e o quê, nunca como entregar.
 */
export const NOTIFICATION_EVENT = {
  DUE: "notification.due",
} as const;

/** Disparado quando um cliente avalia um atendimento concluído. */
export const REVIEW_EVENT = {
  SUBMITTED: "review.submitted",
} as const;

export const ALL_EVENT_TYPES: string[] = [
  ...Object.values(APPOINTMENT_EVENT),
  ...Object.values(NOTIFICATION_EVENT),
  ...Object.values(REVIEW_EVENT),
];
