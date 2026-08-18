import type { Notification, PaymentMethod } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { getShopSettings } from "../scheduling/shop-settings.service.js";
import { formatLocalDateTime, PAYMENT_METHOD_LABELS } from "./format.js";
import {
  renderAppointmentReceiptWhatsApp,
  renderAppointmentReminderWhatsApp,
  renderOtpCodeWhatsApp,
} from "./whatsapp-templates.js";

export interface WhatsAppRecipient {
  phone: string;
  name: string;
}

/**
 * Com `clientId`, o telefone vem do cadastro (resolvido aqui, em tempo de
 * despacho — mesma hora em que o e-mail resolve endereço/nome/fuso, ver
 * email-dispatch.service.ts — pra manter os dois canais simétricos e o
 * telefone só passar pelo outbox_events, nunca dormir semanas numa linha
 * de notifications). Sem `clientId` (hoje, só o caso do OTP: o cliente
 * ainda não existe no primeiro login), cai no telefone que já veio no
 * payload da notificação.
 */
export async function resolveWhatsAppRecipient(notification: Notification): Promise<WhatsAppRecipient | null> {
  if (notification.clientId) {
    const client = await prisma.client.findUnique({ where: { id: notification.clientId }, include: { user: true } });
    if (!client) return null;
    return { phone: client.user.phone, name: client.fullName ?? "cliente" };
  }

  const payload = notification.payload as Record<string, unknown>;
  const phone = payload.phone as string | undefined;
  if (!phone) return null;
  return { phone, name: "cliente" };
}

export async function renderWhatsAppMessage(notification: Notification, recipientName: string): Promise<string | null> {
  const payload = notification.payload as Record<string, unknown>;

  switch (notification.template) {
    case "otp_code":
      return renderOtpCodeWhatsApp({ code: payload.code as string, expiresInMin: payload.expiresInMin as number });

    case "appointment_reminder": {
      const [settings, barber] = await Promise.all([
        getShopSettings(),
        prisma.barber.findUnique({ where: { id: payload.barberId as string } }),
      ]);
      return renderAppointmentReminderWhatsApp({
        clientName: recipientName,
        startsAtLocal: formatLocalDateTime(payload.startsAt as string, settings.timezone),
        barberName: barber?.displayName,
      });
    }

    case "appointment_receipt":
      return renderAppointmentReceiptWhatsApp({
        clientName: recipientName,
        amountReais: ((payload.amountPaidCents as number) / 100).toFixed(2).replace(".", ","),
        paymentMethodLabel: PAYMENT_METHOD_LABELS[payload.paymentMethod as PaymentMethod] ?? String(payload.paymentMethod),
      });

    default:
      return null;
  }
}
