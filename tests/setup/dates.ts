import { DateTime } from "luxon";

/** Próximo dia útil (seg-sex) N dias à frente, na hora local dada — cai dentro da grade seg-sex dos fixtures de barbeiro. */
export function nextWeekdayAt(hour: number, daysAhead = 3): string {
  let dt = DateTime.now().setZone("America/Sao_Paulo").plus({ days: daysAhead }).set({
    hour,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  while (dt.weekday > 5) dt = dt.plus({ days: 1 });
  return dt.toISO()!;
}
