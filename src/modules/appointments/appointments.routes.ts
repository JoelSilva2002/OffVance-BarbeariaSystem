import type { FastifyInstance } from "fastify";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { assertBarberScope, requireStaffAuth, type StaffTokenPayload } from "../../plugins/auth.js";
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

/** ADMIN passa sempre; BARBER só se o agendamento for da própria agenda. */
async function assertOwnsAppointment(staff: StaffTokenPayload, appointmentId: string) {
  if (staff.role === "ADMIN") return;
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { barberId: true },
  });
  if (!appointment) throw new Problem(404, "APPOINTMENT_NOT_FOUND", "Agendamento não encontrado.");
  assertBarberScope(staff, appointment.barberId);
}

/**
 * Toda rota aqui é uso de equipe (agendar em nome de um cliente, ver a
 * agenda inteira, tocar o ciclo de vida) — o cliente usa /me/appointments/*.
 * Dentro disso, BARBER está escopado à própria agenda; ADMIN vê tudo.
 */
export async function appointmentsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireStaffAuth);

  app.post("/appointments", async (request, reply) => {
    const body = createAppointmentSchema.parse(request.body);
    const staff = request.authStaff!;
    if (staff.role === "BARBER" && body.barberId !== staff.barberId) {
      throw new Problem(403, "FORBIDDEN", "Você só pode criar agendamentos na sua própria agenda.");
    }
    const appointment = await createAppointment(body);
    reply.code(201).send(appointment);
  });

  app.get("/appointments", async (request) => {
    const query = listAppointmentsQuerySchema.parse(request.query);
    const staff = request.authStaff!;
    const barberId = staff.role === "BARBER" ? staff.barberId : query.barberId;

    const appointments = await prisma.appointment.findMany({
      where: {
        barberId,
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
    await assertOwnsAppointment(request.authStaff!, request.params.id);
    return getAppointment(request.params.id);
  });

  app.get<{ Params: { id: string } }>("/appointments/:id/history", async (request) => {
    await assertOwnsAppointment(request.authStaff!, request.params.id);
    return { history: await getAppointmentHistory(request.params.id) };
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/confirm", async (request) => {
    await assertOwnsAppointment(request.authStaff!, request.params.id);
    const body = confirmSchema.parse(request.body ?? {});
    return confirmAppointment(request.params.id, body.actorType, body.actorId);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/check-in", async (request) => {
    await assertOwnsAppointment(request.authStaff!, request.params.id);
    const body = checkInSchema.parse(request.body ?? {});
    return checkInAppointment(request.params.id, body.actorType, body.actorId);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/complete", async (request) => {
    await assertOwnsAppointment(request.authStaff!, request.params.id);
    const body = completeSchema.parse(request.body);
    return completeAppointment(request.params.id, body.actorType, body.actorId, body.internalNotes, body.payment);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/cancel", async (request) => {
    await assertOwnsAppointment(request.authStaff!, request.params.id);
    const body = cancelSchema.parse(request.body ?? {});
    return cancelAppointment(request.params.id, body.actorType, body.actorId, body.reason);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/no-show", async (request) => {
    await assertOwnsAppointment(request.authStaff!, request.params.id);
    const body = noShowSchema.parse(request.body ?? {});
    return markNoShow(request.params.id, body.actorType, body.actorId, body.reason);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/reschedule", async (request) => {
    const staff = request.authStaff!;
    await assertOwnsAppointment(staff, request.params.id);
    const body = rescheduleSchema.parse(request.body);
    // remarcar move HORÁRIO; reatribuir para OUTRO barbeiro é decisão de
    // escala, não algo que o próprio barbeiro decide sozinho sobre a agenda de um colega.
    if (staff.role === "BARBER" && body.barberId && body.barberId !== staff.barberId) {
      throw new Problem(403, "FORBIDDEN", "Só um administrador pode reatribuir o agendamento a outro barbeiro.");
    }
    return rescheduleAppointment(request.params.id, body);
  });
}
