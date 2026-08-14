import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(1),
  position: z.number().int().nonnegative().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  position: z.number().int().nonnegative().optional(),
});

export const createServiceSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().max(2000).optional(),
  durationMin: z.number().int().positive(),
  bufferAfterMin: z.number().int().nonnegative().optional(),
  priceCents: z.number().int().nonnegative(),
  active: z.boolean().optional(),
  onlineBookable: z.boolean().optional(),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z.object({
  categoryId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().max(2000).nullable().optional(),
  durationMin: z.number().int().positive().optional(),
  bufferAfterMin: z.number().int().nonnegative().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
  onlineBookable: z.boolean().optional(),
});
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const listServicesQuerySchema = z.object({
  active: z.enum(["true", "false"]).optional(),
  bookable: z.enum(["true", "false"]).optional(),
  categoryId: z.string().optional(),
});
