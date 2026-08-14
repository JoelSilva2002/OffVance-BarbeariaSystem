import type { FastifyInstance } from "fastify";
import { requireStaffAuth } from "../../plugins/auth.js";
import { createOrderSchema, listOrdersQuerySchema } from "./orders.schema.js";
import { createOrder, getOrder, listOrders } from "./orders.service.js";

// Venda no balcão é operação de equipe (staff), não precisa ser ADMIN.
export async function ordersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireStaffAuth);

  app.post("/orders", async (request, reply) => {
    const body = createOrderSchema.parse(request.body);
    const order = await createOrder(body);
    reply.code(201).send(order);
  });

  app.get("/orders", async (request) => {
    const query = listOrdersQuerySchema.parse(request.query);
    return { orders: await listOrders(query.clientId, query.limit) };
  });

  app.get<{ Params: { id: string } }>("/orders/:id", async (request) => getOrder(request.params.id));
}
