import { z } from "zod";

export const createOrderSchema = z.object({
  clientId: z.string().optional(),
  appointmentId: z.string().optional(),
  method: z.enum(["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX"]),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int().positive(),
      }),
    )
    .min(1),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const listOrdersQuerySchema = z.object({
  clientId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
