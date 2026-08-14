import type { FastifyInstance } from "fastify";
import { appointmentsReportQuerySchema, revenueReportQuerySchema } from "./reports.schema.js";
import { getAppointmentsReport, getRevenueReport } from "./reports.service.js";

export async function reportsRoutes(app: FastifyInstance) {
  app.get("/reports/appointments", async (request) => {
    const query = appointmentsReportQuerySchema.parse(request.query);
    return getAppointmentsReport(query);
  });

  app.get("/reports/revenue", async (request) => {
    const query = revenueReportQuerySchema.parse(request.query);
    return getRevenueReport(query);
  });
}
