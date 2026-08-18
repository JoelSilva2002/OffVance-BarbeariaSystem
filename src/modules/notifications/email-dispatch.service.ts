import type { Notification, PaymentMethod } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { sendEmail } from "../../lib/email.js";
import { getShopSettings } from "../scheduling/shop-settings.service.js";
import { formatLocalDateTime, PAYMENT_METHOD_LABELS } from "./format.js";
import {
  renderAppointmentCancelledEmail,
  renderAppointmentReceiptEmail,
  renderAppointmentReminderEmail,
  renderAppointmentRescheduledEmail,
  renderOtpCodeEmail,
  type EmailContent,
} from "./email-templates.js";

async function resolveRecipientEmail(notification: Notification): Promise<string | null> {
  if (!notification.clientId) return null;
  const client = await prisma.client.findUnique({ where: { id: notification.clientId }, include: { user: true } });
  return client?.user.email ?? null;
}

async function renderContent(notification: Notification): Promise<EmailContent | null> {
  const payload = notification.payload as Record<string, unknown>;

  switch (notification.template) {
    case "otp_code":
      return renderOtpCodeEmail({
        code: payload.code as string,
        expiresInMin: payload.expiresInMin as number,
      });

    case "appointment_reminder": {
      const [settings, barber] = await Promise.all([
        getShopSettings(),
        prisma.barber.findUnique({ where: { id: payload.barberId as string } }),
      ]);
      const startsAtLocal = formatLocalDateTime(payload.startsAt as string, settings.timezone);
      return renderAppointmentReminderEmail({
        code: payload.code as string,
        startsAtLocal,
        barberName: barber?.displayName,
      });
    }

    case "appointment_receipt":
      return renderAppointmentReceiptEmail({
        code: payload.code as string,
        amountReais: ((payload.amountPaidCents as number) / 100).toFixed(2).replace(".", ","),
        paymentMethodLabel: PAYMENT_METHOD_LABELS[payload.paymentMethod as PaymentMethod] ?? String(payload.paymentMethod),
      });

    case "appointment_cancelled": {
      const settings = await getShopSettings();
      return renderAppointmentCancelledEmail({
        code: payload.code as string,
        startsAtLocal: formatLocalDateTime(payload.startsAt as string, settings.timezone),
      });
    }

    case "appointment_rescheduled": {
      const settings = await getShopSettings();
      return renderAppointmentRescheduledEmail({
        code: payload.code as string,
        previousStartsAtLocal: formatLocalDateTime(payload.previousStartsAt as string, settings.timezone),
        startsAtLocal: formatLocalDateTime(payload.startsAt as string, settings.timezone),
      });
    }

    default:
      return null;
  }
}

export interface EmailDispatchResult {
  status: "SENT" | "FAILED";
  providerMessageId?: string;
}

/**
 * Ao contrário do WhatsApp (outbox → webhook → n8n entrega), e-mail
 * transacional é a própria API que entrega — não faz sentido terceirizar
 * isso para o n8n quando o Resend já resolve. Falha vira FAILED, nunca
 * derruba o loop de dispatch (uma notificação ruim não pode travar as
 * outras — ver notification-dispatcher.ts).
 */
export async function sendNotificationEmail(notification: Notification): Promise<EmailDispatchResult> {
  try {
    const to = await resolveRecipientEmail(notification);
    if (!to) return { status: "FAILED" };

    const content = await renderContent(notification);
    if (!content) return { status: "FAILED" };

    const result = await sendEmail({ to, ...content });
    return { status: "SENT", providerMessageId: result.id };
  } catch (error) {
    // não relança — uma notificação ruim não pode travar o resto do lote
    // (ver notification-dispatcher.ts), mas precisa ficar visível no log,
    // senão só descobre via GET /notifications?status=FAILED
    console.error(`[email] falha ao enviar notificação ${notification.id} (${notification.template}):`, error);
    return { status: "FAILED" };
  }
}
