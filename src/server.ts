import closeWithGrace from "close-with-grace";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { cleanupExpiredRefreshTokens } from "./lib/refresh-tokens.js";
import { deliverPendingWebhooks, fanOutPendingEvents } from "./modules/outbox/dispatcher.js";
import { fireDueNotifications } from "./modules/notifications/notification-dispatcher.js";
import { sweepAutoConfirm } from "./modules/notifications/auto-confirm.js";
import { expireLoyaltyPoints } from "./modules/loyalty/loyalty.service.js";

const app = buildApp();

const DISPATCH_INTERVAL_MS = 5_000;
let dispatching = false;

const dispatchTimer = setInterval(async () => {
  if (dispatching) return; // não sobrepõe execuções se uma tick anterior ainda estiver rodando
  dispatching = true;
  try {
    await fireDueNotifications();
    await fanOutPendingEvents();
    await deliverPendingWebhooks();
    await sweepAutoConfirm();
  } catch (err) {
    app.log.error(err, "Falha no ciclo de background (notificações/webhooks/auto-confirmação)");
  } finally {
    dispatching = false;
  }
}, DISPATCH_INTERVAL_MS);

// Manutenção de baixo volume — expiração de pontos e limpeza de tokens não
// precisam da cadência de 5s do loop acima (nada ali é sensível a atraso de
// minutos); um intervalo próprio evita rodar essas duas toda hora à toa.
const MAINTENANCE_INTERVAL_MS = 60 * 60_000;
let maintaining = false;

const maintenanceTimer = setInterval(async () => {
  if (maintaining) return;
  maintaining = true;
  try {
    await expireLoyaltyPoints();
    await cleanupExpiredRefreshTokens();
  } catch (err) {
    app.log.error(err, "Falha no ciclo de manutenção (expiração de pontos/limpeza de refresh tokens)");
  } finally {
    maintaining = false;
  }
}, MAINTENANCE_INTERVAL_MS);

closeWithGrace(async ({ err }) => {
  if (err) app.log.error(err);
  clearInterval(dispatchTimer);
  clearInterval(maintenanceTimer);
  await app.close();
  await prisma.$disconnect();
});

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
