import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { createAppointment } from "../appointments/appointments.service.js";
import { cancelAppointment, rescheduleAppointment } from "../appointments/lifecycle.service.js";
import type { CreateMyAppointmentInput, UpdateMeInput } from "./me.schema.js";

export async function getMe(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, include: { user: true } });
  if (!client) throw new Problem(404, "CLIENT_NOT_FOUND", "Cliente não encontrado.");
  return client;
}

export async function updateMe(clientId: string, input: UpdateMeInput) {
  await getMe(clientId);
  return prisma.client.update({
    where: { id: clientId },
    data: {
      fullName: input.fullName,
      birthDate: input.birthDate === undefined ? undefined : input.birthDate ? new Date(input.birthDate) : null,
      preferredBarberId: input.preferredBarberId,
      allergyNotes: input.allergyNotes,
      hairNotes: input.hairNotes,
    },
  });
}

export async function listMyAppointments(clientId: string, scope: "upcoming" | "past", limit: number) {
  const now = new Date();
  return prisma.appointment.findMany({
    where: { clientId, startsAt: scope === "upcoming" ? { gte: now } : { lt: now } },
    include: { items: true },
    orderBy: { startsAt: scope === "upcoming" ? "asc" : "desc" },
    take: limit,
  });
}

export async function getMyLastAppointment(clientId: string) {
  return prisma.appointment.findFirst({
    where: { clientId, status: "CONCLUIDO" },
    include: { items: true },
    orderBy: { startsAt: "desc" },
  });
}

async function assertOwnAppointment(clientId: string, appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment || appointment.clientId !== clientId) {
    throw new Problem(404, "APPOINTMENT_NOT_FOUND", "Agendamento não encontrado.");
  }
  return appointment;
}

/**
 * "Repetir serviço anterior com 1 clique" (docs/ARQUITETURA.md §02): copia
 * barbeiro/serviços/observações do último atendimento concluído — o cliente
 * só escolhe o novo horário. Se o barbeiro saiu ou o serviço não existe
 * mais, `createAppointment` recusa naturalmente (BARBER_INACTIVE /
 * BARBER_NOT_QUALIFIED) em vez de agendar algo diferente do esperado.
 */
export async function createMyAppointment(clientId: string, input: CreateMyAppointmentInput) {
  let barberId = input.barberId;
  let serviceIds = input.serviceIds;
  let clientNotes = input.clientNotes;

  if (input.repeatOf) {
    const source = await prisma.appointment.findUnique({ where: { id: input.repeatOf }, include: { items: true } });
    if (!source || source.clientId !== clientId || source.status !== "CONCLUIDO") {
      throw new Problem(404, "REPEAT_SOURCE_NOT_FOUND", "Atendimento anterior não encontrado.");
    }
    barberId = barberId ?? source.barberId;
    serviceIds = serviceIds ?? source.items.map((i) => i.serviceId);
    clientNotes = clientNotes ?? source.clientNotes ?? undefined;
  }

  return createAppointment({
    barberId: barberId!,
    clientId,
    serviceIds: serviceIds!,
    startsAt: input.startsAt,
    clientNotes,
  });
}

export async function cancelMyAppointment(clientId: string, appointmentId: string, reason?: string) {
  await assertOwnAppointment(clientId, appointmentId);
  return cancelAppointment(appointmentId, "CLIENT", clientId, reason);
}

export async function rescheduleMyAppointment(
  clientId: string,
  appointmentId: string,
  input: { startsAt: string; barberId?: string },
) {
  await assertOwnAppointment(clientId, appointmentId);
  return rescheduleAppointment(appointmentId, { ...input, actorType: "CLIENT", actorId: clientId });
}
