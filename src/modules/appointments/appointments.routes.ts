import type { FastifyInstance } from "fastify";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { createAppointmentSchema, listAppointmentsQuerySchema } from "./appointments.schema.js";
import { createAppointment } from "./appointments.service.js";
import {
  cancelSchema,
  checkInSchema,
  completeSchema,
  confirmSchema,
  noShowSchema,
  rescheduleSchema,
} from "./lifecycle.schema.js";
import {
  cancelAppointment,
  checkInAppointment,
  completeAppointment,
  confirmAppointment,
  getAppointment,
  getAppointmentHistory,
  markNoShow,
  rescheduleAppointment,
} from "./lifecycle.service.js";

export async function appointmentsRoutes(app: FastifyInstance) {
  app.post("/appointments", async (request, reply) => {
    const body = createAppointmentSchema.parse(request.body);
    const appointment = await createAppointment(body);
    reply.code(201).send(appointment);
  });

  app.get("/appointments", async (request) => {
    const query = listAppointmentsQuerySchema.parse(request.query);

    const appointments = await prisma.appointment.findMany({
      where: {
        barberId: query.barberId,
        clientId: query.clientId,
        status: query.status as AppointmentStatus | undefined,
        startsAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
      },
      include: { items: true },
      orderBy: { startsAt: "asc" },
      take: query.limit,
    });

    return { appointments };
  });

  app.get<{ Params: { id: string } }>("/appointments/:id", async (request) => {
    return getAppointment(request.params.id);
  });

  app.get<{ Params: { id: string } }>("/appointments/:id/history", async (request) => {
    return { history: await getAppointmentHistory(request.params.id) };
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/confirm", async (request) => {
    const body = confirmSchema.parse(request.body ?? {});
    return confirmAppointment(request.params.id, body.actorType, body.actorId);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/check-in", async (request) => {
    const body = checkInSchema.parse(request.body ?? {});
    return checkInAppointment(request.params.id, body.actorType, body.actorId);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/complete", async (request) => {
    const body = completeSchema.parse(request.body);
    return completeAppointment(request.params.id, body.actorType, body.actorId, body.internalNotes, body.payment);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/cancel", async (request) => {
    const body = cancelSchema.parse(request.body ?? {});
    return cancelAppointment(request.params.id, body.actorType, body.actorId, body.reason);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/no-show", async (request) => {
    const body = noShowSchema.parse(request.body ?? {});
    return markNoShow(request.params.id, body.actorType, body.actorId, body.reason);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/reschedule", async (request) => {
    const body = rescheduleSchema.parse(request.body);
    return rescheduleAppointment(request.params.id, body);
  });
}
