-- Linhas espúrias removidas manualmente (ver comentário na migração
-- 20260814140507_appointment_status_history): o Prisma não entende a coluna
-- GENERATED time_range e tenta "corrigi-la" a cada `migrate dev`.
--   DROP INDEX "appointments_time_range_idx";
--   ALTER TABLE "appointments" ALTER COLUMN "time_range" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ(3);
