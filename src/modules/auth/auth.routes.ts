import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { requestOtpSchema, verifyOtpSchema } from "./otp.schema.js";
import { requestOtp, verifyOtp } from "./otp.service.js";

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

    const token = await reply.jwtSign({ sub: client.id, userId: client.userId, role: "CLIENT" }, { expiresIn: "30d" });
    reply.send({ token, client });
  });
}
