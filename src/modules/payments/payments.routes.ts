import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAdminAuth } from "../../plugins/auth.js";

const listPaymentsQuerySchema = z.object({
  method: z.enum(["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX", "PACKAGE"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// Visão financeira completa da loja — ADMIN.
export async function paymentsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdminAuth);

  app.get("/payments", async (request) => {
    const query = listPaymentsQuerySchema.parse(request.query);
    const payments = await prisma.payment.findMany({
      where: { method: query.method },
      include: { appointment: true, clientPackage: { include: { package: true } } },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
    return { payments };
  });
}
