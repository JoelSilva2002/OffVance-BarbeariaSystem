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

export interface CreateCategoryInput {
  name: string;
  position?: number;
}

export function createServiceCategory(input: CreateCategoryInput) {
  return apiRequest<ServiceCategory>("/service-categories", { method: "POST", body: input });
}

export function updateServiceCategory(id: string, input: Partial<CreateCategoryInput>) {
  return apiRequest<ServiceCategory>(`/service-categories/${id}`, { method: "PATCH", body: input });
}

export interface CreateServiceInput {
  categoryId: string;
  name: string;
  description?: string;
  durationMin: number;
  bufferAfterMin?: number;
  priceCents: number;
  active?: boolean;
  onlineBookable?: boolean;
}

export function createService(input: CreateServiceInput) {
  return apiRequest<Service>("/services", { method: "POST", body: input });
}

export function updateService(id: string, input: Partial<CreateServiceInput>) {
  return apiRequest<Service>(`/services/${id}`, { method: "PATCH", body: input });
}
