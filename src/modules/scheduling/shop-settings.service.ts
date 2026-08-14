import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

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
  };
}
