import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { hashPassword } from "../../lib/password.js";
import { generatePasswordResetToken, hashPasswordResetToken } from "../../lib/tokens.js";
import { sendEmail } from "../../lib/email.js";
import { renderPasswordResetEmail } from "../notifications/email-templates.js";

const RESET_TOKEN_TTL_MIN = 30;

/**
 * Nunca revela se o e-mail existe ou pertence a uma conta de equipe — quem
 * chama sempre devolve 202 (ver staff-auth.routes.ts), exista a conta ou
 * não. Mesma lógica de `staffLogin` não distinguir "não existe" de "senha
 * errada" na mensagem de erro.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || (user.role !== "ADMIN" && user.role !== "BARBER") || user.status !== "ACTIVE") {
    return;
  }

  const raw = generatePasswordResetToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60_000);

  await prisma.$transaction([
    // um pedido novo invalida tokens anteriores não usados — evita vários
    // links válidos simultâneos pro mesmo usuário
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashPasswordResetToken(raw), expiresAt },
    }),
  ]);

  try {
    const content = renderPasswordResetEmail({ token: raw, expiresInMin: RESET_TOKEN_TTL_MIN });
    await sendEmail({ to: email, ...content });
  } catch (error) {
    // mesma postura defensiva do dispatcher de notificação (ver
    // email-dispatch.service.ts): falha de envio não pode virar 500 pro
    // chamador, que nem deveria saber se a conta existe.
    console.error(`[password-reset] falha ao enviar e-mail de redefinição para ${email}:`, error);
  }
}

/**
 * Consumir um token válido é tratado como possível comprometimento de
 * conta: revoga TODAS as sessões ativas (refresh tokens), não só troca a
 * senha — mesma postura de segurança usada quando reuso de refresh token é
 * detectado (ver lib/refresh-tokens.ts).
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashPasswordResetToken(rawToken);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    throw new Problem(401, "INVALID_RESET_TOKEN", "Token inválido ou expirado.");
  }

  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: hashPassword(newPassword), failedLoginAttempts: 0, lockedUntil: null },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
