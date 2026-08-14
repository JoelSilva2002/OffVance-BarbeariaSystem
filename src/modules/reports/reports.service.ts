import { DateTime } from "luxon";
import type { AppointmentStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { getShopSettings } from "../scheduling/shop-settings.service.js";
import { getWorkingBlocks } from "../scheduling/availability.service.js";
import type { AppointmentsReportQuery, RevenueReportQuery } from "./reports.schema.js";

const MAX_RANGE_DAYS = 400;

function parseRange(from: string, to: string, tz: string) {
  const fromDate = DateTime.fromISO(from, { zone: tz }).startOf("day");
  const toDate = DateTime.fromISO(to, { zone: tz }).endOf("day");
  if (toDate < fromDate) throw new Problem(422, "INVALID_RANGE", "`to` não pode ser antes de `from`.");
  if (toDate.diff(fromDate, "days").days > MAX_RANGE_DAYS) {
    throw new Problem(422, "RANGE_TOO_LARGE", `Intervalo máximo é de ${MAX_RANGE_DAYS} dias.`);
  }
  return { fromDate, toDate };
}

function bucketLabel(date: Date, granularity: "day" | "week" | "month" | "year", tz: string): string {
  const dt = DateTime.fromJSDate(date, { zone: "utc" }).setZone(tz);
  switch (granularity) {
    case "day":
      return dt.toISODate()!;
    case "week":
      return dt.startOf("week").toISODate()!;
    case "month":
      return dt.toFormat("yyyy-MM");
    case "year":
      return dt.toFormat("yyyy");
  }
}

function round2(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// Tudo que não seja CANCELADO ainda "ocupa" o horário no calendário do
// barbeiro para fins de ocupação — inclusive NAO_COMPARECEU, que bloqueou o
// horário mesmo sem o cliente ter vindo.
const REPORTING_BOOKED_STATUSES: AppointmentStatus[] = [
  "AGENDADO",
  "CONFIRMADO",
  "EM_ATENDIMENTO",
  "CONCLUIDO",
  "NAO_COMPARECEU",
];

const EMPTY_STATUS_COUNTS: Record<AppointmentStatus, number> = {
  PENDENTE_PAGAMENTO: 0,
  AGENDADO: 0,
  CONFIRMADO: 0,
  EM_ATENDIMENTO: 0,
  CONCLUIDO: 0,
  CANCELADO: 0,
  NAO_COMPARECEU: 0,
};

/**
 * Dashboard de agendamentos (docs/ARQUITETURA.md §06): volume por período +
 * taxa de no-show/cancelamento + ocupação por barbeiro. GROUP BY direto —
 * sem tabela de rollup, que só se justifica se isso ficar lento de verdade.
 */
export async function getAppointmentsReport(params: AppointmentsReportQuery) {
  const settings = await getShopSettings();
  const { fromDate, toDate } = parseRange(params.from, params.to, settings.timezone);

  const appointments = await prisma.appointment.findMany({
    where: {
      kind: "SERVICE",
      barberId: params.barberId,
      startsAt: { gte: fromDate.toJSDate(), lte: toDate.toJSDate() },
    },
    select: { startsAt: true, endsAt: true, status: true, barberId: true },
  });

  const buckets = new Map<string, Record<AppointmentStatus, number>>();
  for (const apt of appointments) {
    const period = bucketLabel(apt.startsAt, params.granularity, settings.timezone);
    const bucket = buckets.get(period) ?? { ...EMPTY_STATUS_COUNTS };
    bucket[apt.status] += 1;
    buckets.set(period, bucket);
  }

  const series = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, byStatus]) => {
      const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
      const finalized = byStatus.CONCLUIDO + byStatus.CANCELADO + byStatus.NAO_COMPARECEU;
      return {
        period,
        total,
        byStatus,
        noShowRate: finalized > 0 ? round2(byStatus.NAO_COMPARECEU / finalized) : 0,
        cancelRate: finalized > 0 ? round2(byStatus.CANCELADO / finalized) : 0,
      };
    });

  const barbers = params.barberId
    ? await prisma.barber.findMany({ where: { id: params.barberId } })
    : await prisma.barber.findMany({ where: { status: "ACTIVE" } });

  const occupancyByBarber = [];
  for (const barber of barbers) {
    let workingMinutes = 0;
    for (let d = fromDate.startOf("day"); d <= toDate.startOf("day"); d = d.plus({ days: 1 })) {
      const blocks = await getWorkingBlocks(prisma, barber.id, d.toISODate()!, settings.timezone);
      workingMinutes += blocks.reduce((sum, b) => sum + (b.end - b.start) / 60_000, 0);
    }

    const bookedMinutes = appointments
      .filter((a) => a.barberId === barber.id && REPORTING_BOOKED_STATUSES.includes(a.status))
      .reduce((sum, a) => sum + (a.endsAt.getTime() - a.startsAt.getTime()) / 60_000, 0);

    occupancyByBarber.push({
      barberId: barber.id,
      displayName: barber.displayName,
      workingMinutes: Math.round(workingMinutes),
      bookedMinutes: Math.round(bookedMinutes),
      occupancyPct: workingMinutes > 0 ? round2(bookedMinutes / workingMinutes) : 0,
    });
  }

  return { from: params.from, to: params.to, granularity: params.granularity, series, occupancyByBarber };
}

/**
 * Dashboard financeiro (docs/ARQUITETURA.md §06): faturamento por período,
 * quebrado por barbeiro/serviço/método, mais margem da loja usando o custo
 * congelado no item de venda.
 */
export async function getRevenueReport(params: RevenueReportQuery) {
  const settings = await getShopSettings();
  const { fromDate, toDate } = parseRange(params.from, params.to, settings.timezone);

  const payments = await prisma.payment.findMany({
    where: { status: "PAID", paidAt: { gte: fromDate.toJSDate(), lte: toDate.toJSDate() } },
    include: {
      appointment: { include: { barber: true, items: true } },
    },
  });

  const buckets = new Map<
    string,
    { serviceRevenueCents: number; productRevenueCents: number; packageRevenueCents: number }
  >();
  for (const payment of payments) {
    const period = bucketLabel(payment.paidAt!, params.granularity, settings.timezone);
    const bucket = buckets.get(period) ?? { serviceRevenueCents: 0, productRevenueCents: 0, packageRevenueCents: 0 };
    if (payment.appointmentId) bucket.serviceRevenueCents += payment.amountCents;
    else if (payment.orderId) bucket.productRevenueCents += payment.amountCents;
    else if (payment.clientPackageId) bucket.packageRevenueCents += payment.amountCents;
    buckets.set(period, bucket);
  }

  const series = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, revenue]) => ({
      period,
      ...revenue,
      totalRevenueCents: revenue.serviceRevenueCents + revenue.productRevenueCents + revenue.packageRevenueCents,
    }));

  let byBarber: { barberId: string; displayName: string; serviceRevenueCents: number; commissionCents: number }[] | undefined;
  let byService: { serviceId: string; name: string; revenueCents: number; count: number }[] | undefined;
  let byMethod: { method: PaymentMethod; amountCents: number; count: number }[] | undefined;

  if (params.groupBy === "barber") {
    const map = new Map<string, { displayName: string; serviceRevenueCents: number; commissionCents: number }>();
    for (const payment of payments) {
      if (!payment.appointment) continue;
      const barber = payment.appointment.barber;
      const entry = map.get(barber.id) ?? { displayName: barber.displayName, serviceRevenueCents: 0, commissionCents: 0 };
      entry.serviceRevenueCents += payment.amountCents;
      entry.commissionCents += Math.round((payment.amountCents * Number(barber.commissionPct ?? 0)) / 100);
      map.set(barber.id, entry);
    }
    byBarber = [...map.entries()].map(([barberId, v]) => ({ barberId, ...v }));
  }

  if (params.groupBy === "service") {
    const map = new Map<string, { name: string; revenueCents: number; count: number }>();
    for (const payment of payments) {
      if (!payment.appointment) continue;
      const items = payment.appointment.items;
      const totalItemPrice = items.reduce((sum, i) => sum + i.priceCents, 0) || 1;
      for (const item of items) {
        const share = payment.amountCents * (item.priceCents / totalItemPrice);
        const entry = map.get(item.serviceId) ?? { name: item.nameSnapshot, revenueCents: 0, count: 0 };
        entry.revenueCents += share;
        entry.count += 1;
        map.set(item.serviceId, entry);
      }
    }
    byService = [...map.entries()].map(([serviceId, v]) => ({
      serviceId,
      name: v.name,
      revenueCents: Math.round(v.revenueCents),
      count: v.count,
    }));
  }

  if (params.groupBy === "method") {
    const map = new Map<PaymentMethod, { amountCents: number; count: number }>();
    for (const payment of payments) {
      const entry = map.get(payment.method) ?? { amountCents: 0, count: 0 };
      entry.amountCents += payment.amountCents;
      entry.count += 1;
      map.set(payment.method, entry);
    }
    byMethod = [...map.entries()].map(([method, v]) => ({ method, ...v }));
  }

  const orderItems = await prisma.orderItem.findMany({
    where: { order: { status: "PAID", createdAt: { gte: fromDate.toJSDate(), lte: toDate.toJSDate() } } },
  });
  const productRevenueCents = orderItems.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0);
  const productCostCents = orderItems.reduce((sum, i) => sum + i.unitCostCents * i.qty, 0);
  const marginCents = productRevenueCents - productCostCents;

  return {
    from: params.from,
    to: params.to,
    granularity: params.granularity,
    series,
    byBarber,
    byService,
    byMethod,
    productMargin: {
      revenueCents: productRevenueCents,
      costCents: productCostCents,
      marginCents,
      marginPct: productRevenueCents > 0 ? round2(marginCents / productRevenueCents) : 0,
    },
  };
}
