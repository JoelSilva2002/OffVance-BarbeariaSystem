-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'PACKAGE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClientPackageStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LoyaltyReason" AS ENUM ('EARN', 'REDEEM', 'ADJUST');

-- Linhas espúrias removidas manualmente (ver comentário na migração
-- 20260814140507_appointment_status_history): o Prisma não entende a coluna
-- GENERATED time_range e tenta "corrigi-la" a cada `migrate dev`.
--   DROP INDEX "appointments_time_range_idx";
--   ALTER TABLE "appointments" ALTER COLUMN "time_range" DROP DEFAULT;

-- AlterTable
ALTER TABLE "shop_settings" ADD COLUMN     "loyalty_point_value_cents" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "loyalty_points_per_currency" DECIMAL(6,2) NOT NULL DEFAULT 1.00;

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL DEFAULT 'default',
    "appointment_id" TEXT,
    "client_package_id" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PAID',
    "paid_at" TIMESTAMPTZ(3),
    "external_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_cents" INTEGER NOT NULL,
    "credits_qty" INTEGER NOT NULL,
    "scope_service_ids" TEXT[],
    "validity_days" INTEGER NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_packages" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL DEFAULT 'default',
    "client_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "purchased_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "credits_total" INTEGER NOT NULL,
    "status" "ClientPackageStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "client_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_credit_entries" (
    "id" TEXT NOT NULL,
    "client_package_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_credit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_entries" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL DEFAULT 'default',
    "client_id" TEXT NOT NULL,
    "delta_points" INTEGER NOT NULL,
    "reason" "LoyaltyReason" NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_appointment_id_idx" ON "payments"("appointment_id");

-- CreateIndex
CREATE INDEX "payments_client_package_id_idx" ON "payments"("client_package_id");

-- CreateIndex
CREATE INDEX "payments_shop_id_created_at_idx" ON "payments"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "packages_shop_id_idx" ON "packages"("shop_id");

-- CreateIndex
CREATE INDEX "client_packages_client_id_idx" ON "client_packages"("client_id");

-- CreateIndex
CREATE INDEX "client_packages_shop_id_idx" ON "client_packages"("shop_id");

-- CreateIndex
CREATE INDEX "package_credit_entries_client_package_id_idx" ON "package_credit_entries"("client_package_id");

-- CreateIndex
CREATE INDEX "loyalty_entries_client_id_created_at_idx" ON "loyalty_entries"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "loyalty_entries_shop_id_idx" ON "loyalty_entries"("shop_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_package_id_fkey" FOREIGN KEY ("client_package_id") REFERENCES "client_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_credit_entries" ADD CONSTRAINT "package_credit_entries_client_package_id_fkey" FOREIGN KEY ("client_package_id") REFERENCES "client_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_credit_entries" ADD CONSTRAINT "package_credit_entries_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exatamente uma das duas origens de pagamento precisa estar preenchida —
-- mesmo raciocínio da constraint de exclusão de appointments: a garantia
-- vive no banco, não só na validação da aplicação.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_exactly_one_source" CHECK (
    (("appointment_id" IS NOT NULL)::int + ("client_package_id" IS NOT NULL)::int) = 1
  );
