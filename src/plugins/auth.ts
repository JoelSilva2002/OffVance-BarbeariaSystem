import type { FastifyRequest, FastifyReply } from "fastify";
import { Problem } from "../lib/problem.js";

export interface ClientTokenPayload {
  sub: string; // clientId
  userId: string;
  role: "CLIENT";
}

export interface StaffTokenPayload {
  sub: string; // userId
  role: "ADMIN" | "BARBER";
  barberId?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    authClient?: ClientTokenPayload;
    authStaff?: StaffTokenPayload;
  }
}

/**
 * Guards de autenticação. Não são registrados como plugin porque não
 * precisam decorar nada global além do que @fastify/jwt (que já escapa a
 * encapsulação sozinho) já fornece — só usam `request.jwtVerify`.
 *
 * Token inválido/ausente sempre vira 401; token válido mas do papel errado
 * (ex.: sessão de cliente batendo numa rota de equipe) vira 403 — são erros
 * de natureza diferente e o consumidor da API precisa distingui-los.
 */
export async function requireClientAuth(request: FastifyRequest, _reply: FastifyReply) {
  let payload: ClientTokenPayload;
  try {
    payload = await request.jwtVerify<ClientTokenPayload>();
  } catch {
    throw new Problem(401, "UNAUTHENTICATED", "Faça login para continuar.");
  }
  if (payload.role !== "CLIENT") {
    throw new Problem(403, "FORBIDDEN", "Esta ação é restrita a clientes.");
  }
  request.authClient = payload;
}

/** Qualquer membro da equipe (ADMIN ou BARBER) — operações do dia a dia. */
export async function requireStaffAuth(request: FastifyRequest, _reply: FastifyReply) {
  let payload: StaffTokenPayload;
  try {
    payload = await request.jwtVerify<StaffTokenPayload>();
  } catch {
    throw new Problem(401, "UNAUTHENTICATED", "Faça login para continuar.");
  }
  if (payload.role !== "ADMIN" && payload.role !== "BARBER") {
    throw new Problem(403, "FORBIDDEN", "Esta ação é restrita à equipe.");
  }
  request.authStaff = payload;
}

/** Só ADMIN — cadastro de colaboradores, catálogo/preços, financeiro, integrações. */
export async function requireAdminAuth(request: FastifyRequest, _reply: FastifyReply) {
  let payload: StaffTokenPayload;
  try {
    payload = await request.jwtVerify<StaffTokenPayload>();
  } catch {
    throw new Problem(401, "UNAUTHENTICATED", "Faça login para continuar.");
  }
  if (payload.role !== "ADMIN") {
    throw new Problem(403, "FORBIDDEN", "Ação restrita a administradores.");
  }
  request.authStaff = payload;
}
