import { z } from "zod";

export const searchClientsQuerySchema = z.object({
  search: z.string().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchClientsQuery = z.infer<typeof searchClientsQuerySchema>;

export const createClientSchema = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().min(8).max(20),
  email: z.string().email().optional(),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;
