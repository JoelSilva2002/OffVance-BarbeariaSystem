import type { FastifyInstance } from "fastify";
import { requireClientAuth } from "../../plugins/auth.js";
import {
  cancelMyAppointmentSchema,
  createMyAppointmentSchema,
  listMyAppointmentsQuerySchema,
  rescheduleMyAppointmentSchema,
  updateMeSchema,
} from "./me.schema.js";
import {
  cancelMyAppointment,
  createMyAppointment,
  getMe,
  getMyLastAppointment,
  listMyAppointments,
  rescheduleMyAppointment,
  updateMe,
} from "./me.service.js";

/** Todas as rotas aqui exigem sessão de cliente (OTP) — o hook vale só para este encapsulamento. */
export async function meRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireClientAuth);

  app.get("/me", async (request) => getMe(request.authClient!.sub));

  app.patch("/me", async (request) => {
    const body = updateMeSchema.parse(request.body);
    return updateMe(request.authClient!.sub, body);
  });

  app.get("/me/appointments", async (request) => {
    const query = listMyAppointmentsQuerySchema.parse(request.query);
    return { appointments: await listMyAppointments(request.authClient!.sub, query.scope, query.limit) };
  });

  app.get("/me/appointments/last", async (request) => {
    return { appointment: await getMyLastAppointment(request.authClient!.sub) };
  });

  app.post("/me/appointments", async (request, reply) => {
    const body = createMyAppointmentSchema.parse(request.body);
    const appointment = await createMyAppointment(request.authClient!.sub, body);
    reply.code(201).send(appointment);
  });

  app.post<{ Params: { id: string } }>("/me/appointments/:id/cancel", async (request) => {
    const body = cancelMyAppointmentSchema.parse(request.body ?? {});
    return cancelMyAppointment(request.authClient!.sub, request.params.id, body.reason);
  });

  app.post<{ Params: { id: string } }>("/me/appointments/:id/reschedule", async (request) => {
    const body = rescheduleMyAppointmentSchema.parse(request.body);
    return rescheduleMyAppointment(request.authClient!.sub, request.params.id, body);
  });
}
