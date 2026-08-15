import type { FastifyInstance } from "fastify";
import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { requireAdminAuth, requireStaffAuth } from "../../plugins/auth.js";
import { getShopSettings, updateShopSettings } from "./shop-settings.service.js";
import {
  computeFreeIntervals,
  generateSlotsForDay,
  listQualifiedBarbers,
  resolveServiceSelection,
} from "./availability.service.js";
import { barbersQuerySchema, daysQuerySchema, slotsQuerySchema } from "./scheduling.schema.js";
import { updateShopSettingsSchema } from "./shop-settings.schema.js";

const MAX_RANGE_DAYS = 31;

function datesBetween(fromISO: string, toISO: string): string[] {
  const from = DateTime.fromISO(fromISO);
  const to = DateTime.fromISO(toISO);
  if (to < from) throw new Problem(422, "INVALID_RANGE", "`to` não pode ser antes de `from`.");
  const days = Math.floor(to.diff(from, "days").days) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new Problem(422, "RANGE_TOO_LARGE", `Intervalo máximo é de ${MAX_RANGE_DAYS} dias.`);
  }
  return Array.from({ length: days }, (_, i) => from.plus({ days: i }).toISODate()!);
}

function datesInMonth(monthISO: string): string[] {
  const start = DateTime.fromISO(`${monthISO}-01`);
  const days = start.daysInMonth!;
  return Array.from({ length: days }, (_, i) => start.plus({ days: i }).toISODate()!);
}

export async function schedulingRoutes(app: FastifyInstance) {
  // Todo número mágico do agendamento/fidelidade mora aqui — consulta é
  // operacional (qualquer staff), mudar é decisão de dono (ADMIN).
  app.get("/shop-settings", { preHandler: requireStaffAuth }, async () => getShopSettings());

  app.patch("/shop-settings", { preHandler: requireAdminAuth }, async (request) => {
    const body = updateShopSettingsSchema.parse(request.body);
    return updateShopSettings(body);
  });

  app.get("/availability/slots", async (request) => {
    const query = slotsQuerySchema.parse(request.query);
    const dates = datesBetween(query.from, query.to);
    const settings = await getShopSettings();
    const minStartMs = Date.now() + settings.minLeadTimeMin * 60_000;

    if (query.barberId === "any") {
      const barbers = await listQualifiedBarbers(prisma, query.serviceIds);
      if (barbers.length === 0) {
        throw new Problem(422, "NO_BARBER_QUALIFIED", "Nenhum barbeiro atende essa combinação de serviços.");
      }

      // duração pode variar por barbeiro (overrides) — agregamos por horário de início
      const days = await Promise.all(
        dates.map(async (date) => {
          const perBarber = await Promise.all(
            barbers.map(async (barber) => {
              const selection = await resolveServiceSelection(prisma, barber.id, query.serviceIds);
              const free = await computeFreeIntervals(prisma, barber.id, date, settings.timezone);
              const slots = generateSlotsForDay(
                free,
                selection.totalDurationMin,
                date,
                settings.timezone,
                settings.slotStepMin,
                minStartMs,
              );
              return { barberId: barber.id, slots };
            }),
          );

          const byStart = new Map<string, { startsAt: string; endsAt: string; barberIds: string[] }>();
          for (const { barberId, slots } of perBarber) {
            for (const slot of slots) {
              const key = slot.startsAt.toISOString();
              const entry = byStart.get(key) ?? {
                startsAt: slot.startsAt.toISOString(),
                endsAt: slot.endsAt.toISOString(),
                barberIds: [],
              };
              entry.barberIds.push(barberId);
              byStart.set(key, entry);
            }
          }

          return {
            date,
            slots: [...byStart.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
          };
        }),
      );

      return { barberId: "any", timezone: settings.timezone, days };
    }

    const selection = await resolveServiceSelection(prisma, query.barberId, query.serviceIds);
    const days = await Promise.all(
      dates.map(async (date) => {
        const free = await computeFreeIntervals(prisma, query.barberId, date, settings.timezone);
        const slots = generateSlotsForDay(
          free,
          selection.totalDurationMin,
          date,
          settings.timezone,
          settings.slotStepMin,
          minStartMs,
        );
        return {
          date,
          slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() })),
        };
      }),
    );

    return {
      barberId: query.barberId,
      totalDurationMin: selection.totalDurationMin,
      timezone: settings.timezone,
      days,
    };
  });

  app.get("/availability/days", async (request) => {
    const query = daysQuerySchema.parse(request.query);
    const settings = await getShopSettings();
    const selection = await resolveServiceSelection(prisma, query.barberId, query.serviceIds);
    const minStartMs = Date.now() + settings.minLeadTimeMin * 60_000;
    const dates = datesInMonth(query.month);

    const results = await Promise.all(
      dates.map(async (date) => {
        const free = await computeFreeIntervals(prisma, query.barberId, date, settings.timezone);
        const slots = generateSlotsForDay(
          free,
          selection.totalDurationMin,
          date,
          settings.timezone,
          settings.slotStepMin,
          minStartMs,
        );
        return { date, hasSlots: slots.length > 0 };
      }),
    );

    return { barberId: query.barberId, month: query.month, days: results.filter((d) => d.hasSlots).map((d) => d.date) };
  });

  app.get("/availability/barbers", async (request) => {
    const query = barbersQuerySchema.parse(request.query);
    const settings = await getShopSettings();
    const minStartMs = Date.now() + settings.minLeadTimeMin * 60_000;
    const barbers = await listQualifiedBarbers(prisma, query.serviceIds);

    const withAvailability = await Promise.all(
      barbers.map(async (barber) => {
        const selection = await resolveServiceSelection(prisma, barber.id, query.serviceIds);
        const free = await computeFreeIntervals(prisma, barber.id, query.date, settings.timezone);
        const slots = generateSlotsForDay(
          free,
          selection.totalDurationMin,
          query.date,
          settings.timezone,
          settings.slotStepMin,
          minStartMs,
        );
        return {
          id: barber.id,
          displayName: barber.displayName,
          photoUrl: barber.photoUrl,
          slotsAvailable: slots.length,
        };
      }),
    );

    return {
      date: query.date,
      barbers: withAvailability.filter((b) => b.slotsAvailable > 0),
    };
  });
}
