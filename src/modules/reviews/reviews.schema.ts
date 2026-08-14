import { z } from "zod";

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const listReviewsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
