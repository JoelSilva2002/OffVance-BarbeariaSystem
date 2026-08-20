import { apiRequest } from "./client";
import type { Review } from "./appointments";

export interface CreateReviewInput {
  rating: number;
  comment?: string;
}

export function createReview(appointmentId: string, input: CreateReviewInput) {
  return apiRequest<Review>(`/me/appointments/${appointmentId}/review`, { method: "POST", body: input });
}
