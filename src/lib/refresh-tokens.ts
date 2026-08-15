import { prisma } from "./prisma.js";
import { Problem } from "./problem.js";
import { generateRefreshToken, hashRefreshToken } from "./tokens.js";

const REFRESH_TOKEN_TTL_DAYS = 30;

/**
 * Ciclo de vida do refresh token — compartilhado entre a sessão de cliente
 * (OTP) e a de equipe (e-mail+senha). O que muda entre os dois é só quais
 * claims vão no access token; a mecânica de emitir/rotacionar/revogar é
 * idêntica, então mora aqui uma vez só.
 */
export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3_600_000),
    },
  });
  return raw;
}

/**
 * Rotação: cada uso troca o token por um novo e revoga o anterior.
 * Reapresentar um token já revogado é sinal de roubo — revoga TODAS as
 * sessões ativas do usuário, não só recusa aquele uso.
 *
 * Devolve só `userId` + o novo token — quem chama decide se esse usuário
 * ainda é elegível para o tipo de sessão (cliente ativo, staff ativo etc.)
 * e, se não for, deve chamar `revokeRefreshToken` no token recém-emitido.
 */
export async function rotateRefreshToken(rawToken: string): Promise<{ userId: string; refreshToken: string }> {
  const tokenHash = hashRefreshToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    throw new Problem(401, "INVALID_REFRESH_TOKEN", "Sessão inválida. Faça login novamente.");
  }

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new Problem(
      401,
      "REFRESH_TOKEN_REUSED",
      "Sessão comprometida — todos os dispositivos foram desconectados. Faça login novamente.",
    );
  }

  if (existing.expiresAt < new Date()) {
    throw new Problem(401, "REFRESH_TOKEN_EXPIRED", "Sessão expirada. Faça login novamente.");
  }

  const newRaw = generateRefreshToken();
  const [newToken] = await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: hashRefreshToken(newRaw),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3_600_000),
      },
    }),
    prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } }),
  ]);
  await prisma.refreshToken.update({ where: { id: existing.id }, data: { replacedById: newToken.id } });

  return { userId: existing.userId, refreshToken: newRaw };
}

/** Encerra só esta sessão/dispositivo — os demais refresh tokens do usuário continuam válidos. */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
