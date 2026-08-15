import type { FastifyInstance } from "fastify";
import { assertActingScope, requireAdminAuth, requireStaffOrApiKey, resolveActingIdentity } from "../../plugins/auth.js";
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

  // Criar/editar/remover colaborador (cria credencial de login) e definir
  // quem faz o quê são decisão de dono — ADMIN só, de propósito sem
  // alternativa de API key (ver comentário em apikeys/scopes.ts). Grade/
  // folga/agenda são operacionais — staff ou API key com escopo barbers:*.
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

  // Grade/folga/agenda são operacionais, mas escopadas: um BARBER só mexe
  // na própria (ADMIN e API key não têm essa restrição — resolveActingIdentity
  // marca os dois como `unrestricted`, ver plugins/auth.ts).
  app.get<{ Params: { id: string } }>(
    "/barbers/:id/schedule",
    { preHandler: requireStaffOrApiKey("barbers:read") },
    async (request) => {
      assertActingScope(resolveActingIdentity(request), request.params.id);
      return { schedule: await getSchedule(request.params.id) };
    },
  );

  app.put<{ Params: { id: string } }>(
    "/barbers/:id/schedule",
    { preHandler: requireStaffOrApiKey("barbers:write") },
    async (request) => {
      assertActingScope(resolveActingIdentity(request), request.params.id);
      const body = putScheduleSchema.parse(request.body);
      return { schedule: await putSchedule(request.params.id, body) };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/barbers/:id/time-off",
    { preHandler: requireStaffOrApiKey("barbers:write") },
    async (request, reply) => {
      assertActingScope(resolveActingIdentity(request), request.params.id);
      const body = timeOffSchema.parse(request.body);
      const result = await createTimeOff(request.params.id, body);
      reply.code(201).send(result);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/barbers/:id/agenda",
    { preHandler: requireStaffOrApiKey("barbers:read") },
    async (request) => {
      assertActingScope(resolveActingIdentity(request), request.params.id);
      const query = agendaQuerySchema.parse(request.query);
      return getAgenda(request.params.id, query.date);
    },
  );
}
