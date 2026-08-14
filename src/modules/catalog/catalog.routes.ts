import type { FastifyInstance } from "fastify";
import { requireAdminAuth } from "../../plugins/auth.js";
import {
  createCategorySchema,
  createServiceSchema,
  listServicesQuerySchema,
  updateCategorySchema,
  updateServiceSchema,
} from "./catalog.schema.js";
import {
  createCategory,
  createService,
  getService,
  getServiceBarbers,
  listCategories,
  listServices,
  updateCategory,
  updateService,
} from "./catalog.service.js";

export async function catalogRoutes(app: FastifyInstance) {
  // Vitrine pública: browsing de serviços é o passo 1 do fluxo de agendamento.
  app.get("/service-categories", async () => {
    return { categories: await listCategories() };
  });

  app.get("/services", async (request) => {
    const query = listServicesQuerySchema.parse(request.query);
    return { services: await listServices(query) };
  });

  app.get<{ Params: { id: string } }>("/services/:id", async (request) => {
    return getService(request.params.id);
  });

  app.get<{ Params: { id: string } }>("/services/:id/barbers", async (request) => {
    return { barbers: await getServiceBarbers(request.params.id) };
  });

  // Preço/catálogo é decisão de dono — ADMIN.
  app.post("/service-categories", { preHandler: requireAdminAuth }, async (request, reply) => {
    const body = createCategorySchema.parse(request.body);
    const category = await createCategory(body);
    reply.code(201).send(category);
  });

  app.patch<{ Params: { id: string } }>(
    "/service-categories/:id",
    { preHandler: requireAdminAuth },
    async (request) => {
      const body = updateCategorySchema.parse(request.body);
      return updateCategory(request.params.id, body);
    },
  );

  app.post("/services", { preHandler: requireAdminAuth }, async (request, reply) => {
    const body = createServiceSchema.parse(request.body);
    const service = await createService(body);
    reply.code(201).send(service);
  });

  app.patch<{ Params: { id: string } }>("/services/:id", { preHandler: requireAdminAuth }, async (request) => {
    const body = updateServiceSchema.parse(request.body);
    return updateService(request.params.id, body);
  });
}
