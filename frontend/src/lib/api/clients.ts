import { apiRequest } from "./client";

export interface ClientSummary {
  id: string;
  fullName: string | null;
  phone: string;
  email: string | null;
}

export function searchClients(search: string, limit = 20) {
  return apiRequest<{ clients: ClientSummary[] }>("/clients", { query: { search, limit } });
}

export interface CreateClientInput {
  fullName: string;
  phone: string;
  email?: string;
}

export function createClient(input: CreateClientInput) {
  return apiRequest<ClientSummary>("/clients", { method: "POST", body: input });
}
