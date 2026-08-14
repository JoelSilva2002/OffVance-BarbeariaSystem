import { z } from "zod";

export const createPackageSchema = z.object({
  name: z.string().min(1),
  description: z.string().max(2000).optional(),
  priceCents: z.number().int().nonnegative(),
  creditsQty: z.number().int().positive(),
  scopeServiceIds: z.array(z.string().min(1)).optional(),
  validityDays: z.number().int().positive(),
  isRecurring: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type CreatePackageInput = z.infer<typeof createPackageSchema>;

export const updatePackageSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().max(2000).nullable().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  creditsQty: z.number().int().positive().optional(),
  scopeServiceIds: z.array(z.string().min(1)).optional(),
  validityDays: z.number().int().positive().optional(),
  isRecurring: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;

export const listPackagesQuerySchema = z.object({
  active: z.enum(["true", "false"]).optional(),
});

export const purchasePackageSchema = z.object({
  packageId: z.string().min(1),
  method: z.enum(["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX"]),
});
export type PurchasePackageInput = z.infer<typeof purchasePackageSchema>;
