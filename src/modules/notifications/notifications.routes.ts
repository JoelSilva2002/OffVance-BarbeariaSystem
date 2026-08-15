import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { requireStaffAuth, requireStaffOrApiKey } from "../../plugins/auth.js";
import { listNotificationsQuerySchema, reportDeliverySchema } from "./notifications.schema.js";

export async function notificationsRoutes(app: FastifyInstance) {
  // Listagem é ferramenta interna de ops — só staff.
  app.get("/notifications", { preHandler: requireStaffAuth }, async (request) => {
    const query = listNotificationsQuerySchema.parse(request.query);
    const notifications = await prisma.notification.findMany({
      where: { status: query.status, clientId: query.clientId },
      orderBy: { scheduledFor: "desc" },
      take: query.limit,
    });
    return { notifications };
  });

  // Callback do n8n (ou outro consumidor) reportando o resultado real da
  // entrega por WhatsApp/e-mail — o dispatcher só sabe que entregou ao
  // pipeline, não se o cliente de fato recebeu. Aceita sessão de equipe OU
  // API key com escopo notifications:write.
  app.patch<{ Params: { id: string } }>(
    "/notifications/:id",
    { preHandler: requireStaffOrApiKey("notifications:write") },
    async (request) => {
      const body = reportDeliverySchema.parse(request.body);
      const notification = await prisma.notification.findUnique({ where: { id: request.params.id } });
      if (!notification) throw new Problem(404, "NOTIFICATION_NOT_FOUND", "Notificação não encontrada.");
      if (notification.status !== "SENT") {
        throw new Problem(
          409,
          "NOTIFICATION_NOT_DISPATCHED",
          "Só é possível reportar entrega de uma notificação já enviada ao pipeline.",
        );
      }

      return prisma.notification.update({
        where: { id: request.params.id },
        data: {
          providerMessageId: body.providerMessageId ?? notification.providerMessageId,
          status: body.status ?? notification.status,
        },
      });
    },
  );
}
