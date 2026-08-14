import type { FastifyRequest, FastifyReply } from "fastify";
import { Problem } from "../lib/problem.js";

export interface ClientTokenPayload {
  sub: string; // clientId
  userId: string;
  role: "CLIENT";
}

declare module "fastify" {
  interface FastifyRequest {
    authClient?: ClientTokenPayload;
  }
}

/**
 * preHandler para as rotas do portal (/me/*). Não é registrado como plugin
 * porque não precisa decorar nada global além do que @fastify/jwt (que já
 * escapa a encapsulação sozinho) já fornece — só usa `request.jwtVerify`.
 */
export async function requireClientAuth(request: FastifyRequest, _reply: FastifyReply) {
  try {
    request.authClient = await request.jwtVerify<ClientTokenPayload>();
  } catch {
    throw new Problem(401, "UNAUTHENTICATED", "Faça login para continuar.");
  }
}
