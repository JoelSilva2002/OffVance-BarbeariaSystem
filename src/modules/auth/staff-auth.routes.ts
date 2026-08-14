import type { FastifyInstance } from "fastify";
import { requireAdminAuth } from "../../plugins/auth.js";
import {
  createAdminSchema,
  refreshTokenSchema,
  staffLoginSchema,
  updateAdminSchema,
} from "./staff-auth.schema.js";
import {
  createAdmin,
  isBootstrapNeeded,
  issueRefreshToken,
  listAdmins,
  revokeRefreshToken,
  rotateRefreshToken,
  staffLogin,
  updateAdmin,
} from "./staff-auth.service.js";

// Access token curto (a API só confia nele por pouco tempo); refresh token
// longo e opaco, guardado com hash no banco, é o que sustenta a sessão.
const ACCESS_TOKEN_TTL = "30m";

export async function staffAuthRoutes(app: FastifyInstance) {
  app.post("/auth/staff/login", async (request, reply) => {
    const body = staffLoginSchema.parse(request.body);
    const { userId, role, barberId } = await staffLogin(body.email, body.password);
    const accessToken = await reply.jwtSign({ sub: userId, role, barberId }, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = await issueRefreshToken(userId);
    reply.send({ accessToken, refreshToken, role, barberId });
  });

  app.post("/auth/staff/refresh", async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);
    const { userId, role, barberId, refreshToken } = await rotateRefreshToken(body.refreshToken);
    const accessToken = await reply.jwtSign({ sub: userId, role, barberId }, { expiresIn: ACCESS_TOKEN_TTL });
    reply.send({ accessToken, refreshToken, role, barberId });
  });

  app.post("/auth/staff/logout", async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);
    await revokeRefreshToken(body.refreshToken);
    reply.code(204).send();
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
