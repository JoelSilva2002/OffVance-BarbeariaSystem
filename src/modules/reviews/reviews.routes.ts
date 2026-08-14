import type { FastifyInstance } from "fastify";
import { listReviewsQuerySchema } from "./reviews.schema.js";
import { getBarberReviews, listReviews } from "./reviews.service.js";

export async function reviewsRoutes(app: FastifyInstance) {
  app.get("/reviews", async (request) => {
    const query = listReviewsQuerySchema.parse(request.query);
    return { reviews: await listReviews(query.limit) };
  });

  app.get<{ Params: { id: string } }>("/barbers/:id/reviews", async (request) => {
    const query = listReviewsQuerySchema.parse(request.query);
    return getBarberReviews(request.params.id, query.limit);
  });
}
