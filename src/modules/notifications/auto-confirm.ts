import { prisma } from "../../lib/prisma.js";
import { confirmAppointment } from "../appointments/lifecycle.service.js";

/**
 * "Se ninguém responder, o sistema confirma sozinho" (docs/ARQUITETURA.md
 * §02). O lembrete sai em T-autoConfirmHoursBefore; esta varredura é a
 * "última chamada" antes do horário: se ainda estiver AGENDADO a menos de
 * GRACE_MINUTES do início, silêncio vira confirmação (não cancelamento) —
 * cancelar por falta de resposta libera a cadeira mas deixa cliente
 * irritado na porta.
 */
const GRACE_MINUTES = 60;

export async function sweepAutoConfirm(): Promise<number> {
  const cutoff = new Date(Date.now() + GRACE_MINUTES * 60_000);

  const candidates = await prisma.appointment.findMany({
    where: { status: "AGENDADO", startsAt: { lte: cutoff, gt: new Date() } },
    select: { id: true },
    take: 50,
  });

  for (const candidate of candidates) {
    try {
      await confirmAppointment(candidate.id, "SYSTEM");
    } catch {
      // corrida com outra transição concorrente (ex.: cliente cancelou
      // nesse meio-tempo) — não é um erro do sweep, só segue para o próximo.
    }
  }

  return candidates.length;
}
