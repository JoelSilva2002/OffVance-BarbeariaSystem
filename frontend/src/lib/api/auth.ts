import { apiRequest } from "./client";
import type { StaffRole } from "../auth/authSession";

export interface StaffLoginResponse {
  accessToken: string;
  refreshToken: string;
  role: StaffRole;
  barberId?: string;
}

export function staffLogin(email: string, password: string) {
  return apiRequest<StaffLoginResponse>("/auth/staff/login", { method: "POST", body: { email, password } });
}

export function staffLogout(refreshToken: string) {
  return apiRequest<void>("/auth/staff/logout", { method: "POST", body: { refreshToken } });
}

export function forgotPassword(email: string) {
  return apiRequest<void>("/auth/staff/forgot-password", { method: "POST", body: { email } });
}

export function resetPassword(token: string, newPassword: string) {
  return apiRequest<void>("/auth/staff/reset-password", { method: "POST", body: { token, newPassword } });
}
