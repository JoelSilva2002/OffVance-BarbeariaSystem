import { z } from "zod";

export const requestOtpSchema = z.object({ phone: z.string().min(8).max(20) });
export const verifyOtpSchema = z.object({ phone: z.string().min(8).max(20), code: z.string().length(6) });

export const refreshTokenSchema = z.object({ refreshToken: z.string().min(1) });
