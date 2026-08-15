import type { FastifyInstance } from "fastify";
import { Problem } from "../../lib/problem.js";
import { requireAdminAuth } from "../../plugins/auth.js";
import {
  createAdminSchema,
  forgotPasswordSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  staffLoginSchema,
  updateAdminSchema,
} from "./staff-auth.schema.js";
import {
  createAdmin,
  isBootstrapNeeded,
  issueRefreshToken,
  listAdmins,
  revokeRefreshToken,
  rotateStaffSession,
  staffLogin,
  updateAdmin,
} from "./staff-auth.service.js";
import { requestPasswordReset, resetPassword } from "./password-reset.service.js";

// Access token curto (a API só confia nele por pouco tempo); refresh token
// longo e opaco, guardado com hash no banco, é o que sustenta a sessão.
const ACCESS_TOKEN_TTL = "30m";

export async function staffAuthRoutes(app: FastifyInstance) {
  // Camada 1 de defesa contra bruteforce: limite por IP, pega um ataque
  // rápido de um único lugar. Camada 2 (bloqueio de conta após tentativas
  // erradas, pega ataque lento/distribuído contra UMA conta) mora em
  // staffLogin — ver staff-auth.service.ts.
  app.post(
    "/auth/staff/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          // Devolve um Problem de verdade (não um objeto solto) para o
          // errorHandlerPlugin reconhecer via `instanceof Problem` e formatar
          // como todo o resto da API — senão cai no fallback genérico de 500.
          errorResponseBuilder: (_request, context) =>
            new Problem(
              429,
              "RATE_LIMITED",
              `Muitas tentativas de login a partir deste endereço. Tente de novo em ${Math.ceil(context.ttl / 1000)}s.`,
            ),
        },
      },
    },
    async (request, reply) => {
      const body = staffLoginSchema.parse(request.body);
      const { userId, role, barberId } = await staffLogin(body.email, body.password);
      const accessToken = await reply.jwtSign({ sub: userId, role, barberId }, { expiresIn: ACCESS_TOKEN_TTL });
      const refreshToken = await issueRefreshToken(userId);
      reply.send({ accessToken, refreshToken, role, barberId });
    },
  );

  app.post("/auth/staff/refresh", async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);
    const { userId, role, barberId, refreshToken } = await rotateStaffSession(body.refreshToken);
    const accessToken = await reply.jwtSign({ sub: userId, role, barberId }, { expiresIn: ACCESS_TOKEN_TTL });
    reply.send({ accessToken, refreshToken, role, barberId });
  });

  app.post("/auth/staff/logout", async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);
    await revokeRefreshToken(body.refreshToken);
    reply.code(204).send();
  });

  // Sempre 202, exista a conta ou não — não dar pista de qual e-mail tem
  // login de equipe (mesma postura de staffLogin não distinguir "não
  // existe" de "senha errada"). Rate limit por IP evita virar spam de
  // e-mail alheio.
  app.post(
    "/auth/staff/forgot-password",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
          errorResponseBuilder: (_request, context) =>
            new Problem(429, "RATE_LIMITED", `Muitas tentativas. Tente de novo em ${Math.ceil(context.ttl / 1000)}s.`),
        },
      },
    },
    async (request, reply) => {
      const body = forgotPasswordSchema.parse(request.body);
      await requestPasswordReset(body.email);
      reply.code(202).send();
    },
  );

  app.post(
    "/auth/staff/reset-password",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
          errorResponseBuilder: (_request, context) =>
            new Problem(429, "RATE_LIMITED", `Muitas tentativas. Tente de novo em ${Math.ceil(context.ttl / 1000)}s.`),
        },
      },
    },
    async (request, reply) => {
      const body = resetPasswordSchema.parse(request.body);
      await resetPassword(body.token, body.newPassword);
      reply.code(204).send();
    },
  );

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
