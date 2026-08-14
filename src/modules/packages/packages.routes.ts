import type { FastifyInstance } from "fastify";
import { requireAdminAuth, requireStaffAuth } from "../../plugins/auth.js";
import {
  createPackageSchema,
  listPackagesQuerySchema,
  purchasePackageSchema,
  updatePackageSchema,
} from "./packages.schema.js";
import { createPackage, getPackage, listPackages, updatePackage } from "./packages.service.js";
import { listClientPackages, purchasePackage } from "./client-packages.service.js";

export async function packagesRoutes(app: FastifyInstance) {
  // Catálogo de pacotes fica público — é o que o cliente vê antes de comprar.
  app.get("/packages", async (request) => {
    const query = listPackagesQuerySchema.parse(request.query);
    return { packages: await listPackages(query.active) };
  });

  app.get<{ Params: { id: string } }>("/packages/:id", async (request) => getPackage(request.params.id));

  // Preço/composição do pacote é decisão de dono — ADMIN.
  app.post("/packages", { preHandler: requireAdminAuth }, async (request, reply) => {
    const body = createPackageSchema.parse(request.body);
    const pkg = await createPackage(body);
    reply.code(201).send(pkg);
  });

  app.patch<{ Params: { id: string } }>("/packages/:id", { preHandler: requireAdminAuth }, async (request) => {
    const body = updatePackageSchema.parse(request.body);
    return updatePackage(request.params.id, body);
  });

  // Vender/consultar pacote de um cliente é operação de balcão — staff.
  app.post<{ Params: { id: string } }>(
    "/clients/:id/packages",
    { preHandler: requireStaffAuth },
    async (request, reply) => {
      const body = purchasePackageSchema.parse(request.body);
      const clientPackage = await purchasePackage(request.params.id, body);
      reply.code(201).send(clientPackage);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/clients/:id/packages",
    { preHandler: requireStaffAuth },
    async (request) => {
      return { packages: await listClientPackages(request.params.id) };
    },
  );
}
