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

export const completeSchema = z.object({
  actorType,
  actorId: z.string().optional(),
  internalNotes: z.string().max(2000).optional(),
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
