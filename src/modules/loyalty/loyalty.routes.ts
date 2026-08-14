import type { FastifyInstance } from "fastify";
import { getLoyaltySummary } from "./loyalty.service.js";

export async function loyaltyRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/clients/:id/loyalty", async (request) => {
    return getLoyaltySummary(request.params.id);
  });
}
