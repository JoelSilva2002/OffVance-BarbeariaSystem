import { z } from "zod";

export const updateShopSettingsSchema = z.object({
  timezone: z.string().min(1).optional(),
  slotStepMin: z.number().int().positive().optional(),
  minLeadTimeMin: z.number().int().nonnegative().optional(),
  maxAdvanceDays: z.number().int().positive().optional(),
  cancelDeadlineHours: z.number().int().nonnegative().optional(),
  rescheduleDeadlineHours: z.number().int().nonnegative().optional(),
  autoConfirmHoursBefore: z.number().int().nonnegative().optional(),
  loyaltyPointsPerCurrency: z.number().nonnegative().optional(),
  loyaltyPointValueCents: z.number().int().nonnegative().optional(),
  // null = desliga expiração (pontos passam a valer pra sempre outra vez);
  // omitido = não mexe no que já está configurado.
  loyaltyPointsExpirationDays: z.number().int().positive().nullable().optional(),
});
export type UpdateShopSettingsInput = z.infer<typeof updateShopSettingsSchema>;
