import { apiRequest } from "./client";

export interface PackageDefinition {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  creditsQty: number;
  validityDays: number;
  isRecurring: boolean;
  active: boolean;
}

export interface ClientPackage {
  id: string;
  clientId: string;
  packageId: string;
  purchasedAt: string;
  expiresAt: string;
  creditsTotal: number;
  status: "ACTIVE" | "CANCELLED";
  package: PackageDefinition;
  creditsRemaining: number;
  isExpired: boolean;
}

export function listMyPackages() {
  return apiRequest<{ packages: ClientPackage[] }>("/me/packages");
}
