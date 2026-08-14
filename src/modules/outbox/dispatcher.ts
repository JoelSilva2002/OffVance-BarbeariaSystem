import { prisma } from "../../lib/prisma.js";
import { signWebhookPayload } from "../../lib/webhook-signature.js";

/** 1min, 5min, 30min, 2h, 6h (docs/ARQUITETURA.md §02, "Integração com n8n"). */
const BACKOFF_SECONDS = [60, 300, 1_800, 7_200, 21_600];
const MAX_CONSECUTIVE_FAILURES = 5;
const FAN_OUT_BATCH = 50;
const DELIVERY_BATCH = 20;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Passo 1: para cada outbox_event ainda não processado, cria uma
 * webhook_delivery para cada endpoint ativo inscrito naquele tipo de
 * evento, e marca o evento como publicado. "Publicado" aqui significa
 * "o sistema decidiu quem precisa receber isso" — sucesso/falha de cada
 * entrega é rastreado à parte em webhook_deliveries.
 */
export async function fanOutPendingEvents(): Promise<number> {
  const events = await prisma.outboxEvent.findMany({
    where: { publishedAt: null },
    orderBy: { occurredAt: "asc" },
    take: FAN_OUT_BATCH,
  });

  for (const event of events) {
    await prisma.$transaction(async (tx) => {
      const endpoints = await tx.webhookEndpoint.findMany({
        where: { active: true, subscribedEvents: { has: event.eventType } },
      });

      if (endpoints.length > 0) {
        await tx.webhookDelivery.createMany({
          data: endpoints.map((endpoint) => ({
            outboxEventId: event.id,
            webhookEndpointId: endpoint.id,
            status: "PENDING" as const,
            nextRetryAt: new Date(),
          })),
        });
      }

      await tx.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
    });
  }

  return events.length;
}

async function attemptDelivery(url: string, body: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { ok: res.ok, responseCode: res.status };
  } catch {
    return { ok: false, responseCode: null as number | null };
  }
}

/**
 * Passo 2: tenta entregar as webhook_deliveries pendentes cujo
 * next_retry_at já chegou. Backoff exponencial em falha; após esgotar as
 * tentativas, ABANDONED — e o endpoint some das entregas futuras depois de
 * MAX_CONSECUTIVE_FAILURES entregas abandonadas seguidas.
 */
export async function deliverPendingWebhooks() {
  const deliveries = await prisma.webhookDelivery.findMany({
    where: { status: "PENDING", nextRetryAt: { lte: new Date() } },
    include: { outboxEvent: true, webhookEndpoint: true },
    take: DELIVERY_BATCH,
  });

  let succeeded = 0;
  let retried = 0;
  let abandoned = 0;

  for (const delivery of deliveries) {
    const { outboxEvent, webhookEndpoint } = delivery;
    const body = JSON.stringify({
      id: outboxEvent.id,
      type: outboxEvent.eventType,
      occurredAt: outboxEvent.occurredAt.toISOString(),
      data: outboxEvent.payload,
    });
    const timestamp = Date.now().toString();
    const signature = signWebhookPayload(webhookEndpoint.secret, timestamp, body);

    const { ok, responseCode } = await attemptDelivery(webhookEndpoint.url, body, {
      "Content-Type": "application/json",
      "X-Prisma-Event": outboxEvent.eventType,
      "X-Prisma-Delivery": delivery.id,
      "X-Prisma-Timestamp": timestamp,
      "X-Prisma-Signature": signature,
    });

    const attempts = delivery.attempts + 1;

    if (ok) {
      await prisma.$transaction([
        prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "SUCCEEDED", responseCode, attempts, lastAttemptAt: new Date() },
        }),
        prisma.webhookEndpoint.update({ where: { id: webhookEndpoint.id }, data: { consecutiveFailures: 0 } }),
      ]);
      succeeded++;
      continue;
    }

    if (attempts >= BACKOFF_SECONDS.length) {
      const newFailures = webhookEndpoint.consecutiveFailures + 1;
      const shouldDeactivate = newFailures >= MAX_CONSECUTIVE_FAILURES;
      await prisma.$transaction([
        prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { status: "ABANDONED", responseCode, attempts, lastAttemptAt: new Date() },
        }),
        prisma.webhookEndpoint.update({
          where: { id: webhookEndpoint.id },
          data: { consecutiveFailures: newFailures, active: shouldDeactivate ? false : undefined },
        }),
      ]);
      abandoned++;
    } else {
      const delaySec = BACKOFF_SECONDS[attempts - 1]!;
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          responseCode,
          attempts,
          lastAttemptAt: new Date(),
          nextRetryAt: new Date(Date.now() + delaySec * 1000),
        },
      });
      retried++;
    }
  }

  return { attempted: deliveries.length, succeeded, retried, abandoned };
}
