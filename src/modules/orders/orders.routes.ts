import type { FastifyInstance } from "fastify";
import { requireStaffOrApiKey } from "../../plugins/auth.js";
import { createOrderSchema, listOrdersQuerySchema } from "./orders.schema.js";
import { createOrder, getOrder, listOrders } from "./orders.service.js";

// Venda no balcão é operação de equipe (staff), não precisa ser ADMIN — ou
// API key com financeiro:write/financeiro:read, pra um PDV externo vender
// direto sem sessão humana.
export async function ordersRoutes(app: FastifyInstance) {
  app.post("/orders", { preHandler: requireStaffOrApiKey("financeiro:write") }, async (request, reply) => {
    const body = createOrderSchema.parse(request.body);
    const order = await createOrder(body);
    reply.code(201).send(order);
  });

  app.get("/orders", { preHandler: requireStaffOrApiKey("financeiro:read") }, async (request) => {
    const query = listOrdersQuerySchema.parse(request.query);
    return { orders: await listOrders(query.clientId, query.limit) };
  });

  app.get<{ Params: { id: string } }>(
    "/orders/:id",
    { preHandler: requireStaffOrApiKey("financeiro:read") },
    async (request) => getOrder(request.params.id),
  );
}
