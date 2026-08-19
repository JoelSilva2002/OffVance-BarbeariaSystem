import { apiRequest } from "./client";

export interface LoyaltyEntry {
  id: string;
  clientId: string;
  deltaPoints: number;
  reason: "EARN" | "REDEEM" | "EXPIRE" | "ADJUST" | string;
  refType: string | null;
  refId: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface LoyaltySummary {
  balance: number;
  entries: LoyaltyEntry[];
}

export function getLoyaltySummary() {
  return apiRequest<LoyaltySummary>("/me/loyalty");
}
