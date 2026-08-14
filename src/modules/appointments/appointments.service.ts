import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { isFullyContained, subtract } from "../../lib/interval.js";
import { getShopSettings } from "../scheduling/shop-settings.service.js";
import {
  getBusyIntervals,
  getWorkingBlocks,
  resolveServiceSelection,
} from "../scheduling/availability.service.js";
import { generateAppointmentCode } from "./appointment-code.js";
import type { CreateAppointmentInput } from "./appointments.schema.js";

const EXCLUSION_CONSTRAINT = "appointments_sem_sobreposicao";

/**
 * Detecta a violação da constraint de exclusão (camada 3) independente de
 * qual classe de erro o Prisma usar para embrulhar o erro do Postgres —
 * ele não tem um código dedicado para EXCLUDE, então checamos a mensagem
 * crua (SQLSTATE 23P01 ou o nome da constraint).
 */
function isExclusionViolation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("23P01") || error.message.includes(EXCLUSION_CONSTRAINT);
}

const MAX_CODE_RETRIES = 3;

/**
 * Camada 2 do desenho de concorrência (docs/ARQUITETURA.md, seção 03):
 * transação com advisory lock por barbeiro+dia, que revalida tudo a partir
 * do banco (nunca do payload). A camada 3 — a constraint de exclusão — é o
 * que garante correção mesmo se esta função tiver um bug.
 */
export async function createAppointment(input: CreateAppointmentInput) {
  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    throw new Problem(422, "INVALID_DATE", "`startsAt` inválido.");
  }

  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    try {
      return await attemptCreate(input, startsAt);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        continue; // colisão de `code` — tenta de novo com um código novo
      }
      throw error;
    }
  }

  throw new Problem(500, "CODE_GENERATION_FAILED", "Não foi possível gerar um código único. Tente novamente.");
}

async function attemptCreate(input: CreateAppointmentInput, startsAt: Date) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const settings = await getShopSettings(tx);
        const tz = settings.timezone;

        // 1. serializa concorrentes no mesmo barbeiro/dia local
        const localDate = DateTime.fromJSDate(startsAt, { zone: "utc" }).setZone(tz).toISODate()!;
        const lockKey = `${input.barberId}:${localDate}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const barber = await tx.barber.findUnique({ where: { id: input.barberId } });
        if (!barber) throw new Problem(404, "BARBER_NOT_FOUND", "Barbeiro não encontrado.");
        if (barber.status !== "ACTIVE") {
          throw new Problem(422, "BARBER_INACTIVE", "Este barbeiro não está mais atendendo.");
        }

        const client = await tx.client.findUnique({ where: { id: input.clientId } });
        if (!client) throw new Problem(404, "CLIENT_NOT_FOUND", "Cliente não encontrado.");

        // 2. duração e preço vêm do banco, nunca do payload
        const selection = await resolveServiceSelection(tx, input.barberId, input.serviceIds);
        const endsAt = new Date(startsAt.getTime() + selection.totalDurationMin * 60_000);
        const serviceEndsAt = new Date(startsAt.getTime() + selection.serviceDurationMin * 60_000);

        const now = Date.now();
        if (startsAt.getTime() < now + settings.minLeadTimeMin * 60_000) {
          throw new Problem(
            422,
            "LEAD_TIME_TOO_SHORT",
            `É preciso agendar com ao menos ${settings.minLeadTimeMin} minutos de antecedência.`,
          );
        }
        if (startsAt.getTime() > now + settings.maxAdvanceDays * 24 * 60 * 60_000) {
          throw new Problem(
            422,
            "TOO_FAR_IN_ADVANCE",
            `Não é possível agendar com mais de ${settings.maxAdvanceDays} dias de antecedência.`,
          );
        }

        // 3. revalida o slot com o estado atual (grade + ocupação)
        const target = { start: startsAt.getTime(), end: endsAt.getTime() };
        const working = await getWorkingBlocks(tx, input.barberId, localDate, tz);
        if (!isFullyContained(target, working)) {
          throw new Problem(422, "OUTSIDE_WORKING_HOURS", "Esse horário está fora do expediente do barbeiro.");
        }
        const busy = await getBusyIntervals(tx, input.barberId, localDate, tz);
        const free = subtract(working, busy);
        if (!isFullyContained(target, free)) {
          throw new Problem(409, "SLOT_TAKEN", "Esse horário acabou de ser preenchido. Escolha outro.");
        }

        // 4. grava agendamento + itens — tudo ou nada
        const appointment = await tx.appointment.create({
          data: {
            code: generateAppointmentCode(),
            kind: "SERVICE",
            clientId: input.clientId,
            barberId: input.barberId,
            startsAt,
            endsAt,
            serviceEndsAt,
            status: "AGENDADO",
            totalPriceCents: selection.totalPriceCents,
            clientNotes: input.clientNotes,
            source: "API",
            items: {
              create: selection.items.map((item, position) => ({
                serviceId: item.serviceId,
                nameSnapshot: item.nameSnapshot,
                durationMin: item.durationMin,
                priceCents: item.priceCents,
                position,
              })),
            },
          },
          include: { items: true },
        });

        // outbox_events / notifications entram na fase 3 (ciclo de vida)

        return appointment;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
    );
  } catch (error) {
    if (isExclusionViolation(error)) {
      throw new Problem(409, "SLOT_TAKEN", "Esse horário acabou de ser preenchido. Escolha outro.");
    }
    throw error;
  }
}
