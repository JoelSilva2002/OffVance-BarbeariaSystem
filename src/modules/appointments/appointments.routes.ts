import type { FastifyInstance } from "fastify";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { assertActingScope, resolveActingIdentity, requireStaffOrApiKey, type ActingIdentity } from "../../plugins/auth.js";
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

/** ADMIN e API key passam sempre; BARBER só se o agendamento for da própria agenda. */
async function assertOwnsAppointment(identity: ActingIdentity, appointmentId: string) {
  if (identity.unrestricted) return;
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { barberId: true },
  });
  if (!appointment) throw new Problem(404, "APPOINTMENT_NOT_FOUND", "Agendamento não encontrado.");
  assertActingScope(identity, appointment.barberId);
}

/**
 * Toda rota aqui é uso de equipe OU de máquina (n8n reagindo a uma resposta
 * de WhatsApp) — o cliente usa /me/appointments/*. `actorType`/`actorId` do
 * histórico de status vêm SEMPRE da identidade autenticada
 * (resolveActingIdentity), nunca do corpo da requisição — uma API key ou
 * um BARBER não podem se declarar "ADMIN" ou "CLIENT" no payload.
 * BARBER fica escopado à própria agenda; ADMIN e API key veem tudo.
 */
export async function appointmentsRoutes(app: FastifyInstance) {
  const readGuard = { preHandler: requireStaffOrApiKey("appointments:read") };
  const writeGuard = { preHandler: requireStaffOrApiKey("appointments:write") };

  app.post("/appointments", writeGuard, async (request, reply) => {
    const body = createAppointmentSchema.parse(request.body);
    const identity = resolveActingIdentity(request);
    if (!identity.unrestricted && body.barberId !== identity.barberId) {
      throw new Problem(403, "FORBIDDEN", "Você só pode criar agendamentos na sua própria agenda.");
    }
    const appointment = await createAppointment(body, identity.actorType, identity.actorId);
    reply.code(201).send(appointment);
  });

  app.get("/appointments", readGuard, async (request) => {
    const query = listAppointmentsQuerySchema.parse(request.query);
    const identity = resolveActingIdentity(request);
    const barberId = identity.unrestricted ? query.barberId : identity.barberId;

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
      include: {
        items: true,
        // nome pra exibição na agenda — client é opcional (bloqueio manual
        // não tem cliente), select explícito no User pra nunca vazar
        // passwordHash e afins.
        client: { include: { user: { select: { phone: true } } } },
        barber: { select: { id: true, displayName: true } },
      },
      orderBy: { startsAt: "asc" },
      take: query.limit,
    });

    return { appointments };
  });

  app.get<{ Params: { id: string } }>("/appointments/:id", readGuard, async (request) => {
    await assertOwnsAppointment(resolveActingIdentity(request), request.params.id);
    return getAppointment(request.params.id);
  });

  app.get<{ Params: { id: string } }>("/appointments/:id/history", readGuard, async (request) => {
    await assertOwnsAppointment(resolveActingIdentity(request), request.params.id);
    return { history: await getAppointmentHistory(request.params.id) };
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/confirm", writeGuard, async (request) => {
    const identity = resolveActingIdentity(request);
    await assertOwnsAppointment(identity, request.params.id);
    confirmSchema.parse(request.body ?? {});
    return confirmAppointment(request.params.id, identity.actorType, identity.actorId);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/check-in", writeGuard, async (request) => {
    const identity = resolveActingIdentity(request);
    await assertOwnsAppointment(identity, request.params.id);
    checkInSchema.parse(request.body ?? {});
    return checkInAppointment(request.params.id, identity.actorType, identity.actorId);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/complete", writeGuard, async (request) => {
    const identity = resolveActingIdentity(request);
    await assertOwnsAppointment(identity, request.params.id);
    const body = completeSchema.parse(request.body);
    return completeAppointment(request.params.id, identity.actorType, identity.actorId, body.internalNotes, body.payment);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/cancel", writeGuard, async (request) => {
    const identity = resolveActingIdentity(request);
    await assertOwnsAppointment(identity, request.params.id);
    const body = cancelSchema.parse(request.body ?? {});
    return cancelAppointment(request.params.id, identity.actorType, identity.actorId, body.reason);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/no-show", writeGuard, async (request) => {
    const identity = resolveActingIdentity(request);
    await assertOwnsAppointment(identity, request.params.id);
    const body = noShowSchema.parse(request.body ?? {});
    return markNoShow(request.params.id, identity.actorType, identity.actorId, body.reason);
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/reschedule", writeGuard, async (request) => {
    const identity = resolveActingIdentity(request);
    await assertOwnsAppointment(identity, request.params.id);
    const body = rescheduleSchema.parse(request.body);
    // remarcar move HORÁRIO; reatribuir para OUTRO barbeiro é decisão de
    // escala — nem um BARBER decide isso sozinho sobre a agenda de um
    // colega, mas ADMIN e API key (tratada como sistema) podem.
    if (!identity.unrestricted && body.barberId && body.barberId !== identity.barberId) {
      throw new Problem(403, "FORBIDDEN", "Só um administrador pode reatribuir o agendamento a outro barbeiro.");
    }
    return rescheduleAppointment(request.params.id, identity.actorType, identity.actorId, body);
  });
}
