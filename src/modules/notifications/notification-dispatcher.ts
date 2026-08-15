import { prisma } from "../../lib/prisma.js";
import { NOTIFICATION_EVENT } from "../outbox/event-types.js";
import { sendNotificationEmail } from "./email-dispatch.service.js";

const BATCH = 50;

/**
 * Varre notifications com scheduled_for já vencido. Dois canais, duas
 * mecânicas de entrega:
 *
 * - WHATSAPP: vira um outbox_event e segue o MESMO pipeline de webhooks já
 *   construído para os eventos de agendamento — quem entrega de fato é o
 *   n8n. "SENT" aqui é "entregue ao pipeline", não "confirmadamente
 *   recebido pelo cliente"; essa confirmação, se vier, chega via PATCH
 *   /notifications/:id.
 * - EMAIL: a própria API entrega, direto pelo Resend — não tem por que
 *   terceirizar isso pro n8n quando a Resend já faz o trabalho. "SENT"
 *   aqui já significa "a Resend aceitou o envio" (id de verdade em
 *   provider_message_id); falha vira FAILED imediatamente, sem
 *   intermediário.
 */
export async function fireDueNotifications(): Promise<number> {
  const due = await prisma.notification.findMany({
    where: { status: "PENDING", scheduledFor: { lte: new Date() } },
    take: BATCH,
  });

  for (const notification of due) {
    if (notification.channel === "EMAIL") {
      const result = await sendNotificationEmail(notification);
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: result.status,
          sentAt: result.status === "SENT" ? new Date() : undefined,
          providerMessageId: result.providerMessageId,
        },
      });
      continue;
    }

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
