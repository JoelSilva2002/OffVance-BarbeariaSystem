import Fastify from "fastify";
import sensible from "@fastify/sensible";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { schedulingRoutes } from "./modules/scheduling/scheduling.routes.js";
import { appointmentsRoutes } from "./modules/appointments/appointments.routes.js";
import { barbersRoutes } from "./modules/barbers/barbers.routes.js";
import { catalogRoutes } from "./modules/catalog/catalog.routes.js";
import { webhookEndpointsRoutes } from "./modules/outbox/webhook-endpoints.routes.js";
import { eventsRoutes } from "./modules/outbox/events.routes.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
  });

  app.register(sensible);
  app.register(cors, { origin: true });
  app.register(errorHandlerPlugin);

  app.register(healthRoutes);
  app.register(barbersRoutes);
  app.register(catalogRoutes);
  app.register(schedulingRoutes);
  app.register(appointmentsRoutes);
  app.register(webhookEndpointsRoutes);
  app.register(eventsRoutes);

  // Portal do cliente e financeiro/loja entram nas próximas fases — ver
  // docs/ARQUITETURA.md seção 04.

  return app;
}
