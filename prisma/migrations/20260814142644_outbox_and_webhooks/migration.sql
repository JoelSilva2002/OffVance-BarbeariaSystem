-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'ABANDONED');

-- Linhas espúrias removidas manualmente (ver comentário na migração
-- 20260814140507_appointment_status_history): o Prisma não entende a coluna
-- GENERATED time_range e tenta "corrigi-la" a cada `migrate dev`.
--   DROP INDEX "appointments_time_range_idx";
--   ALTER TABLE "appointments" ALTER COLUMN "time_range" DROP DEFAULT;

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL DEFAULT 'default',
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL DEFAULT 'default',
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "subscribed_events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "outbox_event_id" TEXT NOT NULL,
    "webhook_endpoint_id" TEXT NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "response_code" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(3) NOT NULL,
    "last_attempt_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_events_shop_id_occurred_at_idx" ON "outbox_events"("shop_id", "occurred_at");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_idx" ON "outbox_events"("published_at");

-- CreateIndex
CREATE INDEX "outbox_events_event_type_occurred_at_idx" ON "outbox_events"("event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "webhook_endpoints_shop_id_idx" ON "webhook_endpoints"("shop_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_next_retry_at_idx" ON "webhook_deliveries"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_outbox_event_id_idx" ON "webhook_deliveries"("outbox_event_id");

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_outbox_event_id_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_endpoint_id_fkey" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
