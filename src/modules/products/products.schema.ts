import { z } from "zod";

export const createProductSchema = z.object({
  sku: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().max(2000).optional(),
  specs: z.record(z.string(), z.unknown()).optional(),
  costPriceCents: z.number().int().nonnegative(),
  salePriceCents: z.number().int().nonnegative(),
  stockQty: z.number().int().nonnegative().optional(),
  minStock: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  sku: z.string().min(1).nullable().optional(),
  name: z.string().min(1).optional(),
  description: z.string().max(2000).nullable().optional(),
  specs: z.record(z.string(), z.unknown()).nullable().optional(),
  costPriceCents: z.number().int().nonnegative().optional(),
  salePriceCents: z.number().int().nonnegative().optional(),
  minStock: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const listProductsQuerySchema = z.object({
  active: z.enum(["true", "false"]).optional(),
});

export const addProductImageSchema = z.object({
  url: z.string().url(),
  position: z.number().int().nonnegative().optional(),
});

// SALE fica de fora de propósito: só o fluxo de pedidos pode gerar baixa por venda.
export const stockMovementSchema = z.object({
  delta: z.number().int().refine((v) => v !== 0, "delta não pode ser zero"),
  reason: z.enum(["PURCHASE_IN", "ADJUSTMENT", "LOSS", "RETURN"]),
  notes: z.string().max(500).optional(),
});
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
