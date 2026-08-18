import { apiRequest } from "./client";
import type { Product } from "./products";

export interface OrderItem {
  id: string;
  productId: string;
  qty: number;
  unitPriceCents: number;
  unitCostCents: number;
  product: Product;
}

export interface Order {
  id: string;
  clientId: string | null;
  appointmentId: string | null;
  status: "PAID" | "REFUNDED" | "CANCELLED";
  totalCents: number;
  createdAt: string;
  items: OrderItem[];
}

export function listOrders(clientId?: string, limit = 50) {
  return apiRequest<{ orders: Order[] }>("/orders", { query: { clientId, limit } });
}

export interface CreateOrderInput {
  clientId?: string;
  method: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX";
  items: { productId: string; qty: number }[];
}

export function createOrder(input: CreateOrderInput) {
  return apiRequest<Order>("/orders", { method: "POST", body: input });
}
