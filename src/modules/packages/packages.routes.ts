import type { FastifyInstance } from "fastify";
import {
  createPackageSchema,
  listPackagesQuerySchema,
  purchasePackageSchema,
  updatePackageSchema,
} from "./packages.schema.js";
import { createPackage, getPackage, listPackages, updatePackage } from "./packages.service.js";
import { listClientPackages, purchasePackage } from "./client-packages.service.js";

export async function packagesRoutes(app: FastifyInstance) {
  app.get("/packages", async (request) => {
    const query = listPackagesQuerySchema.parse(request.query);
    return { packages: await listPackages(query.active) };
  });

  app.get<{ Params: { id: string } }>("/packages/:id", async (request) => getPackage(request.params.id));

  app.post("/packages", async (request, reply) => {
    const body = createPackageSchema.parse(request.body);
    const pkg = await createPackage(body);
    reply.code(201).send(pkg);
  });

  app.patch<{ Params: { id: string } }>("/packages/:id", async (request) => {
    const body = updatePackageSchema.parse(request.body);
    return updatePackage(request.params.id, body);
  });

  app.post<{ Params: { id: string } }>("/clients/:id/packages", async (request, reply) => {
    const body = purchasePackageSchema.parse(request.body);
    const clientPackage = await purchasePackage(request.params.id, body);
    reply.code(201).send(clientPackage);
  });

  app.get<{ Params: { id: string } }>("/clients/:id/packages", async (request) => {
    return { packages: await listClientPackages(request.params.id) };
  });
}
