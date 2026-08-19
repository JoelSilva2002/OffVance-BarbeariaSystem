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
