import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { requestOtpSchema, verifyOtpSchema, refreshTokenSchema } from "./otp.schema.js";
import { requestOtp, verifyOtp } from "./otp.service.js";
import { issueRefreshToken, revokeRefreshToken, rotateClientSession } from "./client-session.service.js";

// Access token curto (a API só confia nele por pouco tempo); refresh token
// longo e opaco, guardado com hash no banco, é o que sustenta a sessão —
// mesmo desenho de /auth/staff/*, ver staff-auth.routes.ts.
const ACCESS_TOKEN_TTL = "30m";

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/otp/request", async (request, reply) => {
    const body = requestOtpSchema.parse(request.body);
    const { expiresAt, code } = await requestOtp(body.phone);

    reply.code(202).send({
      message: "Código enviado por WhatsApp.",
      expiresAt,
      // Sem integração de WhatsApp real neste ambiente de dev, devolvemos o
      // código para testar o fluxo ponta a ponta. Nunca em produção.
      ...(env.NODE_ENV !== "production" ? { devCode: code } : {}),
    });
  });

  app.post("/auth/otp/verify", async (request, reply) => {
    const body = verifyOtpSchema.parse(request.body);
    const { client } = await verifyOtp(body.phone, body.code);

    const accessToken = await reply.jwtSign(
      { sub: client.id, userId: client.userId, role: "CLIENT" },
      { expiresIn: ACCESS_TOKEN_TTL },
    );
    const refreshToken = await issueRefreshToken(client.userId);
    reply.send({ accessToken, refreshToken, client });
  });

  app.post("/auth/otp/refresh", async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);
    const { clientId, userId, refreshToken } = await rotateClientSession(body.refreshToken);
    const accessToken = await reply.jwtSign({ sub: clientId, userId, role: "CLIENT" }, { expiresIn: ACCESS_TOKEN_TTL });
    reply.send({ accessToken, refreshToken });
  });

  app.post("/auth/otp/logout", async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);
    await revokeRefreshToken(body.refreshToken);
    reply.code(204).send();
  });
}
