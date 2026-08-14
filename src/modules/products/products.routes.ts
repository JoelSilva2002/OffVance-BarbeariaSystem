import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdminAuth } from "../../plugins/auth.js";
import {
  addProductImageSchema,
  createProductSchema,
  listProductsQuerySchema,
  stockMovementSchema,
  updateProductSchema,
} from "./products.schema.js";
import {
  addProductImage,
  createProduct,
  getProduct,
  listProducts,
  listStockMovements,
  recordManualStockMovement,
  removeProductImage,
  updateProduct,
} from "./products.service.js";

const listMovementsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

export async function productsRoutes(app: FastifyInstance) {
  // Vitrine pública.
  app.get("/products", async (request) => {
    const query = listProductsQuerySchema.parse(request.query);
    return { products: await listProducts(query.active) };
  });

  app.get<{ Params: { id: string } }>("/products/:id", async (request) => getProduct(request.params.id));

  // Cadastro/preço/estoque é gestão de inventário — ADMIN.
  app.post("/products", { preHandler: requireAdminAuth }, async (request, reply) => {
    const body = createProductSchema.parse(request.body);
    const product = await createProduct(body);
    reply.code(201).send(product);
  });

  app.patch<{ Params: { id: string } }>("/products/:id", { preHandler: requireAdminAuth }, async (request) => {
    const body = updateProductSchema.parse(request.body);
    return updateProduct(request.params.id, body);
  });

  app.post<{ Params: { id: string } }>(
    "/products/:id/images",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const body = addProductImageSchema.parse(request.body);
      const image = await addProductImage(request.params.id, body.url, body.position);
      reply.code(201).send(image);
    },
  );

  app.delete<{ Params: { id: string; imageId: string } }>(
    "/products/:id/images/:imageId",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      await removeProductImage(request.params.id, request.params.imageId);
      reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    "/products/:id/stock-movements",
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const body = stockMovementSchema.parse(request.body);
      const stockQty = await recordManualStockMovement(request.params.id, body.delta, body.reason, body.notes);
      reply.code(201).send({ stockQty });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/products/:id/stock-movements",
    { preHandler: requireAdminAuth },
    async (request) => {
      const query = listMovementsQuerySchema.parse(request.query);
      return { movements: await listStockMovements(request.params.id, query.limit) };
    },
  );
}
