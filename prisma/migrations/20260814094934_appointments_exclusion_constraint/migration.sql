-- Garantia anti-double-booking (ver docs/ARQUITETURA.md, seção 03, camada 3).
--
-- Prisma não modela `tstzrange` nem `EXCLUDE USING gist` nativamente, então esta
-- migração é escrita à mão. A coluna `time_range` é gerada a partir de
-- `starts_at`/`ends_at` (ambas já `timestamptz`) e a constraint de exclusão
-- impede duas linhas do MESMO barbeiro com intervalos que se sobrepõem,
-- considerando apenas os status que de fato ocupam a cadeira (AGENDADO,
-- CONFIRMADO, EM_ATENDIMENTO, PENDENTE_PAGAMENTO — este último cobre o hold
-- durante o checkout de pacote).
--
-- '[)' = fechado no início, aberto no fim: um atendimento terminando às 09:30
-- e outro começando às 09:30 NÃO colidem.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD COLUMN "time_range" tstzrange
  GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_sem_sobreposicao"
  EXCLUDE USING gist (
    "barber_id" WITH =,
    "time_range" WITH &&
  )
  WHERE (
    "status" IN ('PENDENTE_PAGAMENTO', 'AGENDADO', 'CONFIRMADO', 'EM_ATENDIMENTO')
  );

CREATE INDEX "appointments_time_range_idx" ON "appointments" USING gist ("time_range");
