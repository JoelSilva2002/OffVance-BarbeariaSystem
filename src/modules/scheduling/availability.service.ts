import { DateTime } from "luxon";
import type { Prisma, AppointmentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { subtract, union, type Interval } from "../../lib/interval.js";
import { getShopSettings } from "./shop-settings.service.js";

type Client = typeof prisma | Prisma.TransactionClient;

/**
 * Status que de fato ocupam a cadeira do barbeiro. Tem que ficar em sincronia
 * com o WHERE da constraint de exclusão (prisma/migrations/…_appointments_exclusion_constraint).
 */
export const OCCUPYING_STATUSES: AppointmentStatus[] = [
  "PENDENTE_PAGAMENTO",
  "AGENDADO",
  "CONFIRMADO",
  "EM_ATENDIMENTO",
];

export interface ResolvedItem {
  serviceId: string;
  nameSnapshot: string;
  durationMin: number;
  priceCents: number;
  bufferAfterMin: number;
}

export interface ResolvedSelection {
  items: ResolvedItem[];
  /** Duração total já somada ao buffer do último serviço — é o que ocupa a agenda. */
  totalDurationMin: number;
  /** Duração "de vitrine", sem o buffer — para exibição ao cliente. */
  serviceDurationMin: number;
  totalPriceCents: number;
}

/**
 * Resolve a lista de serviços escolhidos contra o que o barbeiro está
 * habilitado a fazer (decisão de modelagem: barber_services é a fonte da
 * verdade de especialidade). Nunca aceite duração/preço vindos do cliente.
 */
export async function resolveServiceSelection(
  db: Client,
  barberId: string,
  serviceIds: string[],
): Promise<ResolvedSelection> {
  if (serviceIds.length === 0) {
    throw new Problem(422, "NO_SERVICES_SELECTED", "Escolha ao menos um serviço.");
  }

  const rows = await db.barberService.findMany({
    where: { barberId, serviceId: { in: serviceIds } },
    include: { service: true },
  });

  const byServiceId = new Map(rows.map((r) => [r.serviceId, r]));
  const missing = serviceIds.filter((id) => !byServiceId.has(id));
  if (missing.length > 0) {
    throw new Problem(
      422,
      "BARBER_NOT_QUALIFIED",
      `O barbeiro não atende os serviços: ${missing.join(", ")}.`,
    );
  }

  const inactive = rows.filter((r) => !r.service.active);
  if (inactive.length > 0) {
    throw new Problem(
      422,
      "SERVICE_INACTIVE",
      `Serviço(s) indisponível(is): ${inactive.map((r) => r.service.name).join(", ")}.`,
    );
  }

  // preserva a ordem escolhida pelo cliente — importa para saber qual é "o último" (buffer)
  const items: ResolvedItem[] = serviceIds.map((id) => {
    const row = byServiceId.get(id)!;
    return {
      serviceId: id,
      nameSnapshot: row.service.name,
      durationMin: row.durationOverrideMin ?? row.service.durationMin,
      priceCents: row.priceOverrideCents ?? row.service.priceCents,
      bufferAfterMin: row.service.bufferAfterMin,
    };
  });

  const serviceDurationMin = items.reduce((sum, i) => sum + i.durationMin, 0);
  const bufferOfLast = items[items.length - 1]!.bufferAfterMin;
  const totalPriceCents = items.reduce((sum, i) => sum + i.priceCents, 0);

  return {
    items,
    serviceDurationMin,
    totalDurationMin: serviceDurationMin + bufferOfLast,
    totalPriceCents,
  };
}

function weekdayForLocalDate(localDate: string, tz: string): number {
  // Luxon: segunda=1 ... domingo=7. Convenção do schema: domingo=0 ... sábado=6.
  const dt = DateTime.fromISO(localDate, { zone: tz });
  return dt.weekday % 7;
}

function dayWindowUtc(localDate: string, tz: string): Interval {
  const start = DateTime.fromISO(localDate, { zone: tz }).startOf("day");
  const end = start.plus({ days: 1 });
  return { start: start.toMillis(), end: end.toMillis() };
}

function timeOfDayToLocalDateTime(localDate: string, tz: string, time: Date): DateTime {
  return DateTime.fromISO(localDate, { zone: tz }).set({
    hour: time.getUTCHours(),
    minute: time.getUTCMinutes(),
    second: time.getUTCSeconds(),
    millisecond: 0,
  });
}

/** Só os blocos de grade do dia (sem descontar ocupação) — o "poderia estar aberto". */
export async function getWorkingBlocks(db: Client, barberId: string, localDate: string, tz: string): Promise<Interval[]> {
  const weekday = weekdayForLocalDate(localDate, tz);
  const localDateJs = DateTime.fromISO(localDate).toJSDate();

  const schedules = await db.workSchedule.findMany({
    where: {
      barberId,
      weekday,
      validFrom: { lte: localDateJs },
      OR: [{ validUntil: null }, { validUntil: { gte: localDateJs } }],
    },
  });

  return union(
    schedules.map((s) => ({
      start: timeOfDayToLocalDateTime(localDate, tz, s.startTime).toMillis(),
      end: timeOfDayToLocalDateTime(localDate, tz, s.endTime).toMillis(),
    })),
  );
}

/** Exceções (folga/feriado/bloqueio) + agendamentos ativos que ocupam o dia. */
export async function getBusyIntervals(db: Client, barberId: string, localDate: string, tz: string): Promise<Interval[]> {
  const { start: dayStart, end: dayEnd } = dayWindowUtc(localDate, tz);

  const [exceptions, appointments] = await Promise.all([
    db.scheduleException.findMany({
      where: {
        OR: [{ barberId }, { barberId: null }],
        startsAt: { lt: new Date(dayEnd) },
        endsAt: { gt: new Date(dayStart) },
      },
    }),
    db.appointment.findMany({
      where: {
        barberId,
        status: { in: OCCUPYING_STATUSES },
        startsAt: { lt: new Date(dayEnd) },
        endsAt: { gt: new Date(dayStart) },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  return union([
    ...exceptions.map((e) => ({ start: e.startsAt.getTime(), end: e.endsAt.getTime() })),
    ...appointments.map((a) => ({ start: a.startsAt.getTime(), end: a.endsAt.getTime() })),
  ]);
}

/**
 * Camada 1 do desenho de concorrência (docs/ARQUITETURA.md, seção 03):
 *   livre = grade − exceções da loja − folgas − (agendamentos + bloqueios)
 * Devolve os intervalos livres do dia, em UTC (ms desde a época).
 */
export async function computeFreeIntervals(
  db: Client,
  barberId: string,
  localDate: string,
  tz: string,
): Promise<Interval[]> {
  const [working, busy] = await Promise.all([
    getWorkingBlocks(db, barberId, localDate, tz),
    getBusyIntervals(db, barberId, localDate, tz),
  ]);
  return subtract(working, busy);
}

function alignUp(ms: number, stepMs: number, originMs: number): number {
  const diff = ms - originMs;
  const remainder = ((diff % stepMs) + stepMs) % stepMs;
  return remainder === 0 ? ms : ms + (stepMs - remainder);
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
}

/** Varre os intervalos livres do dia gerando os slots ofertáveis (seção 03, camada 1). */
export function generateSlotsForDay(
  freeIntervals: Interval[],
  durationMin: number,
  localDate: string,
  tz: string,
  slotStepMin: number,
  minStartMs: number,
): Slot[] {
  const durationMs = durationMin * 60_000;
  const stepMs = slotStepMin * 60_000;
  const originMs = DateTime.fromISO(localDate, { zone: tz }).startOf("day").toMillis();

  const slots: Slot[] = [];
  for (const free of freeIntervals) {
    let t = alignUp(free.start, stepMs, originMs);
    while (t + durationMs <= free.end) {
      if (t >= minStartMs) {
        slots.push({ startsAt: new Date(t), endsAt: new Date(t + durationMs) });
      }
      t += stepMs;
    }
  }
  return slots;
}

/** Slots de um barbeiro para um conjunto de serviços, em um único dia local da loja. */
export async function getSlotsForDay(
  db: Client,
  barberId: string,
  serviceIds: string[],
  localDate: string,
) {
  const [settings, selection] = await Promise.all([
    getShopSettings(db),
    resolveServiceSelection(db, barberId, serviceIds),
  ]);

  const free = await computeFreeIntervals(db, barberId, localDate, settings.timezone);
  const minStartMs = Date.now() + settings.minLeadTimeMin * 60_000;

  const slots = generateSlotsForDay(
    free,
    selection.totalDurationMin,
    localDate,
    settings.timezone,
    settings.slotStepMin,
    minStartMs,
  );

  return { settings, selection, slots };
}

/** Barbeiros habilitados para TODOS os serviços pedidos e ativos. */
export async function listQualifiedBarbers(db: Client, serviceIds: string[]) {
  const barbers = await db.barber.findMany({
    where: {
      status: "ACTIVE",
      services: { some: { serviceId: { in: serviceIds } } },
    },
    include: { services: { where: { serviceId: { in: serviceIds } } } },
  });

  // "habilitado a todos" — filtra quem só cobre parte da lista
  return barbers.filter((b) => b.services.length === serviceIds.length);
}
