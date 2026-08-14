import { z } from "zod";

export const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().min(8).max(20),
});
export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export const updateAdminSchema = z.object({
  password: z.string().min(8).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
