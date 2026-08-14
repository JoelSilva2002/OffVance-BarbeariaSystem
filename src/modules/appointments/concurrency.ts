import type { Prisma } from "@prisma/client";

const EXCLUSION_CONSTRAINT = "appointments_sem_sobreposicao";

/**
 * Detecta a violação da constraint de exclusão (camada 3, docs/ARQUITETURA.md
 * §03) independente de qual classe de erro o Prisma usar para embrulhar o
 * erro do Postgres — ele não tem um código dedicado para EXCLUDE, então
 * checamos a mensagem crua (SQLSTATE 23P01 ou o nome da constraint).
 */
export function isExclusionViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("23P01") || error.message.includes(EXCLUSION_CONSTRAINT);
}

/** Serializa concorrentes no mesmo barbeiro/dia local (camada 2). */
export async function lockBarberDay(tx: Prisma.TransactionClient, barberId: string, localDate: string) {
  const lockKey = `${barberId}:${localDate}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
}
