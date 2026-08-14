import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";

type DbClient = typeof prisma | Prisma.TransactionClient;

export async function getLoyaltyBalance(db: DbClient, clientId: string): Promise<number> {
  const result = await db.loyaltyEntry.aggregate({ where: { clientId }, _sum: { deltaPoints: true } });
  return result._sum.deltaPoints ?? 0;
}

export async function getLoyaltySummary(clientId: string, limit = 50) {
  const [balance, entries] = await Promise.all([
    getLoyaltyBalance(prisma, clientId),
    prisma.loyaltyEntry.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: limit }),
  ]);
  return { balance, entries };
}

export async function earnPoints(
  tx: Prisma.TransactionClient,
  clientId: string,
  points: number,
  refType: string,
  refId: string,
) {
  if (points <= 0) return;
  await tx.loyaltyEntry.create({ data: { clientId, deltaPoints: points, reason: "EARN", refType, refId } });
}

/** Resgate só acontece atrelado a um gasto real (conclusão de atendimento) — nunca solto. */
export async function redeemPoints(
  tx: Prisma.TransactionClient,
  clientId: string,
  points: number,
  refType: string,
  refId: string,
) {
  if (points <= 0) return;
  const balance = await getLoyaltyBalance(tx, clientId);
  if (balance < points) {
    throw new Problem(
      422,
      "INSUFFICIENT_LOYALTY_POINTS",
      `Saldo de pontos insuficiente (${balance} disponíveis, ${points} solicitados).`,
    );
  }
  await tx.loyaltyEntry.create({ data: { clientId, deltaPoints: -points, reason: "REDEEM", refType, refId } });
}
