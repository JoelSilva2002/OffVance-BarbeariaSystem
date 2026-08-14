import { randomBytes } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import type { CreateWebhookEndpointInput, UpdateWebhookEndpointInput } from "./webhook-endpoints.schema.js";

function maskSecret(secret: string): string {
  return `whsec_${"•".repeat(8)}${secret.slice(-4)}`;
}

function serialize<T extends { secret: string }>(endpoint: T) {
  const { secret, ...rest } = endpoint;
  return { ...rest, secretPreview: maskSecret(secret) };
}

export async function listWebhookEndpoints() {
  const endpoints = await prisma.webhookEndpoint.findMany({ orderBy: { createdAt: "desc" } });
  return endpoints.map(serialize);
}

/** O segredo só aparece por inteiro nesta resposta — guarde agora, ele não volta a aparecer. */
export async function createWebhookEndpoint(input: CreateWebhookEndpointInput) {
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const endpoint = await prisma.webhookEndpoint.create({
    data: { url: input.url, subscribedEvents: input.subscribedEvents, secret, active: true },
  });
  return endpoint; // com secret completo, de propósito — única vez que aparece
}

export async function updateWebhookEndpoint(id: string, input: UpdateWebhookEndpointInput) {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint) throw new Problem(404, "WEBHOOK_ENDPOINT_NOT_FOUND", "Endpoint de webhook não encontrado.");

  const updated = await prisma.webhookEndpoint.update({
    where: { id },
    data: {
      url: input.url,
      subscribedEvents: input.subscribedEvents,
      active: input.active,
      // reativar manualmente zera o contador de falhas — dá uma nova chance
      consecutiveFailures: input.active === true ? 0 : undefined,
    },
  });
  return serialize(updated);
}

export async function deleteWebhookEndpoint(id: string) {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!endpoint) throw new Problem(404, "WEBHOOK_ENDPOINT_NOT_FOUND", "Endpoint de webhook não encontrado.");
  await prisma.webhookEndpoint.delete({ where: { id } });
}

export async function getWebhookDeliveries(endpointId: string, limit: number) {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id: endpointId } });
  if (!endpoint) throw new Problem(404, "WEBHOOK_ENDPOINT_NOT_FOUND", "Endpoint de webhook não encontrado.");

  return prisma.webhookDelivery.findMany({
    where: { webhookEndpointId: endpointId },
    include: { outboxEvent: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
