import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createWebhookEndpointSchema, updateWebhookEndpointSchema } from "./webhook-endpoints.schema.js";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookDeliveries,
  listWebhookEndpoints,
  updateWebhookEndpoint,
} from "./webhook-endpoints.service.js";

const deliveriesQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

export async function webhookEndpointsRoutes(app: FastifyInstance) {
  app.get("/webhook-endpoints", async () => {
    return { endpoints: await listWebhookEndpoints() };
  });

  app.post("/webhook-endpoints", async (request, reply) => {
    const body = createWebhookEndpointSchema.parse(request.body);
    const endpoint = await createWebhookEndpoint(body);
    reply.code(201).send(endpoint);
  });

  app.patch<{ Params: { id: string } }>("/webhook-endpoints/:id", async (request) => {
    const body = updateWebhookEndpointSchema.parse(request.body);
    return updateWebhookEndpoint(request.params.id, body);
  });

  app.delete<{ Params: { id: string } }>("/webhook-endpoints/:id", async (request, reply) => {
    await deleteWebhookEndpoint(request.params.id);
    reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>("/webhook-endpoints/:id/deliveries", async (request) => {
    const query = deliveriesQuerySchema.parse(request.query);
    return { deliveries: await getWebhookDeliveries(request.params.id, query.limit) };
  });
}
