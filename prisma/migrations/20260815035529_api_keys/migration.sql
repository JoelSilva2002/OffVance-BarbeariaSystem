-- Linhas espúrias removidas manualmente (ver comentário na migração
-- 20260814140507_appointment_status_history): o Prisma não entende a coluna
-- GENERATED time_range e tenta "corrigi-la" a cada `migrate dev`.
--   DROP INDEX "appointments_time_range_idx";
--   ALTER TABLE "appointments" ALTER COLUMN "time_range" DROP DEFAULT;

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_used_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_shop_id_idx" ON "api_keys"("shop_id");
