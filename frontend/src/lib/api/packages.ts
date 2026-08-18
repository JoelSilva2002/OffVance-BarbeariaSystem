import { apiRequest } from "./client";

export interface Package {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  creditsQty: number;
  scopeServiceIds: string[];
  validityDays: number;
  isRecurring: boolean;
  active: boolean;
}

export function listPackages(active?: boolean) {
  return apiRequest<{ packages: Package[] }>("/packages", {
    query: { active: active !== undefined ? String(active) : undefined },
  });
}

export interface CreatePackageInput {
  name: string;
  description?: string;
  priceCents: number;
  creditsQty: number;
  scopeServiceIds?: string[];
  validityDays: number;
  isRecurring?: boolean;
  active?: boolean;
}

export function createPackage(input: CreatePackageInput) {
  return apiRequest<Package>("/packages", { method: "POST", body: input });
}

export function updatePackage(id: string, input: Partial<CreatePackageInput>) {
  return apiRequest<Package>(`/packages/${id}`, { method: "PATCH", body: input });
}

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

export function purchasePackage(clientId: string, packageId: string, method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX") {
  return apiRequest<ClientPackage>(`/clients/${clientId}/packages`, { method: "POST", body: { packageId, method } });
}
