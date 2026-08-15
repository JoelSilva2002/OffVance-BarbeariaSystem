import type { FastifyInstance } from "fastify";
import { requireAdminOrApiKey } from "../../plugins/auth.js";
import { appointmentsReportQuerySchema, revenueReportQuerySchema } from "./reports.schema.js";
import { getAppointmentsReport, getRevenueReport } from "./reports.service.js";

// Inteligência de negócio — ADMIN (ou API key com financeiro:read, pra um
// dashboard externo puxar os números sem sessão humana; BARBER continua
// de fora dos dois jeitos).
export async function reportsRoutes(app: FastifyInstance) {
  app.get(
    "/reports/appointments",
    { preHandler: requireAdminOrApiKey("financeiro:read") },
    async (request) => {
      const query = appointmentsReportQuerySchema.parse(request.query);
      return getAppointmentsReport(query);
    },
  );

  app.get("/reports/revenue", { preHandler: requireAdminOrApiKey("financeiro:read") }, async (request) => {
    const query = revenueReportQuerySchema.parse(request.query);
    return getRevenueReport(query);
  });
}
