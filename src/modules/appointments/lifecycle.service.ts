import { Prisma, type ActorType, type AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { getShopSettings } from "../scheduling/shop-settings.service.js";
import { isExclusionViolation, lockBarberDay } from "./concurrency.js";
import { validateSlot } from "./slot-validation.js";
import type { RescheduleInput } from "./lifecycle.schema.js";
import { recordAppointmentEvent } from "../outbox/outbox.recorder.js";
import { APPOINTMENT_EVENT } from "../outbox/event-types.js";
import { appointmentEventPayload } from "../outbox/appointment-payload.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

/**
 * Máquina de estados do agendamento (docs/ARQUITETURA.md §02):
 *   AGENDADO → CONFIRMADO → EM_ATENDIMENTO → CONCLUÍDO
 *   AGENDADO/CONFIRMADO → CANCELADO · CONFIRMADO → NÃO_COMPARECEU
 * `complete` aceita tanto CONFIRMADO quanto EM_ATENDIMENTO como origem —
 * check-in é opcional, muitas barbearias não vão querer dar dois cliques.
 */
const CONFIRMABLE_FROM: AppointmentStatus = "AGENDADO";
const CHECK_INABLE_FROM: AppointmentStatus = "CONFIRMADO";
const COMPLETABLE_FROM: AppointmentStatus[] = ["CONFIRMADO", "EM_ATENDIMENTO"];
const CANCELABLE_FROM: AppointmentStatus[] = ["AGENDADO", "CONFIRMADO"];
const NO_SHOWABLE_FROM: AppointmentStatus = "CONFIRMADO";
const RESCHEDULABLE_FROM: AppointmentStatus[] = ["AGENDADO", "CONFIRMADO"];

async function getAppointmentOrThrow(db: DbClient, id: string) {
  const appointment = await db.appointment.findUnique({ where: { id }, include: { items: true } });
  if (!appointment) throw new Problem(404, "APPOINTMENT_NOT_FOUND", "Agendamento não encontrado.");
  return appointment;
}

async function recordTransition(
  tx: Prisma.TransactionClient,
  appointmentId: string,
  fromStatus: AppointmentStatus | null,
  toStatus: AppointmentStatus,
  actorType: ActorType,
  actorId: string | undefined,
  reason: string | null | undefined,
) {
  await tx.appointmentStatusHistory.create({
    data: { appointmentId, fromStatus, toStatus, actorType, actorId, reason },
  });
}

function invalidTransition(current: AppointmentStatus, action: string): never {
  throw new Problem(409, "INVALID_TRANSITION", `Não é possível ${action} um agendamento com status ${current}.`);
}

export async function confirmAppointment(id: string, actorType: ActorType, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    const appointment = await getAppointmentOrThrow(tx, id);
    if (appointment.status !== CONFIRMABLE_FROM) invalidTransition(appointment.status, "confirmar");
    const updated = await tx.appointment.update({ where: { id }, data: { status: "CONFIRMADO" } });
    await recordTransition(tx, id, appointment.status, "CONFIRMADO", actorType, actorId, null);
    await recordAppointmentEvent(tx, APPOINTMENT_EVENT.CONFIRMED, id, appointmentEventPayload(updated));
    return updated;
  });
}

export async function checkInAppointment(id: string, actorType: ActorType, actorId?: string) {
  return prisma.$transaction(async (tx) => {
    const appointment = await getAppointmentOrThrow(tx, id);
    if (appointment.status !== CHECK_INABLE_FROM) invalidTransition(appointment.status, "dar check-in em");
    const updated = await tx.appointment.update({ where: { id }, data: { status: "EM_ATENDIMENTO" } });
    await recordTransition(tx, id, appointment.status, "EM_ATENDIMENTO", actorType, actorId, null);
    return updated;
  });
}

export async function completeAppointment(
  id: string,
  actorType: ActorType,
  actorId?: string,
  internalNotes?: string,
) {
  return prisma.$transaction(async (tx) => {
    const appointment = await getAppointmentOrThrow(tx, id);
    if (!COMPLETABLE_FROM.includes(appointment.status)) invalidTransition(appointment.status, "concluir");

    const updated = await tx.appointment.update({
      where: { id },
      data: { status: "CONCLUIDO", internalNotes: internalNotes ?? appointment.internalNotes },
    });
    await recordTransition(tx, id, appointment.status, "CONCLUIDO", actorType, actorId, null);
    await recordAppointmentEvent(tx, APPOINTMENT_EVENT.COMPLETED, id, appointmentEventPayload(updated));
    return updated;
    // Registro de pagamento, crédito de pontos e recibo entram quando as
    // tabelas de financeiro/fidelidade existirem (fase 5).
  });
}

export async function cancelAppointment(id: string, actorType: ActorType, actorId?: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const appointment = await getAppointmentOrThrow(tx, id);
    if (!CANCELABLE_FROM.includes(appointment.status)) invalidTransition(appointment.status, "cancelar");

    if (actorType === "CLIENT") {
      const settings = await getShopSettings(tx);
      const deadline = appointment.startsAt.getTime() - settings.cancelDeadlineHours * 3_600_000;
      if (Date.now() > deadline) {
        throw new Problem(
          409,
          "CANCEL_DEADLINE_PASSED",
          `Cancelamentos precisam ser feitos com ao menos ${settings.cancelDeadlineHours}h de antecedência.`,
        );
      }
    }

    const updated = await tx.appointment.update({
      where: { id },
      data: { status: "CANCELADO", cancelledAt: new Date(), cancelReason: reason, cancelledBy: actorId ?? actorType },
    });
    await recordTransition(tx, id, appointment.status, "CANCELADO", actorType, actorId, reason);
    await recordAppointmentEvent(
      tx,
      APPOINTMENT_EVENT.CANCELLED,
      id,
      appointmentEventPayload(updated, { reason: reason ?? null }),
    );
    return updated;
    // Estorno de crédito de pacote entra quando a tabela existir (fase 5).
  });
}

export async function markNoShow(id: string, actorType: ActorType, actorId?: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const appointment = await getAppointmentOrThrow(tx, id);
    if (appointment.status !== NO_SHOWABLE_FROM) invalidTransition(appointment.status, "marcar falta em");
    const updated = await tx.appointment.update({ where: { id }, data: { status: "NAO_COMPARECEU" } });
    await recordTransition(tx, id, appointment.status, "NAO_COMPARECEU", actorType, actorId, reason);
    await recordAppointmentEvent(tx, APPOINTMENT_EVENT.NO_SHOW, id, appointmentEventPayload(updated));
    return updated;
  });
}

/**
 * Mesma transação faz o UPDATE de starts_at/ends_at (docs/ARQUITETURA.md
 * §03, "casos de borda" — remarcação não deleta/recria). Volta para
 * AGENDADO: uma confirmação anterior era para o horário antigo.
 */
export async function rescheduleAppointment(id: string, input: RescheduleInput) {
  const newStartsAt = new Date(input.startsAt);
  if (Number.isNaN(newStartsAt.getTime())) {
    throw new Problem(422, "INVALID_DATE", "`startsAt` inválido.");
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const appointment = await getAppointmentOrThrow(tx, id);
        if (!RESCHEDULABLE_FROM.includes(appointment.status)) invalidTransition(appointment.status, "remarcar");

        const settings = await getShopSettings(tx);
        if (input.actorType === "CLIENT") {
          const deadline = appointment.startsAt.getTime() - settings.rescheduleDeadlineHours * 3_600_000;
          if (Date.now() > deadline) {
            throw new Problem(
              409,
              "RESCHEDULE_DEADLINE_PASSED",
              `Remarcações precisam ser feitas com ao menos ${settings.rescheduleDeadlineHours}h de antecedência.`,
            );
          }
        }

        const targetBarberId = input.barberId ?? appointment.barberId;
        const localDate = DateTime.fromJSDate(newStartsAt, { zone: "utc" }).setZone(settings.timezone).toISODate()!;
        await lockBarberDay(tx, targetBarberId, localDate);

        const serviceIds = appointment.items.map((i) => i.serviceId);
        const { selection, endsAt, serviceEndsAt } = await validateSlot(
          tx,
          settings,
          targetBarberId,
          serviceIds,
          newStartsAt,
          id, // exclui o próprio agendamento da checagem de ocupação
        );

        const oldStartsAt = appointment.startsAt;
        const barberChanged = input.barberId !== undefined && input.barberId !== appointment.barberId;

        const updated = await tx.appointment.update({
          where: { id },
          data: {
            barberId: targetBarberId,
            startsAt: newStartsAt,
            endsAt,
            serviceEndsAt,
            totalPriceCents: selection.totalPriceCents,
            status: "AGENDADO",
          },
          include: { items: true },
        });

        await recordTransition(
          tx,
          id,
          appointment.status,
          "AGENDADO",
          input.actorType,
          input.actorId,
          `Remarcado de ${oldStartsAt.toISOString()} para ${newStartsAt.toISOString()}${barberChanged ? " (barbeiro alterado)" : ""}`,
        );

        await recordAppointmentEvent(
          tx,
          APPOINTMENT_EVENT.RESCHEDULED,
          id,
          appointmentEventPayload(updated, { previousStartsAt: oldStartsAt.toISOString() }),
        );

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
    );
  } catch (error) {
    if (isExclusionViolation(error)) {
      throw new Problem(409, "SLOT_TAKEN", "Esse horário acabou de ser preenchido. Escolha outro.");
    }
    throw error;
  }
}

export async function getAppointment(id: string) {
  return getAppointmentOrThrow(prisma, id);
}

export async function getAppointmentHistory(id: string) {
  await getAppointmentOrThrow(prisma, id);
  return prisma.appointmentStatusHistory.findMany({ where: { appointmentId: id }, orderBy: { createdAt: "asc" } });
}
