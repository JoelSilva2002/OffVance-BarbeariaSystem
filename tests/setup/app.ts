import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";

/**
 * Uma instância nova por chamada — importa pro rate limiter de login
 * (@fastify/rate-limit guarda estado em memória por instância): reusar o
 * mesmo app entre testes de login faria as tentativas de um teste
 * contarem pro limite do próximo. `.inject()` não abre porta de verdade,
 * então isso é barato.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  const app = buildApp();
  await app.ready();
  return app;
}
