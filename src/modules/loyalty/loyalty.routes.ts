import type { FastifyInstance } from "fastify";
import { requireStaffOrApiKey } from "../../plugins/auth.js";
import { getLoyaltySummary } from "./loyalty.service.js";

export async function loyaltyRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    "/clients/:id/loyalty",
    { preHandler: requireStaffOrApiKey("financeiro:read") },
    async (request) => {
      return getLoyaltySummary(request.params.id);
    },
  );
}
