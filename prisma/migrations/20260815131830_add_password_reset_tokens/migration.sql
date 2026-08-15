-- As duas linhas abaixo foram removidas manualmente (ver README §Migrações):
-- "DROP INDEX appointments_time_range_idx" + "ALTER TABLE appointments ALTER
-- COLUMN time_range DROP DEFAULT" — `prisma migrate dev` sempre tenta
-- "corrigir" essa coluna gerada (time_range), que não tem nada a ver com
-- esta migração. Aplicar essas linhas quebraria (coluna gerada não aceita
-- DROP DEFAULT) e destruiria o índice GiST que sustenta o anti-double-booking.

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
