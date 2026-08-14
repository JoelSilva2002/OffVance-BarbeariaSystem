import type { FastifyInstance } from "fastify";
import { requireAdminAuth } from "../../plugins/auth.js";
import { appointmentsReportQuerySchema, revenueReportQuerySchema } from "./reports.schema.js";
import { getAppointmentsReport, getRevenueReport } from "./reports.service.js";

// Inteligência de negócio — ADMIN.
export async function reportsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAdminAuth);

  app.get("/reports/appointments", async (request) => {
    const query = appointmentsReportQuerySchema.parse(request.query);
    return getAppointmentsReport(query);
  });

  app.get("/reports/revenue", async (request) => {
    const query = revenueReportQuerySchema.parse(request.query);
    return getRevenueReport(query);
  });
}
