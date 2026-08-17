import { apiRequest } from "./client";

export interface LoyaltyEntry {
  id: string;
  deltaPoints: number;
  reason: "EARN" | "REDEEM" | "ADJUST" | "EXPIRE";
  createdAt: string;
}

export function getClientLoyalty(clientId: string) {
  return apiRequest<{ balance: number; entries: LoyaltyEntry[] }>(`/clients/${clientId}/loyalty`);
}
