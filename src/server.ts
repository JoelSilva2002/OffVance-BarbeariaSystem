import closeWithGrace from "close-with-grace";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { deliverPendingWebhooks, fanOutPendingEvents } from "./modules/outbox/dispatcher.js";

const app = buildApp();

const DISPATCH_INTERVAL_MS = 5_000;
let dispatching = false;

const dispatchTimer = setInterval(async () => {
  if (dispatching) return; // não sobrepõe execuções se uma tick anterior ainda estiver rodando
  dispatching = true;
  try {
    await fanOutPendingEvents();
    await deliverPendingWebhooks();
  } catch (err) {
    app.log.error(err, "Falha no dispatcher de webhooks");
  } finally {
    dispatching = false;
  }
}, DISPATCH_INTERVAL_MS);

closeWithGrace(async ({ err }) => {
  if (err) app.log.error(err);
  clearInterval(dispatchTimer);
  await app.close();
  await prisma.$disconnect();
});

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
