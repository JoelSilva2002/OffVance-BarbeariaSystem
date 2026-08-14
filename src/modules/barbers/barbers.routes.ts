import type { FastifyInstance } from "fastify";
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
  app.get("/barbers", async (request) => {
    const query = listBarbersQuerySchema.parse(request.query);
    return { barbers: await listBarbers(query.status, query.serviceId) };
  });

  app.get<{ Params: { id: string } }>("/barbers/:id", async (request) => {
    return getBarber(request.params.id);
  });

  app.post("/barbers", async (request, reply) => {
    const body = createBarberSchema.parse(request.body);
    const barber = await createBarber(body);
    reply.code(201).send(barber);
  });

  app.patch<{ Params: { id: string } }>("/barbers/:id", async (request) => {
    const body = updateBarberSchema.parse(request.body);
    return updateBarber(request.params.id, body);
  });

  app.delete<{ Params: { id: string } }>("/barbers/:id", async (request, reply) => {
    const barber = await deleteBarber(request.params.id);
    reply.code(200).send(barber);
  });

  app.put<{ Params: { id: string } }>("/barbers/:id/services", async (request) => {
    const body = putBarberServicesSchema.parse(request.body);
    return { services: await putBarberServices(request.params.id, body) };
  });

  app.get<{ Params: { id: string } }>("/barbers/:id/schedule", async (request) => {
    return { schedule: await getSchedule(request.params.id) };
  });

  app.put<{ Params: { id: string } }>("/barbers/:id/schedule", async (request) => {
    const body = putScheduleSchema.parse(request.body);
    return { schedule: await putSchedule(request.params.id, body) };
  });

  app.post<{ Params: { id: string } }>("/barbers/:id/time-off", async (request, reply) => {
    const body = timeOffSchema.parse(request.body);
    const result = await createTimeOff(request.params.id, body);
    reply.code(201).send(result);
  });

  app.get<{ Params: { id: string } }>("/barbers/:id/agenda", async (request) => {
    const query = agendaQuerySchema.parse(request.query);
    return getAgenda(request.params.id, query.date);
  });
}
