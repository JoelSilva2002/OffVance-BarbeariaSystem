import type { Appointment, Prisma } from "@prisma/client";

interface ReminderSettings {
  autoConfirmHoursBefore: number;
}

function reminderPayload(appointment: Appointment) {
  return {
    appointmentId: appointment.id,
    code: appointment.code,
    barberId: appointment.barberId,
    startsAt: appointment.startsAt.toISOString(),
  };
}

/**
 * Materializa o lembrete/pedido de confirmação como uma linha futura
 * (docs/ARQUITETURA.md §02) — nunca um `Wait` solto num workflow do n8n.
 * `upsert` por dedup_key: se já existir um lembrete pendente para este
 * agendamento (ex.: remarcação), ele é atualizado no lugar de duplicado.
 */
export async function scheduleReminder(tx: Prisma.TransactionClient, appointment: Appointment, settings: ReminderSettings) {
  if (!appointment.clientId) return; // bloqueios (kind=BLOCK) não têm cliente

  const computed = appointment.startsAt.getTime() - settings.autoConfirmHoursBefore * 3_600_000;
  const scheduledFor = new Date(Math.max(computed, Date.now()));

  await tx.notification.upsert({
    where: { dedupKey: `reminder:${appointment.id}` },
    update: { scheduledFor, status: "PENDING", sentAt: null, payload: reminderPayload(appointment) },
    create: {
      clientId: appointment.clientId,
      channel: "WHATSAPP",
      template: "appointment_reminder",
      payload: reminderPayload(appointment),
      scheduledFor,
      dedupKey: `reminder:${appointment.id}`,
    },
  });
}

/** Remarcar/cancelar invalida o lembrete antigo — sem isso o cliente recebe aviso do horário errado. */
export async function cancelReminder(tx: Prisma.TransactionClient, appointmentId: string) {
  await tx.notification.updateMany({
    where: { dedupKey: `reminder:${appointmentId}`, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
}

/** "Recibo/notificação de pagamento após a conclusão" — usa o total já congelado no agendamento. */
export async function scheduleReceipt(tx: Prisma.TransactionClient, appointment: Appointment) {
  if (!appointment.clientId) return;

  await tx.notification.upsert({
    where: { dedupKey: `receipt:${appointment.id}` },
    update: {},
    create: {
      clientId: appointment.clientId,
      channel: "WHATSAPP",
      template: "appointment_receipt",
      payload: {
        appointmentId: appointment.id,
        code: appointment.code,
        totalPriceCents: appointment.totalPriceCents,
      },
      scheduledFor: new Date(),
      dedupKey: `receipt:${appointment.id}`,
    },
  });
}
