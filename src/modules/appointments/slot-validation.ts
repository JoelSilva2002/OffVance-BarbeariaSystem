import { DateTime } from "luxon";
import type { Prisma } from "@prisma/client";
import { Problem } from "../../lib/problem.js";
import { isFullyContained, subtract } from "../../lib/interval.js";
import {
  getBusyIntervals,
  getWorkingBlocks,
  resolveServiceSelection,
  type ResolvedSelection,
} from "../scheduling/availability.service.js";
import type { getShopSettings } from "../scheduling/shop-settings.service.js";

type TxClient = Prisma.TransactionClient;
type ShopSettings = Awaited<ReturnType<typeof getShopSettings>>;

export interface SlotValidationResult {
  selection: ResolvedSelection;
  endsAt: Date;
  serviceEndsAt: Date;
  localDate: string;
}

/**
 * Validação de slot compartilhada entre criação e remarcação (camada 2,
 * docs/ARQUITETURA.md §03): duração/preço sempre lidos do banco, prazos de
 * antecedência, e revalidação de grade + ocupação com o estado atual.
 * `excludeAppointmentId` evita que uma remarcação colida "consigo mesma".
 */
export async function validateSlot(
  tx: TxClient,
  settings: ShopSettings,
  barberId: string,
  serviceIds: string[],
  startsAt: Date,
  excludeAppointmentId?: string,
): Promise<SlotValidationResult> {
  const tz = settings.timezone;
  const localDate = DateTime.fromJSDate(startsAt, { zone: "utc" }).setZone(tz).toISODate()!;

  const barber = await tx.barber.findUnique({ where: { id: barberId } });
  if (!barber) throw new Problem(404, "BARBER_NOT_FOUND", "Barbeiro não encontrado.");
  if (barber.status !== "ACTIVE") {
    throw new Problem(422, "BARBER_INACTIVE", "Este barbeiro não está mais atendendo.");
  }

  const selection = await resolveServiceSelection(tx, barberId, serviceIds);
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

  const target = { start: startsAt.getTime(), end: endsAt.getTime() };
  const working = await getWorkingBlocks(tx, barberId, localDate, tz);
  if (!isFullyContained(target, working)) {
    throw new Problem(422, "OUTSIDE_WORKING_HOURS", "Esse horário está fora do expediente do barbeiro.");
  }
  const busy = await getBusyIntervals(tx, barberId, localDate, tz, excludeAppointmentId);
  const free = subtract(working, busy);
  if (!isFullyContained(target, free)) {
    throw new Problem(409, "SLOT_TAKEN", "Esse horário acabou de ser preenchido. Escolha outro.");
  }

  return { selection, endsAt, serviceEndsAt, localDate };
}
