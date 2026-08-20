import { apiRequest } from "./client";
import type { AppointmentStatus } from "./types";

export interface AppointmentItem {
  id: string;
  serviceId: string;
  nameSnapshot: string;
  durationMin: number;
  priceCents: number;
  position: number;
}

export interface Review {
  id: string;
  appointmentId: string;
  clientId: string;
  barberId: string;
  rating: number;
  comment: string | null;
  publishedAt: string;
  createdAt: string;
}

/**
 * Diferente do `Appointment` do painel de equipe: `/me/appointments` não
 * inclui `client`/`barber` aninhados (só `barberId` cru) — quem precisa do
 * nome do barbeiro busca `GET /barbers/:id` à parte (ver lib/api/barbers.ts).
 * `review` é aditivo da Fase 0 do backend (src/modules/portal/me.service.ts).
 */
export interface Appointment {
  id: string;
  code: string;
  kind: "SERVICE" | "BLOCK";
  clientId: string | null;
  barberId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  totalPriceCents: number;
  clientNotes: string | null;
  internalNotes: string | null;
  cancelReason: string | null;
  items: AppointmentItem[];
  review: Review | null;
}

export interface ListMyAppointmentsParams {
  scope?: "upcoming" | "past";
  limit?: number;
}

export function listMyAppointments(params: ListMyAppointmentsParams = {}) {
  return apiRequest<{ appointments: Appointment[] }>("/me/appointments", { query: { ...params } });
}

export function getMyLastAppointment() {
  return apiRequest<{ appointment: Appointment | null }>("/me/appointments/last");
}

/**
 * `startsAt` precisa ter offset (ISO com `Z` ou `+HH:mm`) — `Date#toISOString()`
 * já cobre isso. Ou `barberId` + `serviceIds`, ou `repeatOf` (a API resolve
 * barbeiro/serviços a partir do agendamento de origem quando não vierem
 * explícitos — ver src/modules/portal/me.service.ts:74-100).
 */
export interface CreateMyAppointmentInput {
  startsAt: string;
  barberId?: string;
  serviceIds?: string[];
  clientNotes?: string;
  repeatOf?: string;
}

export function createMyAppointment(input: CreateMyAppointmentInput) {
  return apiRequest<Appointment>("/me/appointments", { method: "POST", body: input });
}

export function cancelMyAppointment(id: string, reason?: string) {
  return apiRequest<Appointment>(`/me/appointments/${id}/cancel`, { method: "POST", body: { reason } });
}

export interface RescheduleMyAppointmentInput {
  startsAt: string;
  barberId?: string;
}

export function rescheduleMyAppointment(id: string, input: RescheduleMyAppointmentInput) {
  return apiRequest<Appointment>(`/me/appointments/${id}/reschedule`, { method: "POST", body: input });
}
