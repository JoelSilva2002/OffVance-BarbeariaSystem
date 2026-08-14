-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('CLIENT', 'BARBER', 'ADMIN', 'SYSTEM', 'API');

-- As duas linhas abaixo foram removidas manualmente desta migração gerada:
--   DROP INDEX "appointments_time_range_idx";
--   ALTER TABLE "appointments" ALTER COLUMN "time_range" DROP DEFAULT;
-- O Prisma não entende que "time_range" é uma coluna GENERATED ALWAYS AS ...
-- STORED (declarada como Unsupported("tstzrange") no schema — ver migração
-- 20260814094934) e acha, a cada novo `migrate dev`, que ela "deveria" não
-- ter default e recalcula um diff espúrio para "corrigi-la". Aplicar essas
-- linhas quebra com "column is a generated column" (42601). Sempre que uma
-- migração futura tentar mexer em time_range/appointments_time_range_idx,
-- gere com --create-only e remova essas linhas manualmente antes de aplicar.

-- CreateTable
CREATE TABLE "appointment_status_history" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "from_status" "AppointmentStatus",
    "to_status" "AppointmentStatus" NOT NULL,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_status_history_appointment_id_created_at_idx" ON "appointment_status_history"("appointment_id", "created_at");

-- AddForeignKey
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
