import { z } from "zod";

export const listNotificationsQuerySchema = z.object({
  status: z.enum(["PENDING", "SENT", "CANCELLED", "FAILED"]).optional(),
  clientId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const reportDeliverySchema = z.object({
  providerMessageId: z.string().optional(),
  status: z.enum(["FAILED"]).optional(),
});
