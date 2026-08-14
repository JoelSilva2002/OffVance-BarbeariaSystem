import { prisma } from "../../lib/prisma.js";
import { NOTIFICATION_EVENT } from "../outbox/event-types.js";

const BATCH = 50;

/**
 * Varre notifications com scheduled_for já vencido e as transforma em
 * outbox_events — dali em diante seguem o MESMO pipeline de webhooks já
 * construído para os eventos de agendamento. "SENT" aqui é "entregue ao
 * pipeline", não "confirmadamente recebido pelo WhatsApp do cliente";
 * essa confirmação, se vier, chega via PATCH /notifications/:id.
 */
export async function fireDueNotifications(): Promise<number> {
  const due = await prisma.notification.findMany({
    where: { status: "PENDING", scheduledFor: { lte: new Date() } },
    take: BATCH,
  });

  for (const notification of due) {
    await prisma.$transaction(async (tx) => {
      await tx.outboxEvent.create({
        data: {
          aggregateType: "notification",
          aggregateId: notification.id,
          eventType: NOTIFICATION_EVENT.DUE,
          payload: {
            notificationId: notification.id,
            clientId: notification.clientId,
            channel: notification.channel,
            template: notification.template,
            data: notification.payload,
          },
        },
      });
      await tx.notification.update({
        where: { id: notification.id },
        data: { status: "SENT", sentAt: new Date() },
      });
    });
  }

  return due.length;
}
