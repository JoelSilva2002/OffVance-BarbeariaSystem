import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { UpdateShopSettingsInput } from "./shop-settings.schema.js";

const SHOP_ID = "default";

type Client = typeof prisma | Prisma.TransactionClient;

/**
 * shop_settings é onde mora todo número mágico do agendamento (ver
 * docs/ARQUITETURA.md, seção 01). Sem linha cadastrada, cai em defaults
 * seguros — mas o normal é existir uma linha via seed/admin.
 */
export async function getShopSettings(db: Client = prisma) {
  const settings = await db.shopSettings.findUnique({ where: { shopId: SHOP_ID } });
  if (settings) return settings;

  return {
    shopId: SHOP_ID,
    timezone: "America/Sao_Paulo",
    slotStepMin: 15,
    minLeadTimeMin: 60,
    maxAdvanceDays: 60,
    cancelDeadlineHours: 2,
    rescheduleDeadlineHours: 2,
    autoConfirmHoursBefore: 24,
    loyaltyPointsPerCurrency: 1,
    loyaltyPointValueCents: 5,
    loyaltyPointsExpirationDays: null as number | null,
  };
}

/**
 * Upsert em vez de update puro: se ainda não existir linha (sistema
 * recém-criado, antes do primeiro seed), o primeiro PATCH já cria uma —
 * sem isso, um ADMIN mudando configuração num sistema novo esbarraria num
 * 404 sem sentido.
 */
export async function updateShopSettings(input: UpdateShopSettingsInput) {
  return prisma.shopSettings.upsert({
    where: { shopId: SHOP_ID },
    update: input,
    create: { shopId: SHOP_ID, ...input },
  });
}
