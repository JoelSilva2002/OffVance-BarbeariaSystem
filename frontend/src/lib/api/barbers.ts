import { apiRequest } from "./client";

export interface Barber {
  id: string;
  displayName: string;
  photoUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
}

export function listBarbers(status?: "active" | "inactive") {
  return apiRequest<{ barbers: Barber[] }>("/barbers", { query: { status } });
}
