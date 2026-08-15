import { env } from "../../config/env.js";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

function wrapHtml(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f4f4f5; padding:24px; margin:0;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <p style="font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#888;margin:0 0 20px;">${env.SHOP_NAME}</p>
      ${bodyHtml}
      <p style="color:#999;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">
        Esta é uma mensagem automática — não é preciso responder.
      </p>
    </div>
  </body>
</html>`;
}

export function renderOtpCodeEmail(payload: { code: string; expiresInMin: number }): EmailContent {
  return {
    subject: `${payload.code} é o seu código de confirmação`,
    html: wrapHtml(`
      <h1 style="font-size:18px;margin:0 0 16px;">Código de confirmação</h1>
      <p style="color:#333;margin:0 0 8px;">Use o código abaixo para confirmar seu acesso:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;text-align:center;margin:24px 0;color:#111;">${payload.code}</p>
      <p style="color:#666;font-size:14px;margin:0;">Válido por ${payload.expiresInMin} minutos. Se você não pediu este código, ignore este e-mail.</p>
    `),
    text: `Seu código de confirmação é ${payload.code}. Válido por ${payload.expiresInMin} minutos.`,
  };
}

export function renderAppointmentReminderEmail(payload: {
  code: string;
  startsAtLocal: string;
  barberName?: string;
}): EmailContent {
  const withBarber = payload.barberName ? ` com ${payload.barberName}` : "";
  return {
    subject: `Lembrete: seu horário é ${payload.startsAtLocal}`,
    html: wrapHtml(`
      <h1 style="font-size:18px;margin:0 0 16px;">Lembrete de agendamento</h1>
      <p style="color:#333;margin:0 0 8px;">Seu horário${withBarber} está chegando:</p>
      <p style="font-size:20px;font-weight:700;margin:16px 0;color:#111;">${payload.startsAtLocal}</p>
      <p style="color:#666;font-size:14px;margin:0;">Código do agendamento: ${payload.code}</p>
    `),
    text: `Lembrete: seu horário${withBarber} é ${payload.startsAtLocal}. Código: ${payload.code}.`,
  };
}

export function renderAppointmentReceiptEmail(payload: {
  code: string;
  amountReais: string;
  paymentMethodLabel: string;
}): EmailContent {
  return {
    subject: `Recibo do seu atendimento — R$ ${payload.amountReais}`,
    html: wrapHtml(`
      <h1 style="font-size:18px;margin:0 0 16px;">Recibo</h1>
      <p style="color:#333;margin:0 0 8px;">Obrigado pela visita! Aqui está o resumo:</p>
      <table style="width:100%;font-size:14px;color:#333;margin:16px 0;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#666;">Código</td><td style="padding:6px 0;text-align:right;">${payload.code}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Pagamento</td><td style="padding:6px 0;text-align:right;">${payload.paymentMethodLabel}</td></tr>
        <tr><td style="padding:10px 0 0;font-weight:700;">Total</td><td style="padding:10px 0 0;text-align:right;font-weight:700;">R$ ${payload.amountReais}</td></tr>
      </table>
    `),
    text: `Recibo do atendimento ${payload.code}: R$ ${payload.amountReais} via ${payload.paymentMethodLabel}.`,
  };
}

export function renderPasswordResetEmail(payload: { token: string; expiresInMin: number }): EmailContent {
  // Sem painel administrativo com URL própria ainda (sistema é API-first —
  // ver docs/ARQUITETURA.md), o e-mail mostra o token cru para colar onde
  // for pedido; se ADMIN_PANEL_URL existir no futuro, vira um link normal.
  const link = env.ADMIN_PANEL_URL ? `${env.ADMIN_PANEL_URL}/reset-password?token=${payload.token}` : undefined;
  return {
    subject: "Redefinição de senha",
    html: wrapHtml(`
      <h1 style="font-size:18px;margin:0 0 16px;">Redefinir senha</h1>
      <p style="color:#333;margin:0 0 8px;">Alguém pediu para redefinir a senha desta conta. Se não foi você, ignore este e-mail.</p>
      ${
        link
          ? `<p style="margin:24px 0;"><a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;">Redefinir senha</a></p>`
          : `<p style="font-family:monospace;font-size:14px;word-break:break-all;background:#f4f4f5;padding:12px;border-radius:6px;margin:16px 0;">${payload.token}</p>`
      }
      <p style="color:#666;font-size:14px;margin:0;">Válido por ${payload.expiresInMin} minutos.</p>
    `),
    text: link
      ? `Redefina sua senha: ${link} (válido por ${payload.expiresInMin} minutos)`
      : `Token de redefinição de senha: ${payload.token} (válido por ${payload.expiresInMin} minutos)`,
  };
}
