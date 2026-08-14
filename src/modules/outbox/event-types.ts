/**
 * Catálogo de eventos (docs/ARQUITETURA.md §02). Só os que o sistema hoje
 * consegue de fato emitir — payment.*, order.*, product.*, loyalty.*,
 * review.* chegam junto com as tabelas de financeiro/loja/fidelidade.
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

export const ALL_EVENT_TYPES: string[] = Object.values(APPOINTMENT_EVENT);
