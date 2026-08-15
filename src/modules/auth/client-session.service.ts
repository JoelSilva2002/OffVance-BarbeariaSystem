import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { issueRefreshToken, revokeRefreshToken, rotateRefreshToken } from "../../lib/refresh-tokens.js";

export { issueRefreshToken, revokeRefreshToken };

interface ClientSession {
  clientId: string;
  userId: string;
}

/**
 * Mesma mecânica de rotação do staff (src/lib/refresh-tokens.ts), resolvida
 * para o lado cliente: busca o Client ligado ao User do token em vez do
 * Barber. Se a conta não for mais um cliente ativo, revoga o token
 * recém-emitido antes de recusar — não deixa refresh token órfão no banco.
 */
export async function rotateClientSession(rawToken: string): Promise<ClientSession & { refreshToken: string }> {
  const { userId, refreshToken } = await rotateRefreshToken(rawToken);

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { client: true } });
  if (!user || user.status !== "ACTIVE" || user.role !== "CLIENT" || !user.client) {
    await revokeRefreshToken(refreshToken);
    throw new Problem(401, "INVALID_REFRESH_TOKEN", "Sessão inválida. Faça login novamente.");
  }

  return { clientId: user.client.id, userId: user.id, refreshToken };
}
