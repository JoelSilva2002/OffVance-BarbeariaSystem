import { apiRequest } from "./client";

export interface Product {
  id: string;
  name: string;
  salePriceCents: number;
  stockQty: number;
  active: boolean;
}

export function listProducts(active?: boolean) {
  return apiRequest<{ products: Product[] }>("/products", {
    query: { active: active !== undefined ? String(active) : undefined },
  });
}
