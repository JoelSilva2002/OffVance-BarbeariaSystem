import closeWithGrace from "close-with-grace";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

const app = buildApp();

closeWithGrace(async ({ err }) => {
  if (err) app.log.error(err);
  await app.close();
  await prisma.$disconnect();
});

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
