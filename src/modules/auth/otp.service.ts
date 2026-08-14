import { randomInt } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";

const OTP_TTL_MIN = 5;
const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 30;

function generateCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/**
 * Gera o código e materializa o envio como uma `notification` (canal
 * WhatsApp) — mesma esteira dos lembretes: o backend decide o quê e
 * quando, o n8n entrega de fato.
 */
export async function requestOtp(phone: string) {
  const recent = await prisma.otpCode.findFirst({
    where: { phone, createdAt: { gte: new Date(Date.now() - RESEND_COOLDOWN_SEC * 1000) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    throw new Problem(429, "OTP_RATE_LIMITED", `Aguarde ${RESEND_COOLDOWN_SEC}s antes de pedir um novo código.`);
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000);

  await prisma.$transaction(async (tx) => {
    await tx.otpCode.create({ data: { phone, code, expiresAt } });
    await tx.notification.create({
      data: {
        clientId: null,
        channel: "WHATSAPP",
        template: "otp_code",
        payload: { phone, code, expiresInMin: OTP_TTL_MIN },
        scheduledFor: new Date(),
        dedupKey: `otp:${phone}:${Date.now()}`,
      },
    });
  });

  return { expiresAt, code };
}

/** No primeiro acesso, cria User + Client automaticamente (docs/ARQUITETURA.md §02). */
export async function verifyOtp(phone: string, code: string) {
  const otp = await prisma.otpCode.findFirst({ where: { phone, consumedAt: null }, orderBy: { createdAt: "desc" } });

  if (!otp || otp.expiresAt < new Date()) {
    throw new Problem(401, "OTP_INVALID", "Código inválido ou expirado.");
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    throw new Problem(429, "OTP_TOO_MANY_ATTEMPTS", "Muitas tentativas. Peça um novo código.");
  }
  if (otp.code !== code) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new Problem(401, "OTP_INVALID", "Código inválido ou expirado.");
  }

  await prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { phone }, include: { client: true } });
    if (!user) {
      user = await tx.user.create({ data: { phone, role: "CLIENT", status: "ACTIVE" }, include: { client: true } });
    }

    const client = user.client ?? (await tx.client.create({ data: { userId: user.id } }));
    return { user, client };
  });
}
