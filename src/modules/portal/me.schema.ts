import { z } from "zod";

export const updateMeSchema = z.object({
  fullName: z.string().min(1).optional(),
  // cadastrar e-mail liga notificações por e-mail automaticamente, além do
  // WhatsApp — ver scheduleReminder/scheduleReceipt em notifications/scheduler.ts
  email: z.string().email().nullable().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  preferredBarberId: z.string().nullable().optional(),
  allergyNotes: z.string().max(1000).nullable().optional(),
  hairNotes: z.string().max(1000).nullable().optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const listMyAppointmentsQuerySchema = z.object({
  scope: z.enum(["upcoming", "past"]).default("upcoming"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createMyAppointmentSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    barberId: z.string().optional(),
    serviceIds: z.array(z.string().min(1)).min(1).optional(),
    clientNotes: z.string().max(1000).optional(),
    repeatOf: z.string().optional(),
  })
  .refine((v) => v.repeatOf ?? (v.barberId && v.serviceIds && v.serviceIds.length > 0), {
    message: "Informe barberId + serviceIds, ou repeatOf.",
  });
export type CreateMyAppointmentInput = z.infer<typeof createMyAppointmentSchema>;

export const cancelMyAppointmentSchema = z.object({ reason: z.string().max(500).optional() });

export const rescheduleMyAppointmentSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  barberId: z.string().optional(),
});
