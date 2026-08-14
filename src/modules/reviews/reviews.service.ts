import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { REVIEW_EVENT } from "../outbox/event-types.js";
import type { CreateReviewInput } from "./reviews.schema.js";

/**
 * Liberado só depois de CONCLUÍDO (docs/ARQUITETURA.md §03) — uma
 * avaliação por atendimento, não por barbeiro, então não há nota "solta"
 * sem visita real por trás.
 */
export async function createReview(clientId: string, appointmentId: string, input: CreateReviewInput) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment || appointment.clientId !== clientId) {
    throw new Problem(404, "APPOINTMENT_NOT_FOUND", "Agendamento não encontrado.");
  }
  if (appointment.status !== "CONCLUIDO") {
    throw new Problem(422, "REVIEW_NOT_ALLOWED", "Só é possível avaliar um atendimento já concluído.");
  }

  const existing = await prisma.review.findUnique({ where: { appointmentId } });
  if (existing) throw new Problem(409, "ALREADY_REVIEWED", "Este atendimento já foi avaliado.");

  return prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        appointmentId,
        clientId,
        barberId: appointment.barberId,
        rating: input.rating,
        comment: input.comment,
      },
    });

    await tx.outboxEvent.create({
      data: {
        aggregateType: "review",
        aggregateId: review.id,
        eventType: REVIEW_EVENT.SUBMITTED,
        payload: {
          reviewId: review.id,
          appointmentId,
          barberId: appointment.barberId,
          rating: input.rating,
          comment: input.comment ?? null,
        },
      },
    });

    return review;
  });
}

export async function getBarberReviews(barberId: string, limit: number) {
  const [reviews, aggregate] = await Promise.all([
    prisma.review.findMany({ where: { barberId }, orderBy: { publishedAt: "desc" }, take: limit }),
    prisma.review.aggregate({ where: { barberId }, _avg: { rating: true }, _count: true }),
  ]);
  return { averageRating: aggregate._avg.rating, totalReviews: aggregate._count, reviews };
}

export async function listReviews(limit: number) {
  return prisma.review.findMany({ orderBy: { publishedAt: "desc" }, take: limit });
}
