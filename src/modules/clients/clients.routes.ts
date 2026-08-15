import type { FastifyInstance } from "fastify";
import { requireStaffAuth } from "../../plugins/auth.js";
import { createClientSchema, searchClientsQuerySchema } from "./clients.schema.js";
import { createWalkInClient, searchClients } from "./clients.service.js";

// Achar/cadastrar cliente é operação de balcão — qualquer staff (ADMIN ou
// BARBER), não é decisão de dono como catálogo/preço.
export async function clientsRoutes(app: FastifyInstance) {
  app.get("/clients", { preHandler: requireStaffAuth }, async (request) => {
    const query = searchClientsQuerySchema.parse(request.query);
    return { clients: await searchClients(query.search, query.limit) };
  });

  app.post("/clients", { preHandler: requireStaffAuth }, async (request, reply) => {
    const body = createClientSchema.parse(request.body);
    const client = await createWalkInClient(body);
    reply.code(201).send(client);
  });
}
