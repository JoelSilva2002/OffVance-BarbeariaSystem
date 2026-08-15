import { Resend } from "resend";
import { env } from "../config/env.js";

let client: Resend | undefined;

function getClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY não configurada — e-mail não pode ser enviado.");
  }
  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Lança em qualquer falha — quem chama decide o que fazer (ver email-dispatch.service.ts). */
export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const resend = getClient();
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error || !data) {
    throw new Error(`Falha ao enviar e-mail via Resend: ${error?.message ?? "resposta vazia"}`);
  }

  return { id: data.id };
}
