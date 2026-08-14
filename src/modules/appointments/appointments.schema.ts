import { z } from "zod";

export const createAppointmentSchema = z.object({
  barberId: z.string().min(1),
  clientId: z.string().min(1),
  serviceIds: z.array(z.string().min(1)).min(1, "Escolha ao menos um serviço"),
  startsAt: z.string().datetime({ offset: true }),
  clientNotes: z.string().max(1000).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const listAppointmentsQuerySchema = z.object({
  barberId: z.string().optional(),
  clientId: z.string().optional(),
  status: z.string().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
