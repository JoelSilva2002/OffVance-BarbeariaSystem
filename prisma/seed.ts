/**
 * Dados de exemplo para exercitar o motor de agenda de ponta a ponta.
 * CRUDs de barbeiro/serviço ainda não existem (fase 1) — este seed é o
 * jeito de ter dados reais para testar disponibilidade e reserva.
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";

const prisma = new PrismaClient();

// Só para dev/teste local — nunca use senha fixa em produção.
const DEV_PASSWORD = "trocar123";

async function main() {
  await prisma.shopSettings.upsert({
    where: { shopId: "default" },
    update: {},
    create: {
      shopId: "default",
      timezone: "America/Sao_Paulo",
      slotStepMin: 15,
      minLeadTimeMin: 60,
      maxAdvanceDays: 60,
      cancelDeadlineHours: 2,
      rescheduleDeadlineHours: 2,
      autoConfirmHoursBefore: 24,
    },
  });

  const category = await prisma.serviceCategory.upsert({
    where: { id: "cat_cortes" },
    update: {},
    create: { id: "cat_cortes", name: "Cortes e barba", position: 0 },
  });

  const corte = await prisma.service.upsert({
    where: { id: "svc_corte" },
    update: {},
    create: {
      id: "svc_corte",
      categoryId: category.id,
      name: "Corte de cabelo",
      durationMin: 30,
      bufferAfterMin: 5,
      priceCents: 5000,
      active: true,
      onlineBookable: true,
    },
  });

  const barba = await prisma.service.upsert({
    where: { id: "svc_barba" },
    update: {},
    create: {
      id: "svc_barba",
      categoryId: category.id,
      name: "Barba",
      durationMin: 20,
      bufferAfterMin: 5,
      priceCents: 3500,
      active: true,
      onlineBookable: true,
    },
  });

  const userJoao = await prisma.user.upsert({
    where: { id: "usr_barber_joao" },
    update: { email: "joao@barbearia.dev", passwordHash: hashPassword(DEV_PASSWORD) },
    create: {
      id: "usr_barber_joao",
      phone: "+5511999990001",
      email: "joao@barbearia.dev",
      passwordHash: hashPassword(DEV_PASSWORD),
      role: "BARBER",
      status: "ACTIVE",
    },
  });

  const joao = await prisma.barber.upsert({
    where: { id: "brb_joao" },
    update: {},
    create: {
      id: "brb_joao",
      userId: userJoao.id,
      displayName: "João",
      status: "ACTIVE",
    },
  });

  await prisma.barberService.upsert({
    where: { barberId_serviceId: { barberId: joao.id, serviceId: corte.id } },
    update: {},
    create: { barberId: joao.id, serviceId: corte.id },
  });
  await prisma.barberService.upsert({
    where: { barberId_serviceId: { barberId: joao.id, serviceId: barba.id } },
    update: {},
    create: { barberId: joao.id, serviceId: barba.id },
  });

  // Segunda a sexta, 09:00-12:00 e 13:30-19:00 (o intervalo é a ausência de linha)
  const weekdays = [1, 2, 3, 4, 5];
  for (const weekday of weekdays) {
    await prisma.workSchedule.upsert({
      where: { id: `ws_joao_${weekday}_manha` },
      update: {},
      create: {
        id: `ws_joao_${weekday}_manha`,
        barberId: joao.id,
        weekday,
        startTime: new Date("1970-01-01T09:00:00Z"),
        endTime: new Date("1970-01-01T12:00:00Z"),
      },
    });
    await prisma.workSchedule.upsert({
      where: { id: `ws_joao_${weekday}_tarde` },
      update: {},
      create: {
        id: `ws_joao_${weekday}_tarde`,
        barberId: joao.id,
        weekday,
        startTime: new Date("1970-01-01T13:30:00Z"),
        endTime: new Date("1970-01-01T19:00:00Z"),
      },
    });
  }

  const userMaria = await prisma.user.upsert({
    where: { id: "usr_client_maria" },
    update: {},
    create: { id: "usr_client_maria", phone: "+5511999990099", role: "CLIENT", status: "ACTIVE" },
  });

  await prisma.client.upsert({
    where: { id: "cli_maria" },
    update: {},
    create: { id: "cli_maria", userId: userMaria.id, fullName: "Maria Silva" },
  });

  await prisma.user.upsert({
    where: { id: "usr_admin_dono" },
    update: {},
    create: {
      id: "usr_admin_dono",
      phone: "+5511999990002",
      email: "dono@barbearia.dev",
      passwordHash: hashPassword(DEV_PASSWORD),
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  console.log("Seed concluído: 1 barbeiro (João), 2 serviços, 1 cliente (Maria), 1 admin (dono).");
  console.log(`Login de equipe (dev): dono@barbearia.dev / joao@barbearia.dev — senha "${DEV_PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
