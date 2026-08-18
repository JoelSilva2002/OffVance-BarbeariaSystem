import { Prisma, type ActorType, type AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { getShopSettings } from "../scheduling/shop-settings.service.js";
import { isExclusionViolation, lockBarberDay } from "./concurrency.js";
import { validateSlot } from "./slot-validation.js";
import type { CompletionPaymentInput, RescheduleBody } from "./lifecycle.schema.js";
import { recordAppointmentEvent } from "../outbox/outbox.recorder.js";
import { APPOINTMENT_EVENT } from "../outbox/event-types.js";
import { appointmentEventPayload } from "../outbox/appointment-payload.js";
import {
  cancelReminder,
  scheduleCancellationNotice,
  scheduleReceipt,
  scheduleReminder,
  scheduleRescheduleNotice,
} from "../notifications/scheduler.js";
import { consumePackageCredit } from "../packages/client-packages.service.js";
import { earnPoints, redeemPoints } from "../loyalty/loyalty.service.js";

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

/**
 * "Todo atendimento tem um pagamento, mesmo o de valor zero"
 * (docs/ARQUITETURA.md §01): PACKAGE zera o valor cobrado (o dinheiro já
 * entrou na compra do pacote); pontos resgatados abatem do valor antes de
 * gerar o Payment. Pontos ganhos são sobre o que efetivamente circulou —
 * cobrir com pacote não gera pontos novos.
 */
export async function completeAppointment(
  id: string,
  actorType: ActorType,
  actorId: string | undefined,
  internalNotes: string | undefined,
  payment: CompletionPaymentInput,
) {
  return prisma.$transaction(async (tx) => {
    const appointment = await getAppointmentOrThrow(tx, id);
    if (!COMPLETABLE_FROM.includes(appointment.status)) invalidTransition(appointment.status, "concluir");
    if (!appointment.clientId) {
      throw new Problem(422, "BLOCK_CANNOT_BE_COMPLETED", "Bloqueios não têm cliente — não há o que concluir.");
    }

    const settings = await getShopSettings(tx);
    let amountCents = appointment.totalPriceCents;

    if (payment.method === "PACKAGE") {
      await consumePackageCredit(
        tx,
        payment.clientPackageId!,
        appointment.clientId,
        id,
        appointment.items.map((item) => item.serviceId),
      );
      amountCents = 0;
    } else if (payment.redeemPoints && payment.redeemPoints > 0) {
      const discountCents = payment.redeemPoints * settings.loyaltyPointValueCents;
      amountCents = Math.max(0, amountCents - discountCents);
      await redeemPoints(tx, appointment.clientId, payment.redeemPoints, "appointment", id);
    }

    const paymentRecord = await tx.payment.create({
      data: { appointmentId: id, amountCents, method: payment.method, status: "PAID", paidAt: new Date() },
    });

    const pointsEarned = Math.floor((amountCents / 100) * Number(settings.loyaltyPointsPerCurrency));
    await earnPoints(tx, appointment.clientId, pointsEarned, "appointment", id);

    const updated = await tx.appointment.update({
      where: { id },
      data: { status: "CONCLUIDO", internalNotes: internalNotes ?? appointment.internalNotes },
    });
    await recordTransition(tx, id, appointment.status, "CONCLUIDO", actorType, actorId, null);
    await recordAppointmentEvent(
      tx,
      APPOINTMENT_EVENT.COMPLETED,
      id,
      appointmentEventPayload(updated, { amountPaidCents: amountCents, paymentMethod: payment.method, pointsEarned }),
    );
    await scheduleReceipt(tx, updated, amountCents, payment.method);

    return { ...updated, payment: paymentRecord, pointsEarned };
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
    await cancelReminder(tx, id);
    // depois de matar o lembrete velho, não antes — ordem importa (ver
    // scheduler.ts: os dedup_keys são independentes, mas semanticamente o
    // aviso de cancelamento substitui o lembrete que não faz mais sentido)
    await scheduleCancellationNotice(tx, updated, actorType);
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
export async function rescheduleAppointment(
  id: string,
  actorType: ActorType,
  actorId: string | undefined,
  body: RescheduleBody,
) {
  const newStartsAt = new Date(body.startsAt);
  if (Number.isNaN(newStartsAt.getTime())) {
    throw new Problem(422, "INVALID_DATE", "`startsAt` inválido.");
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const appointment = await getAppointmentOrThrow(tx, id);
        if (!RESCHEDULABLE_FROM.includes(appointment.status)) invalidTransition(appointment.status, "remarcar");

        const settings = await getShopSettings(tx);
        if (actorType === "CLIENT") {
          const deadline = appointment.startsAt.getTime() - settings.rescheduleDeadlineHours * 3_600_000;
          if (Date.now() > deadline) {
            throw new Problem(
              409,
              "RESCHEDULE_DEADLINE_PASSED",
              `Remarcações precisam ser feitas com ao menos ${settings.rescheduleDeadlineHours}h de antecedência.`,
            );
          }
        }

        const targetBarberId = body.barberId ?? appointment.barberId;
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
        const barberChanged = body.barberId !== undefined && body.barberId !== appointment.barberId;

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
          actorType,
          actorId,
          `Remarcado de ${oldStartsAt.toISOString()} para ${newStartsAt.toISOString()}${barberChanged ? " (barbeiro alterado)" : ""}`,
        );

        await recordAppointmentEvent(
          tx,
          APPOINTMENT_EVENT.RESCHEDULED,
          id,
          appointmentEventPayload(updated, { previousStartsAt: oldStartsAt.toISOString() }),
        );
        // mesmo dedup_key do lembrete original — reagenda no lugar de duplicar
        await scheduleReminder(tx, updated, settings);
        await scheduleRescheduleNotice(tx, updated, oldStartsAt, actorType);

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

/**
 * Consulta própria (não reusa getAppointmentOrThrow) porque só esta rota
 * precisa do nome do cliente/barbeiro pra exibição — anexar esse JOIN no
 * helper interno encareceria toda transição de status à toa, já que elas só
 * leem status/clientId/items. `select` explícito no User (não `include`)
 * pra nunca vazar passwordHash e afins.
 */
export async function getAppointment(id: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      items: true,
      client: { include: { user: { select: { phone: true } } } },
      barber: { select: { id: true, displayName: true } },
    },
  });
  if (!appointment) throw new Problem(404, "APPOINTMENT_NOT_FOUND", "Agendamento não encontrado.");
  return appointment;
}

export async function getAppointmentHistory(id: string) {
  await getAppointmentOrThrow(prisma, id);
  return prisma.appointmentStatusHistory.findMany({ where: { appointmentId: id }, orderBy: { createdAt: "asc" } });
}
