import { apiRequest } from "./client";

export interface Slot {
  startsAt: string;
  endsAt: string;
  /** só quando `barberId=any` foi consultado — quais barbeiros estão livres nesse horário. */
  barberIds?: string[];
}

export interface DaySlots {
  date: string;
  slots: Slot[];
}

export interface SlotsResponse {
  barberId: string;
  timezone: string;
  days: DaySlots[];
}

export interface GetSlotsParams {
  /** id concreto, ou o literal "any" pra buscar em todos os barbeiros qualificados. */
  barberId: string;
  serviceIds: string[];
  from: string;
  to: string;
}

export function getAvailabilitySlots(params: GetSlotsParams) {
  return apiRequest<SlotsResponse>("/availability/slots", {
    query: { barberId: params.barberId, serviceIds: params.serviceIds.join(","), from: params.from, to: params.to },
  });
}

export interface GetDaysParams {
  /** NÃO aceita "any" — precisa de um barbeiro concreto (rota não tem esse branch). */
  barberId: string;
  serviceIds: string[];
  month: string;
}

export function getAvailabilityDays(params: GetDaysParams) {
  return apiRequest<{ barberId: string; month: string; days: string[] }>("/availability/days", {
    query: { barberId: params.barberId, serviceIds: params.serviceIds.join(","), month: params.month },
  });
}
