import { apiRequest } from "./client";

export interface RequestOtpResponse {
  message: string;
  expiresAt: string;
  /** Só em dev — a API nunca manda isso em produção. */
  devCode?: string;
}

export interface ClientProfile {
  id: string;
  shopId: string;
  userId: string;
  fullName: string | null;
  birthDate: string | null;
  preferredBarberId: string | null;
  allergyNotes: string | null;
  hairNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VerifyOtpResponse {
  accessToken: string;
  refreshToken: string;
  client: ClientProfile;
}

export function requestOtp(phone: string) {
  return apiRequest<RequestOtpResponse>("/auth/otp/request", { method: "POST", body: { phone } });
}

export function verifyOtp(phone: string, code: string) {
  return apiRequest<VerifyOtpResponse>("/auth/otp/verify", { method: "POST", body: { phone, code } });
}

export function logoutClient(refreshToken: string) {
  return apiRequest<void>("/auth/otp/logout", { method: "POST", body: { refreshToken } });
}
