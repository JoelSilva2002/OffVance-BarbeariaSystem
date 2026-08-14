import { z } from "zod";

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM");

export const createBarberSchema = z.object({
  phone: z.string().min(8).max(20),
  email: z.string().email().optional(),
  // opcional: sem senha o barbeiro só existe no sistema, não consegue logar como equipe
  password: z.string().min(8).optional(),
  displayName: z.string().min(1),
  photoUrl: z.string().url().optional(),
  bio: z.string().max(2000).optional(),
  commissionPct: z.number().min(0).max(100).optional(),
  hiredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type CreateBarberInput = z.infer<typeof createBarberSchema>;

export const updateBarberSchema = z.object({
  displayName: z.string().min(1).optional(),
  photoUrl: z.string().url().nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  commissionPct: z.number().min(0).max(100).nullable().optional(),
  hiredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  password: z.string().min(8).optional(),
});
export type UpdateBarberInput = z.infer<typeof updateBarberSchema>;

export const listBarbersQuerySchema = z.object({
  status: z.enum(["active", "inactive"]).optional(),
  serviceId: z.string().optional(),
});

export const putBarberServicesSchema = z.array(
  z.object({
    serviceId: z.string().min(1),
    durationOverrideMin: z.number().int().positive().optional(),
    priceOverrideCents: z.number().int().nonnegative().optional(),
  }),
);
export type PutBarberServicesInput = z.infer<typeof putBarberServicesSchema>;

const scheduleBlockSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: timeOfDay,
    endTime: timeOfDay,
  })
  .refine((b) => b.startTime < b.endTime, { message: "startTime precisa ser antes de endTime" });

export const putScheduleSchema = z.array(scheduleBlockSchema);
export type PutScheduleInput = z.infer<typeof putScheduleSchema>;

export const timeOffSchema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  reason: z.string().max(500).optional(),
  allDay: z.boolean().optional(),
});
export type TimeOffInput = z.infer<typeof timeOffSchema>;

export const agendaQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
