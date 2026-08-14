import type { FastifyInstance } from "fastify";
import { requireStaffAuth } from "../../plugins/auth.js";
import { getLoyaltySummary } from "./loyalty.service.js";

export async function loyaltyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireStaffAuth);

  app.get<{ Params: { id: string } }>("/clients/:id/loyalty", async (request) => {
    return getLoyaltySummary(request.params.id);
  });
}
