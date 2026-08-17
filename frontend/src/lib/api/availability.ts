import { apiRequest } from "./client";

export interface DaySlots {
  date: string;
  slots: { startsAt: string; endsAt: string; barberIds?: string[] }[];
}

export interface SlotsResponse {
  barberId: string;
  timezone: string;
  days: DaySlots[];
}

export function getAvailableSlots(params: { barberId: string; serviceIds: string[]; from: string; to: string }) {
  return apiRequest<SlotsResponse>("/availability/slots", {
    query: { barberId: params.barberId, serviceIds: params.serviceIds.join(","), from: params.from, to: params.to },
  });
}
