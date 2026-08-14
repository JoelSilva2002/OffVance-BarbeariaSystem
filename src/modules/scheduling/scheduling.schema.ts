import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD");
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/, "Use o formato YYYY-MM");
const commaList = z
  .string()
  .transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(z.string()).min(1, "Informe ao menos um serviço"));

export const slotsQuerySchema = z.object({
  barberId: z.string().min(1),
  serviceIds: commaList,
  from: isoDate,
  to: isoDate,
});

export const daysQuerySchema = z.object({
  barberId: z.string().min(1),
  serviceIds: commaList,
  month: isoMonth,
});

export const barbersQuerySchema = z.object({
  serviceIds: commaList,
  date: isoDate,
});
