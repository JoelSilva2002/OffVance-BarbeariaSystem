import { apiRequest } from "./client";
import type { AppointmentStatus } from "./types";

export interface AppointmentsReportSeries {
  period: string;
  total: number;
  byStatus: Record<AppointmentStatus, number>;
  noShowRate: number;
  cancelRate: number;
}

export interface OccupancyByBarber {
  barberId: string;
  displayName: string;
  workingMinutes: number;
  bookedMinutes: number;
  occupancyPct: number;
}

export interface AppointmentsReport {
  from: string;
  to: string;
  granularity: string;
  series: AppointmentsReportSeries[];
  occupancyByBarber: OccupancyByBarber[];
}

export function getAppointmentsReport(params: { from: string; to: string; granularity?: "day" | "week" | "month"; barberId?: string }) {
  return apiRequest<AppointmentsReport>("/reports/appointments", { query: params });
}

export interface RevenueReportSeries {
  period: string;
  serviceRevenueCents: number;
  productRevenueCents: number;
  packageRevenueCents: number;
  totalRevenueCents: number;
}

export interface RevenueReport {
  from: string;
  to: string;
  granularity: string;
  series: RevenueReportSeries[];
  byBarber?: { barberId: string; displayName: string; serviceRevenueCents: number; commissionCents: number }[];
  byService?: { serviceId: string; name: string; revenueCents: number; count: number }[];
  byMethod?: { method: string; amountCents: number; count: number }[];
  productMargin: { revenueCents: number; costCents: number; marginCents: number; marginPct: number };
}

export function getRevenueReport(params: {
  from: string;
  to: string;
  granularity?: "week" | "month" | "year";
  groupBy?: "barber" | "service" | "method";
}) {
  return apiRequest<RevenueReport>("/reports/revenue", { query: params });
}
