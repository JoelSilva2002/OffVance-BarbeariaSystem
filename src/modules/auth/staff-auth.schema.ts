import { z } from "zod";

export const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
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

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
