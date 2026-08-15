import { z } from "zod";
import { API_KEY_SCOPES } from "./scopes.js";

export const createApiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const updateApiKeySchema = z.object({
  name: z.string().min(1).optional(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).optional(),
  active: z.boolean().optional(),
});
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
