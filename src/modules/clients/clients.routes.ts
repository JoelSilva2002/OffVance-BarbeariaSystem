import type { FastifyInstance } from "fastify";
import { requireStaffAuth, requireStaffOrApiKey } from "../../plugins/auth.js";
import { createClientSchema, searchClientsQuerySchema } from "./clients.schema.js";
import { createWalkInClient, findClientByPhone, searchClients } from "./clients.service.js";

// Achar/cadastrar cliente é operação de balcão — qualquer staff (ADMIN ou
// BARBER), não é decisão de dono como catálogo/preço. `GET` também aceita
// API key (`clients:read`) — é como o WF-2 do n8n resolve quem respondeu no
// WhatsApp; `POST` continua staff-only, cadastro não é coisa de bot.
export async function clientsRoutes(app: FastifyInstance) {
  app.get("/clients", { preHandler: requireStaffOrApiKey("clients:read") }, async (request) => {
    const query = searchClientsQuerySchema.parse(request.query);
    if (query.phone) {
      const client = await findClientByPhone(query.phone);
      return { clients: client ? [client] : [] };
    }
    return { clients: await searchClients(query.search as string, query.limit) };
  });

  app.post("/clients", { preHandler: requireStaffAuth }, async (request, reply) => {
    const body = createClientSchema.parse(request.body);
    const client = await createWalkInClient(body);
    reply.code(201).send(client);
  });
}
