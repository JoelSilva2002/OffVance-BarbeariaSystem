import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { union, type Interval } from "../../lib/interval.js";
import { getShopSettings } from "../scheduling/shop-settings.service.js";
import { OCCUPYING_STATUSES } from "../scheduling/availability.service.js";
import type {
  CreateBarberInput,
  PutBarberServicesInput,
  PutScheduleInput,
  TimeOffInput,
  UpdateBarberInput,
} from "./barbers.schema.js";

export async function listBarbers(status?: "active" | "inactive", serviceId?: string) {
  return prisma.barber.findMany({
    where: {
      status: status ? (status.toUpperCase() as "ACTIVE" | "INACTIVE") : undefined,
      services: serviceId ? { some: { serviceId } } : undefined,
    },
    orderBy: { displayName: "asc" },
  });
}

export async function getBarber(id: string) {
  const barber = await prisma.barber.findUnique({
    where: { id },
    include: { services: { include: { service: true } } },
  });
  if (!barber) throw new Problem(404, "BARBER_NOT_FOUND", "Barbeiro não encontrado.");
  return barber;
}

/**
 * Cria o colaborador. Como ainda não há endpoint de identidade (fase 4),
 * este endpoint também cria o User por trás — a menos que o telefone já
 * pertença a alguém (ex.: já é cliente), caso em que o perfil de barbeiro
 * é anexado ao mesmo User.
 */
export async function createBarber(input: CreateBarberInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { phone: input.phone }, include: { barber: true } });

      if (user?.barber) {
        throw new Problem(409, "ALREADY_A_BARBER", "Já existe um barbeiro cadastrado com esse telefone.");
      }

      if (!user) {
        user = await tx.user.create({
          data: { phone: input.phone, email: input.email, role: "BARBER", status: "ACTIVE" },
          include: { barber: true },
        });
      }

      return tx.barber.create({
        data: {
          userId: user.id,
          displayName: input.displayName,
          photoUrl: input.photoUrl,
          bio: input.bio,
          commissionPct: input.commissionPct,
          hiredAt: input.hiredAt ? new Date(input.hiredAt) : undefined,
          status: "ACTIVE",
        },
      });
    });
  } catch (error) {
    throw mapUniqueViolation(error);
  }
}

export async function updateBarber(id: string, input: UpdateBarberInput) {
  await getBarber(id);
  try {
    return await prisma.barber.update({
      where: { id },
      data: {
        displayName: input.displayName,
        photoUrl: input.photoUrl,
        bio: input.bio,
        commissionPct: input.commissionPct,
        hiredAt: input.hiredAt === undefined ? undefined : input.hiredAt ? new Date(input.hiredAt) : null,
        status: input.status,
      },
    });
  } catch (error) {
    throw mapUniqueViolation(error);
  }
}

/** Soft delete: barbeiro com agendamento futuro ativo não pode ser removido sem realocação. */
export async function deleteBarber(id: string) {
  await getBarber(id);

  const futureCount = await prisma.appointment.count({
    where: { barberId: id, status: { in: OCCUPYING_STATUSES }, startsAt: { gte: new Date() } },
  });

  if (futureCount > 0) {
    throw new Problem(
      409,
      "BARBER_HAS_FUTURE_APPOINTMENTS",
      `Este barbeiro tem ${futureCount} agendamento(s) futuro(s). Realoque-os antes de removê-lo.`,
    );
  }

  return prisma.barber.update({ where: { id }, data: { status: "INACTIVE" } });
}

export async function putBarberServices(barberId: string, input: PutBarberServicesInput) {
  await getBarber(barberId);

  const serviceIds = input.map((i) => i.serviceId);
  if (serviceIds.length > 0) {
    const found = await prisma.service.count({ where: { id: { in: serviceIds } } });
    if (found !== new Set(serviceIds).size) {
      throw new Problem(422, "SERVICE_NOT_FOUND", "Um ou mais serviços informados não existem.");
    }
  }

  await prisma.$transaction([
    prisma.barberService.deleteMany({ where: { barberId, serviceId: { notIn: serviceIds } } }),
    ...input.map((item) =>
      prisma.barberService.upsert({
        where: { barberId_serviceId: { barberId, serviceId: item.serviceId } },
        update: { durationOverrideMin: item.durationOverrideMin, priceOverrideCents: item.priceOverrideCents },
        create: {
          barberId,
          serviceId: item.serviceId,
          durationOverrideMin: item.durationOverrideMin,
          priceOverrideCents: item.priceOverrideCents,
        },
      }),
    ),
  ]);

  return prisma.barberService.findMany({ where: { barberId }, include: { service: true } });
}

export async function getSchedule(barberId: string) {
  await getBarber(barberId);
  return prisma.workSchedule.findMany({ where: { barberId }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] });
}

function timeStringToDate(t: string): Date {
  return new Date(`1970-01-01T${t}:00Z`);
}

function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
}

function assertNoOverlap(blocks: PutScheduleInput) {
  const byWeekday = new Map<number, PutScheduleInput>();
  for (const b of blocks) {
    const list = byWeekday.get(b.weekday) ?? [];
    list.push(b);
    byWeekday.set(b.weekday, list);
  }

  for (const [weekday, list] of byWeekday) {
    const sorted = [...list].sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      if (timeStringToMinutes(sorted[i]!.startTime) < timeStringToMinutes(sorted[i - 1]!.endTime)) {
        throw new Problem(
          422,
          "SCHEDULE_OVERLAP",
          `Blocos sobrepostos no dia da semana ${weekday}: ${sorted[i - 1]!.startTime}-${sorted[i - 1]!.endTime} e ${sorted[i]!.startTime}-${sorted[i]!.endTime}.`,
        );
      }
    }
  }
}

/**
 * Substitui a grade inteira do barbeiro. Antes de aplicar, verifica se
 * algum agendamento futuro ficaria fora do novo expediente — se sim,
 * recusa e devolve a lista de conflitos (docs/ARQUITETURA.md, seção 03,
 * "casos de borda").
 */
export async function putSchedule(barberId: string, blocks: PutScheduleInput) {
  await getBarber(barberId);
  assertNoOverlap(blocks);

  const settings = await getShopSettings();
  const blocksByWeekday = new Map<number, Interval[]>();
  for (const b of blocks) {
    const list = blocksByWeekday.get(b.weekday) ?? [];
    list.push({ start: timeStringToMinutes(b.startTime), end: timeStringToMinutes(b.endTime) });
    blocksByWeekday.set(b.weekday, list);
  }
  for (const [weekday, list] of blocksByWeekday) blocksByWeekday.set(weekday, union(list));

  const futureAppointments = await prisma.appointment.findMany({
    where: { barberId, status: { in: OCCUPYING_STATUSES }, startsAt: { gte: new Date() } },
    select: { id: true, code: true, startsAt: true, endsAt: true },
  });

  const conflicts = futureAppointments.filter((apt) => {
    const startLocal = DateTime.fromJSDate(apt.startsAt).setZone(settings.timezone);
    const endLocal = DateTime.fromJSDate(apt.endsAt).setZone(settings.timezone);
    const weekday = startLocal.weekday % 7;
    const startMin = startLocal.hour * 60 + startLocal.minute;
    const endMin = endLocal.hour * 60 + endLocal.minute;

    const working = blocksByWeekday.get(weekday) ?? [];
    return !working.some((w) => startMin >= w.start && endMin <= w.end);
  });

  if (conflicts.length > 0) {
    throw new Problem(
      409,
      "SCHEDULE_CONFLICTS_WITH_APPOINTMENTS",
      `A nova grade deixaria ${conflicts.length} agendamento(s) fora do expediente: ${conflicts.map((c) => c.code).join(", ")}.`,
    );
  }

  await prisma.$transaction([
    prisma.workSchedule.deleteMany({ where: { barberId } }),
    prisma.workSchedule.createMany({
      data: blocks.map((b) => ({
        barberId,
        weekday: b.weekday,
        startTime: timeStringToDate(b.startTime),
        endTime: timeStringToDate(b.endTime),
      })),
    }),
  ]);

  return getSchedule(barberId);
}

export async function createTimeOff(barberId: string, input: TimeOffInput) {
  await getBarber(barberId);

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (endsAt <= startsAt) {
    throw new Problem(422, "INVALID_RANGE", "`endsAt` precisa ser depois de `startsAt`.");
  }

  const exception = await prisma.scheduleException.create({
    data: { barberId, startsAt, endsAt, type: "TIME_OFF", reason: input.reason, allDay: input.allDay ?? false },
  });

  const conflicting = await prisma.appointment.findMany({
    where: {
      barberId,
      status: { in: OCCUPYING_STATUSES },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { id: true, code: true, startsAt: true, endsAt: true, clientId: true },
  });

  return { exception, conflictingAppointments: conflicting };
}

export async function getAgenda(barberId: string, date: string) {
  await getBarber(barberId);
  const settings = await getShopSettings();
  const dayStart = DateTime.fromISO(date, { zone: settings.timezone }).startOf("day");
  const dayEnd = dayStart.plus({ days: 1 });

  const [appointments, exceptions, schedules] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        barberId,
        startsAt: { lt: dayEnd.toJSDate() },
        endsAt: { gt: dayStart.toJSDate() },
        status: { notIn: ["CANCELADO"] },
      },
      include: { items: true, client: true },
      orderBy: { startsAt: "asc" },
    }),
    prisma.scheduleException.findMany({
      where: {
        OR: [{ barberId }, { barberId: null }],
        startsAt: { lt: dayEnd.toJSDate() },
        endsAt: { gt: dayStart.toJSDate() },
      },
    }),
    prisma.workSchedule.findMany({ where: { barberId, weekday: dayStart.weekday % 7 } }),
  ]);

  return { date, timezone: settings.timezone, workSchedules: schedules, exceptions, appointments };
}

function mapUniqueViolation(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = (error.meta?.target as string[] | undefined)?.join(",") ?? "";
    if (target.includes("email")) return new Problem(409, "EMAIL_TAKEN", "Esse e-mail já está em uso.");
    if (target.includes("phone")) return new Problem(409, "PHONE_TAKEN", "Esse telefone já está em uso.");
  }
  return error;
}
