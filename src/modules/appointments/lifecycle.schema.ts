import { z } from "zod";

// actorType/actorId NÃO vêm mais do corpo da requisição — antes disso, um
// chamador podia declarar "actorType: ADMIN" livremente. Agora são
// derivados da identidade autenticada (resolveActingIdentity em
// plugins/auth.ts) na camada de rota, nunca confiados do payload.

export const confirmSchema = z.object({});

export const checkInSchema = z.object({});

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
  internalNotes: z.string().max(2000).optional(),
  payment: completionPaymentSchema,
});

export const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const noShowSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const rescheduleSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  barberId: z.string().optional(),
});
export type RescheduleBody = z.infer<typeof rescheduleSchema>;
