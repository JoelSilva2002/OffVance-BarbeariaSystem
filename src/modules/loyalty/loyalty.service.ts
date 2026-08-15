import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { getShopSettings } from "../scheduling/shop-settings.service.js";

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

/**
 * `expiresAt` fica gravado no próprio lançamento de EARN (não num campo de
 * config solto) — carimba a política vigente no momento em que o ponto foi
 * ganho, então trocar `loyaltyPointsExpirationDays` depois nunca reescreve
 * o prazo de pontos já concedidos. `null` (padrão) = nunca expira.
 */
export async function earnPoints(
  tx: Prisma.TransactionClient,
  clientId: string,
  points: number,
  refType: string,
  refId: string,
) {
  if (points <= 0) return;
  const settings = await getShopSettings(tx);
  const expiresAt = settings.loyaltyPointsExpirationDays
    ? new Date(Date.now() + settings.loyaltyPointsExpirationDays * 24 * 3_600_000)
    : null;
  await tx.loyaltyEntry.create({ data: { clientId, deltaPoints: points, reason: "EARN", refType, refId, expiresAt } });
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

interface Lot {
  remaining: number;
  expiresAt: Date | null;
}

/**
 * Reconstrói, em memória, quanto de cada lançamento positivo (EARN — ou, no
 * futuro, um ADJUST manual positivo) ainda está "vivo": um resgate consome
 * o lote mais antigo primeiro (FIFO), igual à semântica usual de pontos com
 * validade. Um EXPIRE não passa pelo FIFO genérico — ele mira o lote exato
 * que baixou (via `refId`), senão reprocessar o histórico depois de uma
 * baixa poderia consumir o lote errado.
 *
 * Reescaneia o histórico inteiro do cliente a cada chamada — sem tabela de
 * saldo-por-lote, que só se justificaria se isso ficar lento de verdade
 * (mesma lógica de reports.service.ts).
 */
function computeOutstandingLots(entries: { id: string; deltaPoints: number; reason: string; refId: string | null; expiresAt: Date | null }[]) {
  const lots = new Map<string, Lot>();

  for (const entry of entries) {
    if (entry.reason === "EXPIRE") {
      const lot = entry.refId ? lots.get(entry.refId) : undefined;
      if (lot) lot.remaining += entry.deltaPoints; // deltaPoints já vem negativo
      continue;
    }
    if (entry.deltaPoints > 0) {
      lots.set(entry.id, { remaining: entry.deltaPoints, expiresAt: entry.expiresAt });
      continue;
    }
    let toConsume = -entry.deltaPoints;
    for (const lot of lots.values()) {
      if (toConsume <= 0) break;
      if (lot.remaining <= 0) continue;
      const take = Math.min(lot.remaining, toConsume);
      lot.remaining -= take;
      toConsume -= take;
    }
  }

  return lots;
}

async function expirePointsForClient(clientId: string, now: Date): Promise<number> {
  const entries = await prisma.loyaltyEntry.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });
  const lots = computeOutstandingLots(entries);

  let expired = 0;
  for (const [entryId, lot] of lots) {
    if (lot.remaining > 0 && lot.expiresAt && lot.expiresAt <= now) {
      await prisma.loyaltyEntry.create({
        data: { clientId, deltaPoints: -lot.remaining, reason: "EXPIRE", refType: "loyalty_entry", refId: entryId },
      });
      expired += 1;
    }
  }
  return expired;
}

/**
 * Job de manutenção (chamado pelo loop de background em server.ts, nunca
 * por uma rota): baixa o que sobrou de cada lote de EARN vencido. Idempotente
 * — rodar de novo não duplica baixa, porque o EXPIRE já criado zera o
 * `remaining` daquele lote específico na próxima reconstrução do FIFO.
 */
export async function expireLoyaltyPoints(now: Date = new Date()): Promise<number> {
  const clientsWithExpired = await prisma.loyaltyEntry.findMany({
    where: { reason: "EARN", expiresAt: { lte: now } },
    distinct: ["clientId"],
    select: { clientId: true },
  });

  let total = 0;
  for (const { clientId } of clientsWithExpired) {
    total += await expirePointsForClient(clientId, now);
  }
  return total;
}
