import type { FastifyRequest, FastifyReply } from "fastify";
import { Problem } from "../lib/problem.js";
import { prisma } from "../lib/prisma.js";
import { hashApiKey, isApiKeyFormat } from "../lib/tokens.js";
import type { ApiKeyScope } from "../modules/apikeys/scopes.js";

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

export interface ApiKeyContext {
  apiKeyId: string;
  scopes: string[];
}

declare module "fastify" {
  interface FastifyRequest {
    authClient?: ClientTokenPayload;
    authStaff?: StaffTokenPayload;
    authApiKey?: ApiKeyContext;
  }
}

function extractBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
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

/**
 * Escopo por barbeiro: ADMIN passa sempre; BARBER só passa se `targetBarberId`
 * for o dele mesmo. Chamar depois de requireStaffAuth já ter populado
 * request.authStaff. Mensagem propositalmente vaga — não confirma nem nega
 * que o recurso existe, só que este token não pode vê-lo.
 */
export function assertBarberScope(staff: StaffTokenPayload, targetBarberId: string) {
  if (staff.role === "ADMIN") return;
  if (staff.barberId !== targetBarberId) {
    throw new Problem(403, "FORBIDDEN", "Você só pode acessar informações da sua própria agenda.");
  }
}

/**
 * Autenticação de máquina (docs/ARQUITETURA.md §02: JWT para humanos,
 * `Bearer sk_live_…` com escopos para máquinas). Cada chamada verifica a
 * chave contra o hash no banco — nunca guardamos a chave crua — e confere
 * se TODOS os escopos pedidos pela rota estão na chave; falta de escopo é
 * 403, não 401 (a chave é válida, só não pode fazer aquilo).
 */
export function requireApiKeyAuth(...requiredScopes: ApiKeyScope[]) {
  return async function apiKeyGuard(request: FastifyRequest, _reply: FastifyReply) {
    const token = extractBearerToken(request);
    if (!token) throw new Problem(401, "UNAUTHENTICATED", "Informe uma API key.");

    const apiKey = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(token) } });
    if (!apiKey || !apiKey.active) {
      throw new Problem(401, "INVALID_API_KEY", "API key inválida ou revogada.");
    }
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new Problem(401, "INVALID_API_KEY", "API key expirada.");
    }
    const missing = requiredScopes.filter((scope) => !apiKey.scopes.includes(scope));
    if (missing.length > 0) {
      throw new Problem(403, "INSUFFICIENT_SCOPE", `Esta API key não tem o escopo necessário: ${missing.join(", ")}.`);
    }

    // fire-and-forget — não atrasa a resposta por causa de uma atualização de telemetria
    prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

    request.authApiKey = { apiKeyId: apiKey.id, scopes: apiKey.scopes };
  };
}

/**
 * Aceita OU uma sessão de equipe OU uma API key com os escopos pedidos —
 * decide pelo prefixo do token (`sk_` = API key) sem tentar os dois
 * caminhos e engolir o primeiro erro, o que confundiria qual credencial
 * de fato falhou.
 */
export function requireStaffOrApiKey(...requiredScopes: ApiKeyScope[]) {
  const apiKeyGuard = requireApiKeyAuth(...requiredScopes);
  return async function staffOrApiKeyGuard(request: FastifyRequest, reply: FastifyReply) {
    const token = extractBearerToken(request);
    if (token && isApiKeyFormat(token)) {
      return apiKeyGuard(request, reply);
    }
    return requireStaffAuth(request, reply);
  };
}
