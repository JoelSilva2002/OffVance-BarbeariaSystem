import { apiRequest } from "./client";
import type { ClientProfile } from "./auth";

export interface MeResponse extends ClientProfile {
  user: {
    id: string;
    phone: string;
    email: string | null;
  };
}

export function getMe() {
  return apiRequest<MeResponse>("/me");
}

export interface UpdateMeInput {
  fullName?: string;
  email?: string | null;
  birthDate?: string | null;
  preferredBarberId?: string | null;
  allergyNotes?: string | null;
  hairNotes?: string | null;
}

export function updateMe(input: UpdateMeInput) {
  return apiRequest<MeResponse>("/me", { method: "PATCH", body: input });
}
