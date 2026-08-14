import { z } from "zod";

const actorType = z.enum(["CLIENT", "BARBER", "ADMIN", "SYSTEM", "API"]).default("API");

export const confirmSchema = z.object({
  actorType,
  actorId: z.string().optional(),
});

export const checkInSchema = z.object({
  actorType,
  actorId: z.string().optional(),
});

const completionPaymentSchema = z
  .object({
    method: z.enum(["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX", "PACKAGE"]),
    clientPackageId: z.string().optional(),
    redeemPoints: z.number().int().nonnegative().optional(),
  })
  .refine((p) => p.method !== "PACKAGE" || !!p.clientPackageId, {
    message: "clientPackageId é obrigatório quando method = PACKAGE",
  });
export type CompletionPaymentInput = z.infer<typeof completionPaymentSchema>;

export const completeSchema = z.object({
  actorType,
  actorId: z.string().optional(),
  internalNotes: z.string().max(2000).optional(),
  payment: completionPaymentSchema,
});

export const cancelSchema = z.object({
  actorType,
  actorId: z.string().optional(),
  reason: z.string().max(500).optional(),
});

export const noShowSchema = z.object({
  actorType,
  actorId: z.string().optional(),
  reason: z.string().max(500).optional(),
});

export const rescheduleSchema = z.object({
  actorType,
  actorId: z.string().optional(),
  startsAt: z.string().datetime({ offset: true }),
  barberId: z.string().optional(),
});
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
