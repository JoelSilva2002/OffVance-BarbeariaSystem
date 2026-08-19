import { apiRequest } from "./client";

export interface Barber {
  id: string;
  displayName: string;
  photoUrl: string | null;
  bio: string | null;
  status: "ACTIVE" | "INACTIVE";
}

export function getBarber(id: string) {
  return apiRequest<Barber>(`/barbers/${id}`);
}
