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
}

export function listServiceCategories() {
  return apiRequest<{ categories: ServiceCategory[] }>("/service-categories");
}

export function listServices(params: { active?: boolean; bookable?: boolean; categoryId?: string } = {}) {
  return apiRequest<{ services: Service[] }>("/services", {
    query: {
      active: params.active !== undefined ? String(params.active) : undefined,
      bookable: params.bookable !== undefined ? String(params.bookable) : undefined,
      categoryId: params.categoryId,
    },
  });
}
