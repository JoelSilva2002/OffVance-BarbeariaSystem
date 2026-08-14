import type { FastifyInstance } from "fastify";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { createAppointmentSchema, listAppointmentsQuerySchema } from "./appointments.schema.js";
import { createAppointment } from "./appointments.service.js";

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
}
