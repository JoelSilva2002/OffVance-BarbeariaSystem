import type { FastifyError, FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";
import { Problem } from "../lib/problem.js";

/**
 * Converte qualquer erro lançado nas rotas para application/problem+json
 * (RFC 9457), com um `code` estável para o n8n e outros consumidores
 * roteassem sem depender de texto livre.
 *
 * Envolvido com fastify-plugin para escapar da encapsulação: sem isso,
 * setErrorHandler só valeria para rotas registradas dentro deste mesmo
 * plugin, não para os módulos de negócio registrados como irmãos em app.ts.
 */
async function errorHandlerPluginImpl(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | Problem | ZodError, request, reply) => {
    if (error instanceof Problem) {
      request.log.warn({ code: error.code }, error.detail);
      reply.code(error.status).type("application/problem+json").send(error.toBody(request.url));
      return;
    }

    if (error instanceof ZodError) {
      const problem = new Problem(422, "VALIDATION_ERROR", error.issues.map((i) => i.message).join("; "));
      reply.code(422).type("application/problem+json").send(problem.toBody(request.url));
      return;
    }

    if (error.validation) {
      const problem = new Problem(400, "BAD_REQUEST", error.message);
      reply.code(400).type("application/problem+json").send(problem.toBody(request.url));
      return;
    }

    request.log.error(error);
    const problem = new Problem(500, "INTERNAL_ERROR", "Algo deu errado. Tente novamente.");
    reply.code(500).type("application/problem+json").send(problem.toBody(request.url));
  });

  app.setNotFoundHandler((request, reply) => {
    const problem = new Problem(404, "NOT_FOUND", `Rota ${request.method} ${request.url} não existe.`);
    reply.code(404).type("application/problem+json").send(problem.toBody(request.url));
  });
}

export const errorHandlerPlugin = fp(errorHandlerPluginImpl, { name: "error-handler" });
