import { prisma } from "../../src/lib/prisma.js";

/**
 * TRUNCATE ... CASCADE em todas as tabelas do schema (menos a de controle
 * do Prisma) — resolve a ordem de dependência (FK) sozinho, ao contrário de
 * DELETE manual tabela por tabela (a forma dolorosa como este projeto foi
 * testado manualmente a sessão inteira antes de existir isto aqui).
 */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;

  const names = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
