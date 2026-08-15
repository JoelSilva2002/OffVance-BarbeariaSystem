import type { FastifyInstance } from "fastify";
import { requireAdminAuth } from "../../plugins/auth.js";
import { createApiKeySchema, updateApiKeySchema } from "./api-keys.schema.js";
import { createApiKey, deleteApiKey, listApiKeys, updateApiKey } from "./api-keys.service.js";

// Emitir uma chave de máquina é decisão de dono — ADMIN.
export async function apiKeysRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdminAuth);

  app.post("/api-keys", async (request, reply) => {
    const body = createApiKeySchema.parse(request.body);
    const apiKey = await createApiKey(body);
    reply.code(201).send(apiKey);
  });

  app.get("/api-keys", async () => {
    return { apiKeys: await listApiKeys() };
  });

  app.patch<{ Params: { id: string } }>("/api-keys/:id", async (request) => {
    const body = updateApiKeySchema.parse(request.body);
    return updateApiKey(request.params.id, body);
  });

  app.delete<{ Params: { id: string } }>("/api-keys/:id", async (request, reply) => {
    await deleteApiKey(request.params.id);
    reply.code(204).send();
  });
}
