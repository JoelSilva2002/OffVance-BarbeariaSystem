import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { getPackage } from "./packages.service.js";
import type { PurchasePackageInput } from "./packages.schema.js";

export async function purchasePackage(clientId: string, input: PurchasePackageInput) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Problem(404, "CLIENT_NOT_FOUND", "Cliente não encontrado.");

  const pkg = await getPackage(input.packageId);
  if (!pkg.active) throw new Problem(422, "PACKAGE_INACTIVE", "Este pacote não está mais disponível.");

  return prisma.$transaction(async (tx) => {
    const clientPackage = await tx.clientPackage.create({
      data: {
        clientId,
        packageId: pkg.id,
        expiresAt: new Date(Date.now() + pkg.validityDays * 24 * 60 * 60_000),
        creditsTotal: pkg.creditsQty,
        status: "ACTIVE",
      },
    });

    const payment = await tx.payment.create({
      data: {
        clientPackageId: clientPackage.id,
        amountCents: pkg.priceCents,
        method: input.method,
        status: "PAID",
        paidAt: new Date(),
      },
    });

    return { ...clientPackage, payment };
  });
}

async function creditsConsumed(db: typeof prisma | Prisma.TransactionClient, clientPackageId: string): Promise<number> {
  const result = await db.packageCreditEntry.aggregate({ where: { clientPackageId }, _sum: { delta: true } });
  return result._sum.delta ?? 0;
}

export async function listClientPackages(clientId: string) {
  const packages = await prisma.clientPackage.findMany({
    where: { clientId },
    include: { package: true },
    orderBy: { purchasedAt: "desc" },
  });

  return Promise.all(
    packages.map(async (cp) => ({
      ...cp,
      creditsRemaining: cp.creditsTotal + (await creditsConsumed(prisma, cp.id)),
      isExpired: cp.expiresAt < new Date(),
    })),
  );
}

/**
 * Debita um crédito com `SELECT ... FOR UPDATE` (docs/ARQUITETURA.md §03,
 * "consome crédito de pacote com trava de linha"): sem a trava, dois
 * atendimentos do mesmo cliente concluídos ao mesmo tempo poderiam ambos
 * ler "1 crédito disponível" e debitar além do saldo real.
 */
export async function consumePackageCredit(
  tx: Prisma.TransactionClient,
  clientPackageId: string,
  clientId: string,
  appointmentId: string,
  serviceIds: string[],
) {
  const rows = await tx.$queryRaw<
    { id: string; client_id: string; package_id: string; expires_at: Date; credits_total: number; status: string }[]
  >`SELECT * FROM client_packages WHERE id = ${clientPackageId} FOR UPDATE`;
  const clientPackage = rows[0];

  if (!clientPackage) throw new Problem(404, "CLIENT_PACKAGE_NOT_FOUND", "Pacote do cliente não encontrado.");
  if (clientPackage.client_id !== clientId) {
    throw new Problem(403, "CLIENT_PACKAGE_NOT_OWNED", "Este pacote não pertence a este cliente.");
  }
  if (clientPackage.status !== "ACTIVE") {
    throw new Problem(422, "CLIENT_PACKAGE_INACTIVE", "Este pacote não está mais ativo.");
  }
  if (clientPackage.expires_at < new Date()) {
    throw new Problem(422, "CLIENT_PACKAGE_EXPIRED", "Este pacote expirou.");
  }

  const pkg = await tx.package.findUniqueOrThrow({ where: { id: clientPackage.package_id } });
  if (pkg.scopeServiceIds.length > 0 && !serviceIds.every((id) => pkg.scopeServiceIds.includes(id))) {
    throw new Problem(422, "CLIENT_PACKAGE_SCOPE_MISMATCH", "Este pacote não cobre um ou mais dos serviços escolhidos.");
  }

  const remaining = clientPackage.credits_total + (await creditsConsumed(tx, clientPackageId));
  if (remaining <= 0) {
    throw new Problem(422, "NO_CREDITS_LEFT", "Este pacote não tem mais créditos disponíveis.");
  }

  await tx.packageCreditEntry.create({
    data: { clientPackageId, appointmentId, delta: -1, reason: "Consumido em atendimento" },
  });
}
