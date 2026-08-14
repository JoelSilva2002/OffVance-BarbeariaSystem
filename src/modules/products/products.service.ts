import { Prisma, type StockMovementReason, type Product } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import type { CreateProductInput, UpdateProductInput } from "./products.schema.js";

// Vitrine pública: nunca expõe custo (docs/ARQUITETURA.md §02).
function publicProduct(product: Product) {
  const { costPriceCents: _costPriceCents, ...rest } = product;
  return rest;
}

export async function listProducts(active?: string) {
  const products = await prisma.product.findMany({
    where: { active: active === undefined ? undefined : active === "true" },
    include: { images: { orderBy: { position: "asc" } } },
    orderBy: { name: "asc" },
  });
  return products.map(publicProduct);
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!product) throw new Problem(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.");
  return publicProduct(product);
}

async function assertProductExists(id: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw new Problem(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.");
  return product;
}

export async function createProduct(input: CreateProductInput) {
  return prisma.product.create({
    data: {
      sku: input.sku,
      name: input.name,
      description: input.description,
      specs: input.specs as Prisma.InputJsonValue | undefined,
      costPriceCents: input.costPriceCents,
      salePriceCents: input.salePriceCents,
      stockQty: input.stockQty ?? 0,
      minStock: input.minStock ?? 0,
      active: input.active ?? true,
    },
  });
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  await assertProductExists(id);
  return prisma.product.update({
    where: { id },
    data: {
      ...input,
      specs: input.specs === null ? Prisma.JsonNull : (input.specs as Prisma.InputJsonValue | undefined),
    },
  });
}

export async function addProductImage(productId: string, url: string, position?: number) {
  await assertProductExists(productId);
  return prisma.productImage.create({ data: { productId, url, position: position ?? 0 } });
}

export async function removeProductImage(productId: string, imageId: string) {
  const image = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!image || image.productId !== productId) {
    throw new Problem(404, "IMAGE_NOT_FOUND", "Imagem não encontrada.");
  }
  await prisma.productImage.delete({ where: { id: imageId } });
}

/**
 * Ajusta estoque com SELECT ... FOR UPDATE — mesma trava do crédito de
 * pacote (docs/ARQUITETURA.md §03): duas baixas concorrentes da última
 * unidade não podem ambas ler "1 disponível" e vender em dobro.
 */
export async function adjustStock(
  tx: Prisma.TransactionClient,
  productId: string,
  delta: number,
  reason: StockMovementReason,
  refType?: string,
  refId?: string,
  notes?: string,
): Promise<number> {
  const rows = await tx.$queryRaw<
    { id: string; stock_qty: number }[]
  >`SELECT id, stock_qty FROM products WHERE id = ${productId} FOR UPDATE`;
  const product = rows[0];
  if (!product) throw new Problem(404, "PRODUCT_NOT_FOUND", "Produto não encontrado.");

  const newQty = product.stock_qty + delta;
  if (newQty < 0) {
    throw new Problem(
      422,
      "INSUFFICIENT_STOCK",
      `Estoque insuficiente (${product.stock_qty} disponível, ${-delta} solicitado).`,
    );
  }

  await tx.stockMovement.create({ data: { productId, delta, reason, refType, refId, notes } });
  await tx.product.update({ where: { id: productId }, data: { stockQty: newQty } });

  return newQty;
}

export async function recordManualStockMovement(
  productId: string,
  delta: number,
  reason: StockMovementReason,
  notes?: string,
) {
  await assertProductExists(productId);
  return prisma.$transaction((tx) => adjustStock(tx, productId, delta, reason, "manual", undefined, notes));
}

export async function listStockMovements(productId: string, limit: number) {
  await assertProductExists(productId);
  return prisma.stockMovement.findMany({ where: { productId }, orderBy: { createdAt: "desc" }, take: limit });
}
