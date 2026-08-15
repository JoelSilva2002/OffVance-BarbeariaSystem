-- AlterEnum
ALTER TYPE "LoyaltyReason" ADD VALUE 'EXPIRE';

-- Prisma re-diffa "time_range" (coluna gerada, que ele não modela) toda vez
-- que roda migrate dev e tenta emitir DROP INDEX + ALTER COLUMN ... DROP
-- DEFAULT pra ela — removido manualmente, como em toda migração desde que
-- essa coluna existe (ver README §Migrações).

-- AlterTable
ALTER TABLE "shop_settings" ADD COLUMN     "loyalty_points_expiration_days" INTEGER;
