-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('PURCHASE_IN', 'SALE', 'ADJUSTMENT', 'LOSS', 'RETURN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- Linhas espúrias removidas manualmente (ver comentário na migração
-- 20260814140507_appointment_status_history): o Prisma não entende a coluna
-- GENERATED time_range e tenta "corrigi-la" a cada `migrate dev`.
--   DROP INDEX "appointments_time_range_idx";
--   ALTER TABLE "appointments" ALTER COLUMN "time_range" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "order_id" TEXT;

-- payments agora tem uma terceira origem possível (order_id) — o CHECK
-- de "exatamente uma preenchida" precisa ser trocado para contar as três.
ALTER TABLE "payments" DROP CONSTRAINT "payments_exactly_one_source";

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL DEFAULT 'default',
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "specs" JSONB,
    "cost_price_cents" INTEGER NOT NULL,
    "sale_price_cents" INTEGER NOT NULL,
    "stock_qty" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL DEFAULT 'default',
    "client_id" TEXT,
    "appointment_id" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PAID',
    "total_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "unit_cost_cents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL DEFAULT 'default',
    "appointment_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "barber_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_shop_id_idx" ON "products"("shop_id");

-- CreateIndex
CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_client_id_idx" ON "orders"("client_id");

-- CreateIndex
CREATE INDEX "orders_shop_id_created_at_idx" ON "orders"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_appointment_id_key" ON "reviews"("appointment_id");

-- CreateIndex
CREATE INDEX "reviews_barber_id_idx" ON "reviews"("barber_id");

-- CreateIndex
CREATE INDEX "reviews_shop_id_idx" ON "reviews"("shop_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exatamente uma das TRÊS origens de pagamento agora (appointment/
-- client_package/order) precisa estar preenchida.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_exactly_one_source" CHECK (
    (("appointment_id" IS NOT NULL)::int + ("client_package_id" IS NOT NULL)::int + ("order_id" IS NOT NULL)::int) = 1
  );
