import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD");

export const appointmentsReportQuerySchema = z.object({
  granularity: z.enum(["day", "week", "month"]).default("day"),
  from: isoDate,
  to: isoDate,
  barberId: z.string().optional(),
});
export type AppointmentsReportQuery = z.infer<typeof appointmentsReportQuerySchema>;

export const revenueReportQuerySchema = z.object({
  granularity: z.enum(["week", "month", "year"]).default("month"),
  from: isoDate,
  to: isoDate,
  groupBy: z.enum(["barber", "service", "method"]).optional(),
});
export type RevenueReportQuery = z.infer<typeof revenueReportQuerySchema>;
