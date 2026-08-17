import { apiRequest } from "./client";

export interface ClientPackage {
  id: string;
  clientId: string;
  packageId: string;
  purchasedAt: string;
  expiresAt: string;
  creditsTotal: number;
  status: "ACTIVE" | "EXHAUSTED" | "EXPIRED";
  creditsRemaining: number;
  isExpired: boolean;
  package: { id: string; name: string };
}

export function listClientPackages(clientId: string) {
  return apiRequest<{ packages: ClientPackage[] }>(`/clients/${clientId}/packages`);
}
