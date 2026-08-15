import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireStaffOrApiKey } from "../../plugins/auth.js";

const listEventsQuerySchema = z.object({
  since: z.string().optional(),
  types: z
    .string()
    .optional()
    .transform((s) => s?.split(",").map((t) => t.trim()).filter(Boolean)),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Fallback de "pull" (docs/ARQUITETURA.md §02): quando o n8n está atrás de
 * NAT ou o push falhou, ele lê o outbox diretamente por aqui em vez de
 * esperar um POST chegar. Aceita sessão de equipe OU API key com escopo
 * events:read — é a rota pensada pra máquina, não só um GET de staff.
 */
export async function eventsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireStaffOrApiKey("events:read"));

  app.get("/events", async (request) => {
    const query = listEventsQuerySchema.parse(request.query);

    const events = await prisma.outboxEvent.findMany({
      where: { eventType: query.types ? { in: query.types } : undefined },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: query.limit,
      ...(query.since ? { cursor: { id: query.since }, skip: 1 } : {}),
    });

    const last = events[events.length - 1];
    return {
      events,
      nextCursor: last?.id ?? query.since ?? null,
      hasMore: events.length === query.limit,
    };
  });
}
