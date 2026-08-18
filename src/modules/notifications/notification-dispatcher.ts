import { prisma } from "../../lib/prisma.js";
import { NOTIFICATION_EVENT } from "../outbox/event-types.js";
import { sendNotificationEmail } from "./email-dispatch.service.js";
import { renderWhatsAppMessage, resolveWhatsAppRecipient } from "./whatsapp-dispatch.service.js";

const BATCH = 50;

/**
 * Varre notifications com scheduled_for já vencido. Dois canais, duas
 * mecânicas de entrega:
 *
 * - WHATSAPP: a API resolve destinatário e renderiza o texto (mesma hora
 *   em que o e-mail resolve endereço — ver whatsapp-dispatch.service.ts),
 *   e vira um outbox_event que segue o MESMO pipeline de webhooks já
 *   construído para os eventos de agendamento — quem entrega de fato é o
 *   n8n. "SENT" aqui é "entregue ao pipeline", não "confirmadamente
 *   recebido pelo cliente"; essa confirmação, se vier, chega via PATCH
 *   /notifications/:id. Sem destinatário resolvível ou sem template
 *   conhecido, vira FAILED e nenhum evento é emitido — emitir evento sem
 *   pra quem mandar seria pior que falhar alto (espelha o `if (!to)` do
 *   e-mail logo abaixo).
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

    const recipient = await resolveWhatsAppRecipient(notification);
    const text = recipient ? await renderWhatsAppMessage(notification, recipient.name) : null;
    if (!recipient || !text) {
      await prisma.notification.update({ where: { id: notification.id }, data: { status: "FAILED" } });
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
            // aditivo — n8n lê recipient.phone/message.text pra QUALQUER
            // template, sem precisar saber que OTP resolve o telefone de
            // um jeito diferente (via payload.phone, não client.user.phone)
            recipient: { phone: recipient.phone, name: recipient.name },
            message: { text },
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
