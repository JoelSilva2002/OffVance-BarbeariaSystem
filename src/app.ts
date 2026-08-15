import Fastify from "fastify";
import sensible from "@fastify/sensible";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { env } from "./config/env.js";
import { resolveCorsOrigin } from "./config/cors.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { schedulingRoutes } from "./modules/scheduling/scheduling.routes.js";
import { appointmentsRoutes } from "./modules/appointments/appointments.routes.js";
import { barbersRoutes } from "./modules/barbers/barbers.routes.js";
import { catalogRoutes } from "./modules/catalog/catalog.routes.js";
import { webhookEndpointsRoutes } from "./modules/outbox/webhook-endpoints.routes.js";
import { eventsRoutes } from "./modules/outbox/events.routes.js";
import { notificationsRoutes } from "./modules/notifications/notifications.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { staffAuthRoutes } from "./modules/auth/staff-auth.routes.js";
import { meRoutes } from "./modules/portal/me.routes.js";
import { packagesRoutes } from "./modules/packages/packages.routes.js";
import { loyaltyRoutes } from "./modules/loyalty/loyalty.routes.js";
import { paymentsRoutes } from "./modules/payments/payments.routes.js";
import { productsRoutes } from "./modules/products/products.routes.js";
import { ordersRoutes } from "./modules/orders/orders.routes.js";
import { reviewsRoutes } from "./modules/reviews/reviews.routes.js";
import { reportsRoutes } from "./modules/reports/reports.routes.js";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
  });

  app.register(sensible);
  app.register(cors, { origin: resolveCorsOrigin(app.log) });
  app.register(jwt, { secret: env.JWT_SECRET });
  // global: false — só entra em vigor nas rotas que pedirem explicitamente
  // via `config.rateLimit` (hoje: login de equipe). Ver staff-auth.routes.ts.
  app.register(rateLimit, { global: false });
  app.register(errorHandlerPlugin);

  app.register(healthRoutes);
  app.register(barbersRoutes);
  app.register(catalogRoutes);
  app.register(schedulingRoutes);
  app.register(appointmentsRoutes);
  app.register(webhookEndpointsRoutes);
  app.register(eventsRoutes);
  app.register(notificationsRoutes);
  app.register(authRoutes);
  app.register(staffAuthRoutes);
  app.register(meRoutes);
  app.register(packagesRoutes);
  app.register(loyaltyRoutes);
  app.register(paymentsRoutes);
  app.register(productsRoutes);
  app.register(ordersRoutes);
  app.register(reviewsRoutes);
  app.register(reportsRoutes);

  return app;
}
