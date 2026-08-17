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
  client: {
    id: string;
    fullName: string | null;
    user: { phone: string };
  } | null;
  barber: {
    id: string;
    displayName: string;
  };
}

export interface AppointmentHistoryEntry {
  id: string;
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus;
  actorType: string;
  actorId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface ListAppointmentsParams {
  barberId?: string;
  clientId?: string;
  status?: AppointmentStatus;
  from?: string;
  to?: string;
  limit?: number;
}

export function listAppointments(params: ListAppointmentsParams) {
  return apiRequest<{ appointments: Appointment[] }>("/appointments", {
    query: { ...params },
  });
}

export function getAppointment(id: string) {
  return apiRequest<Appointment>(`/appointments/${id}`);
}

export function getAppointmentHistory(id: string) {
  return apiRequest<{ history: AppointmentHistoryEntry[] }>(`/appointments/${id}/history`);
}

export interface CreateAppointmentInput {
  barberId: string;
  clientId: string;
  serviceIds: string[];
  startsAt: string;
  clientNotes?: string;
}

export function createAppointment(input: CreateAppointmentInput) {
  return apiRequest<Appointment>("/appointments", { method: "POST", body: input });
}

export function confirmAppointment(id: string) {
  return apiRequest<Appointment>(`/appointments/${id}/confirm`, { method: "POST", body: {} });
}

export function checkInAppointment(id: string) {
  return apiRequest<Appointment>(`/appointments/${id}/check-in`, { method: "POST", body: {} });
}

export interface CompletionPayment {
  method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX" | "PACKAGE";
  clientPackageId?: string;
  redeemPoints?: number;
}

export function completeAppointment(id: string, payment: CompletionPayment, internalNotes?: string) {
  return apiRequest<Appointment & { pointsEarned: number }>(`/appointments/${id}/complete`, {
    method: "POST",
    body: { payment, internalNotes },
  });
}

export function cancelAppointment(id: string, reason?: string) {
  return apiRequest<Appointment>(`/appointments/${id}/cancel`, { method: "POST", body: { reason } });
}

export function markNoShow(id: string, reason?: string) {
  return apiRequest<Appointment>(`/appointments/${id}/no-show`, { method: "POST", body: { reason } });
}

export function rescheduleAppointment(id: string, startsAt: string, barberId?: string) {
  return apiRequest<Appointment>(`/appointments/${id}/reschedule`, { method: "POST", body: { startsAt, barberId } });
}
