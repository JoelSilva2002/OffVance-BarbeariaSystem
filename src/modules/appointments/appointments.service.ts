import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { getShopSettings } from "../scheduling/shop-settings.service.js";
import { generateAppointmentCode } from "./appointment-code.js";
import { isExclusionViolation, lockBarberDay } from "./concurrency.js";
import { validateSlot } from "./slot-validation.js";
import type { CreateAppointmentInput } from "./appointments.schema.js";

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
        const localDate = DateTime.fromJSDate(startsAt, { zone: "utc" }).setZone(settings.timezone).toISODate()!;
        await lockBarberDay(tx, input.barberId, localDate);

        const client = await tx.client.findUnique({ where: { id: input.clientId } });
        if (!client) throw new Problem(404, "CLIENT_NOT_FOUND", "Cliente não encontrado.");

        const { selection, endsAt, serviceEndsAt } = await validateSlot(
          tx,
          settings,
          input.barberId,
          input.serviceIds,
          startsAt,
        );

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

        await tx.appointmentStatusHistory.create({
          data: {
            appointmentId: appointment.id,
            fromStatus: null,
            toStatus: "AGENDADO",
            actorType: "API",
            reason: "Criado",
          },
        });

        // outbox_events / notificações agendadas entram numa fase seguinte

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
