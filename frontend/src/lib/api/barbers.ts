import { apiRequest } from "./client";
import type { Service } from "./catalog";

export interface Barber {
  id: string;
  displayName: string;
  photoUrl: string | null;
  bio: string | null;
  commissionPct: string | null;
  hiredAt: string | null;
  status: "ACTIVE" | "INACTIVE";
}

export interface BarberWithServices extends Barber {
  services: { barberId: string; serviceId: string; durationOverrideMin: number | null; priceOverrideCents: number | null; service: Service }[];
}

export function listBarbers(status?: "active" | "inactive") {
  return apiRequest<{ barbers: Barber[] }>("/barbers", { query: { status } });
}

export function getBarber(id: string) {
  return apiRequest<BarberWithServices>(`/barbers/${id}`);
}

export interface CreateBarberInput {
  phone: string;
  email?: string;
  password?: string;
  displayName: string;
  photoUrl?: string;
  bio?: string;
  commissionPct?: number;
  hiredAt?: string;
}

export function createBarber(input: CreateBarberInput) {
  return apiRequest<Barber>("/barbers", { method: "POST", body: input });
}

export interface UpdateBarberInput {
  displayName?: string;
  photoUrl?: string | null;
  bio?: string | null;
  commissionPct?: number | null;
  hiredAt?: string | null;
  status?: "ACTIVE" | "INACTIVE";
  password?: string;
}

export function updateBarber(id: string, input: UpdateBarberInput) {
  return apiRequest<Barber>(`/barbers/${id}`, { method: "PATCH", body: input });
}

export function deactivateBarber(id: string) {
  return apiRequest<Barber>(`/barbers/${id}`, { method: "DELETE" });
}

export interface BarberServiceLink {
  serviceId: string;
  durationOverrideMin?: number;
  priceOverrideCents?: number;
}

export function putBarberServices(barberId: string, links: BarberServiceLink[]) {
  return apiRequest<BarberWithServices["services"]>(`/barbers/${barberId}/services`, { method: "PUT", body: links });
}

/** GET devolve startTime/endTime como datetime ISO (1970-01-01T09:00:00.000Z) — é como o Postgres TIME chega pelo Prisma. */
export interface ScheduleBlock {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

export function getSchedule(barberId: string) {
  return apiRequest<{ schedule: ScheduleBlock[] }>(`/barbers/${barberId}/schedule`);
}

export function putSchedule(barberId: string, blocks: { weekday: number; startTime: string; endTime: string }[]) {
  return apiRequest<{ schedule: unknown[] }>(`/barbers/${barberId}/schedule`, { method: "PUT", body: blocks });
}

export interface TimeOffInput {
  startsAt: string;
  endsAt: string;
  reason?: string;
  allDay?: boolean;
}

export function createTimeOff(barberId: string, input: TimeOffInput) {
  return apiRequest(`/barbers/${barberId}/time-off`, { method: "POST", body: input });
}
