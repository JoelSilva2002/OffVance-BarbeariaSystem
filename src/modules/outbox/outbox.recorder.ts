import type { Prisma } from "@prisma/client";
import type { AppointmentEventType } from "./event-types.js";

/**
 * Padrão outbox transacional: grava o evento NA MESMA transação da mudança
 * que o originou (docs/ARQUITETURA.md §02). `tx` é sempre o client da
 * transação em andamento — nunca o client global — para a garantia "ou os
 * dois existem, ou nenhum" valer de verdade.
 */
export async function recordAppointmentEvent(
  tx: Prisma.TransactionClient,
  eventType: AppointmentEventType,
  appointmentId: string,
  payload: Record<string, unknown>,
) {
  await tx.outboxEvent.create({
    data: {
      aggregateType: "appointment",
      aggregateId: appointmentId,
      eventType,
      payload: payload as Prisma.InputJsonValue,
    },
  });
}
