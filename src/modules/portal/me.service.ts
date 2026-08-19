import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { createAppointment } from "../appointments/appointments.service.js";
import { cancelAppointment, rescheduleAppointment } from "../appointments/lifecycle.service.js";
import type { CreateMyAppointmentInput, UpdateMeInput } from "./me.schema.js";

// select explícito, nunca `include: { user: true }` — o model User carrega
// passwordHash/failedLoginAttempts/lockedUntil, e isto é a resposta que o
// portal do cliente devolve direto pra tela de Perfil.
const SAFE_USER_SELECT = { id: true, phone: true, email: true } as const;

export async function getMe(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { user: { select: SAFE_USER_SELECT } },
  });
  if (!client) throw new Problem(404, "CLIENT_NOT_FOUND", "Cliente não encontrado.");
  return client;
}

export async function updateMe(clientId: string, input: UpdateMeInput) {
  const client = await getMe(clientId);

  if (input.email !== undefined) {
    try {
      await prisma.user.update({ where: { id: client.userId }, data: { email: input.email } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new Problem(409, "EMAIL_TAKEN", "Esse e-mail já está em uso.");
      }
      throw error;
    }
  }

  return prisma.client.update({
    where: { id: clientId },
    data: {
      fullName: input.fullName,
      birthDate: input.birthDate === undefined ? undefined : input.birthDate ? new Date(input.birthDate) : null,
      preferredBarberId: input.preferredBarberId,
      allergyNotes: input.allergyNotes,
      hairNotes: input.hairNotes,
    },
    include: { user: { select: SAFE_USER_SELECT } },
  });
}

export async function listMyAppointments(clientId: string, scope: "upcoming" | "past", limit: number) {
  const now = new Date();
  return prisma.appointment.findMany({
    where: { clientId, startsAt: scope === "upcoming" ? { gte: now } : { lt: now } },
    // `review` aditivo — é o que deixa o portal saber, sem N chamadas
    // extras, quais CONCLUIDO já foram avaliados (null = ainda não).
    include: { items: true, review: true },
    orderBy: { startsAt: scope === "upcoming" ? "asc" : "desc" },
    take: limit,
  });
}

export async function getMyLastAppointment(clientId: string) {
  return prisma.appointment.findFirst({
    where: { clientId, status: "CONCLUIDO" },
    include: { items: true, review: true },
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

  return createAppointment(
    {
      barberId: barberId!,
      clientId,
      serviceIds: serviceIds!,
      startsAt: input.startsAt,
      clientNotes,
    },
    "CLIENT",
    clientId,
  );
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
  return rescheduleAppointment(appointmentId, "CLIENT", clientId, input);
}
