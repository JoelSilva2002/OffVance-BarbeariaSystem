import type { FastifyInstance } from "fastify";
import { requireAdminAuth } from "../../plugins/auth.js";
import { createAdminSchema, staffLoginSchema, updateAdminSchema } from "./staff-auth.schema.js";
import { createAdmin, isBootstrapNeeded, listAdmins, staffLogin, updateAdmin } from "./staff-auth.service.js";

export async function staffAuthRoutes(app: FastifyInstance) {
  app.post("/auth/staff/login", async (request, reply) => {
    const body = staffLoginSchema.parse(request.body);
    const { userId, role, barberId } = await staffLogin(body.email, body.password);
    const token = await reply.jwtSign({ sub: userId, role, barberId }, { expiresIn: "12h" });
    reply.send({ token, role, barberId });
  });

  // Bootstrap: enquanto não existir nenhum ADMIN, este endpoint fica aberto
  // (é o único jeito de criar o primeiro). A partir daí, exige ADMIN.
  app.post("/admins", async (request, reply) => {
    if (!(await isBootstrapNeeded())) {
      await requireAdminAuth(request, reply);
    }
    const body = createAdminSchema.parse(request.body);
    const admin = await createAdmin(body);
    reply.code(201).send(admin);
  });

  app.get("/admins", { preHandler: requireAdminAuth }, async () => {
    return { admins: await listAdmins() };
  });

  app.patch<{ Params: { id: string } }>("/admins/:id", { preHandler: requireAdminAuth }, async (request) => {
    const body = updateAdminSchema.parse(request.body);
    return updateAdmin(request.params.id, body);
  });
}
