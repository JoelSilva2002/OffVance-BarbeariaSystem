import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  app.get("/health/db", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", database: "up" };
  });
}
