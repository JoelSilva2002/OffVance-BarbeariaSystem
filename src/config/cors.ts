import type { FastifyBaseLogger } from "fastify";
import { env } from "./env.js";

/**
 * Nunca reflete qualquer origem (era `origin: true` — qualquer site podia
 * chamar a API do navegador de um usuário logado). Falha para o lado
 * seguro: sem CORS_ORIGINS configurado em produção, fecha em vez de abrir
 * (mesma lógica assimétrica do JWT_SECRET — lá falha fechado com erro
 * porque um segredo previsível é perigoso; aqui um CORS fechado por engano
 * só é inconveniente, então avisa e segue, não derruba o processo).
 */
export function resolveCorsOrigin(log: FastifyBaseLogger): boolean | (string | RegExp)[] {
  if (env.CORS_ORIGINS) {
    return env.CORS_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (env.NODE_ENV === "production") {
    log.warn(
      "CORS_ORIGINS não definido em produção — bloqueando todas as origens de navegador. " +
        "Defina CORS_ORIGINS com a(s) URL(s) do frontend para liberar.",
    );
    return false;
  }

  // dev: nenhum frontend fixo ainda (API-first) — libera qualquer porta local
  return [/^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/];
}
