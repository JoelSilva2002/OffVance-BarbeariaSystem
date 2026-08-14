import type { Appointment } from "@prisma/client";

/** Formato estável do payload dos eventos appointment.* — é o contrato que o n8n consome. */
export function appointmentEventPayload(appointment: Appointment, extra?: Record<string, unknown>) {
  return {
    appointmentId: appointment.id,
    code: appointment.code,
    clientId: appointment.clientId,
    barberId: appointment.barberId,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt.toISOString(),
    status: appointment.status,
    ...extra,
  };
}
