import type { FastifyInstance } from "fastify";
import { requireAdminAuth, requireStaffAuth } from "../../plugins/auth.js";
import {
  agendaQuerySchema,
  createBarberSchema,
  listBarbersQuerySchema,
  putBarberServicesSchema,
  putScheduleSchema,
  timeOffSchema,
  updateBarberSchema,
} from "./barbers.schema.js";
import {
  createBarber,
  createTimeOff,
  deleteBarber,
  getAgenda,
  getBarber,
  getSchedule,
  listBarbers,
  putBarberServices,
  putSchedule,
  updateBarber,
} from "./barbers.service.js";

export async function barbersRoutes(app: FastifyInstance) {
  // Listagem/detalhe ficam públicos — o portal do cliente usa isso para
  // escolher barbeiro no fluxo de agendamento.
  app.get("/barbers", async (request) => {
    const query = listBarbersQuerySchema.parse(request.query);
    return { barbers: await listBarbers(query.status, query.serviceId) };
  });

  app.get<{ Params: { id: string } }>("/barbers/:id", async (request) => {
    return getBarber(request.params.id);
  });

  // Criar/editar/remover colaborador e definir quem faz o quê é decisão de
  // dono — ADMIN. Grade/folga/agenda são operacionais — qualquer staff.
  app.post("/barbers", { preHandler: requireAdminAuth }, async (request, reply) => {
    const body = createBarberSchema.parse(request.body);
    const barber = await createBarber(body);
    reply.code(201).send(barber);
  });

  app.patch<{ Params: { id: string } }>("/barbers/:id", { preHandler: requireAdminAuth }, async (request) => {
    const body = updateBarberSchema.parse(request.body);
    return updateBarber(request.params.id, body);
  });

  app.delete<{ Params: { id: string } }>("/barbers/:id", { preHandler: requireAdminAuth }, async (request, reply) => {
    const barber = await deleteBarber(request.params.id);
    reply.code(200).send(barber);
  });

  app.put<{ Params: { id: string } }>(
    "/barbers/:id/services",
    { preHandler: requireAdminAuth },
    async (request) => {
      const body = putBarberServicesSchema.parse(request.body);
      return { services: await putBarberServices(request.params.id, body) };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/barbers/:id/schedule",
    { preHandler: requireStaffAuth },
    async (request) => {
      return { schedule: await getSchedule(request.params.id) };
    },
  );

  app.put<{ Params: { id: string } }>(
    "/barbers/:id/schedule",
    { preHandler: requireStaffAuth },
    async (request) => {
      const body = putScheduleSchema.parse(request.body);
      return { schedule: await putSchedule(request.params.id, body) };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/barbers/:id/time-off",
    { preHandler: requireStaffAuth },
    async (request, reply) => {
      const body = timeOffSchema.parse(request.body);
      const result = await createTimeOff(request.params.id, body);
      reply.code(201).send(result);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/barbers/:id/agenda",
    { preHandler: requireStaffAuth },
    async (request) => {
      const query = agendaQuerySchema.parse(request.query);
      return getAgenda(request.params.id, query.date);
    },
  );
}
