import { apiRequest } from "./client";

export interface ServiceCategory {
  id: string;
  name: string;
  position: number;
}

export interface Service {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  durationMin: number;
  bufferAfterMin: number;
  priceCents: number;
  active: boolean;
  onlineBookable: boolean;
  category: ServiceCategory;
}

export interface ServiceBarber {
  id: string;
  displayName: string;
  photoUrl: string | null;
  durationOverrideMin: number | null;
  priceOverrideCents: number | null;
}

export function listServiceCategories() {
  return apiRequest<{ categories: ServiceCategory[] }>("/service-categories");
}

export function listServices() {
  // só o que o cliente pode escolher pra agendar sozinho — `active` e
  // `onlineBookable` deliberadamente fixos, não expostos como filtro na UI
  return apiRequest<{ services: Service[] }>("/services", { query: { active: "true", bookable: "true" } });
}

export function getServiceBarbers(serviceId: string) {
  return apiRequest<{ barbers: ServiceBarber[] }>(`/services/${serviceId}/barbers`);
}
