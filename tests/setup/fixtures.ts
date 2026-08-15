import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma.js";
import { hashPassword } from "../../src/lib/password.js";

let counter = 0;
/**
 * Sufixo curto, numérico e único por chamada — nunca reseta entre testes
 * (só o banco reseta), então garante não-colisão de telefone/e-mail mesmo
 * criando várias fixtures no mesmo teste.
 */
function unique(): string {
  counter += 1;
  return String(counter).padStart(6, "0");
}

export async function seedShopSettings(overrides: Partial<{ minLeadTimeMin: number; cancelDeadlineHours: number }> = {}) {
  return prisma.shopSettings.upsert({
    where: { shopId: "default" },
    update: overrides,
    create: {
      shopId: "default",
      timezone: "America/Sao_Paulo",
      slotStepMin: 15,
      minLeadTimeMin: overrides.minLeadTimeMin ?? 60,
      maxAdvanceDays: 60,
      cancelDeadlineHours: overrides.cancelDeadlineHours ?? 2,
      rescheduleDeadlineHours: 2,
      autoConfirmHoursBefore: 24,
    },
  });
}

export async function createAdmin(opts: { password?: string } = {}) {
  const id = unique();
  const password = opts.password ?? "senha12345";
  const user = await prisma.user.create({
    data: {
      email: `admin-${id}@test.dev`,
      phone: `+5511900${id.padStart(6, "0")}`.slice(0, 20),
      passwordHash: hashPassword(password),
      role: "ADMIN",
      status: "ACTIVE",
    },
  });
  return { user, password };
}

/** Barbeiro com grade seg-sex 09:00-12:00 + 13:30-19:00 (o buraco é o almoço) — igual ao seed de dev. */
export async function createBarberWithSchedule(opts: { password?: string; displayName?: string } = {}) {
  const id = unique();
  const password = opts.password ?? "senha12345";
  const user = await prisma.user.create({
    data: {
      email: `barber-${id}@test.dev`,
      phone: `+5511901${id.padStart(6, "0")}`.slice(0, 20),
      passwordHash: hashPassword(password),
      role: "BARBER",
      status: "ACTIVE",
    },
  });
  const barber = await prisma.barber.create({
    data: { userId: user.id, displayName: opts.displayName ?? `Barbeiro ${id}`, status: "ACTIVE" },
  });

  for (const weekday of [1, 2, 3, 4, 5]) {
    await prisma.workSchedule.create({
      data: {
        barberId: barber.id,
        weekday,
        startTime: new Date("1970-01-01T09:00:00Z"),
        endTime: new Date("1970-01-01T12:00:00Z"),
      },
    });
    await prisma.workSchedule.create({
      data: {
        barberId: barber.id,
        weekday,
        startTime: new Date("1970-01-01T13:30:00Z"),
        endTime: new Date("1970-01-01T19:00:00Z"),
      },
    });
  }

  return { user, barber, password };
}

export async function createService(overrides: Partial<{ durationMin: number; bufferAfterMin: number; priceCents: number; name: string }> = {}) {
  const id = unique();
  const category = await prisma.serviceCategory.upsert({
    where: { id: "cat_test" },
    update: {},
    create: { id: "cat_test", name: "Categoria de teste" },
  });
  return prisma.service.create({
    data: {
      categoryId: category.id,
      name: overrides.name ?? `Serviço ${id}`,
      durationMin: overrides.durationMin ?? 30,
      bufferAfterMin: overrides.bufferAfterMin ?? 5,
      priceCents: overrides.priceCents ?? 5000,
      active: true,
      onlineBookable: true,
    },
  });
}

export async function enableBarberService(barberId: string, serviceId: string) {
  return prisma.barberService.create({ data: { barberId, serviceId } });
}

/** Barbeiro + serviço já habilitado + grade — o par que a maioria dos testes de agenda precisa. */
export async function createBarberWithService(serviceOverrides: Parameters<typeof createService>[0] = {}) {
  const { user, barber, password } = await createBarberWithSchedule();
  const service = await createService(serviceOverrides);
  await enableBarberService(barber.id, service.id);
  return { user, barber, service, password };
}

export async function createClientUser(overrides: Partial<{ fullName: string; email: string }> = {}) {
  const id = unique();
  const user = await prisma.user.create({
    data: {
      phone: `+5511902${id.padStart(6, "0")}`.slice(0, 20),
      email: overrides.email,
      role: "CLIENT",
      status: "ACTIVE",
    },
  });
  const client = await prisma.client.create({
    data: { userId: user.id, fullName: overrides.fullName ?? `Cliente ${id}` },
  });
  return { user, client };
}

export async function staffLogin(app: FastifyInstance, email: string, password: string) {
  const res = await app.inject({ method: "POST", url: "/auth/staff/login", payload: { email, password } });
  if (res.statusCode !== 200) {
    throw new Error(`staffLogin falhou (${res.statusCode}): ${res.body}`);
  }
  return res.json() as { accessToken: string; refreshToken: string; role: string; barberId?: string };
}

/** Cria uma API key com os escopos dados — precisa de um accessToken de ADMIN. */
export async function createApiKey(app: FastifyInstance, adminAccessToken: string, scopes: string[]) {
  const res = await app.inject({
    method: "POST",
    url: "/api-keys",
    headers: { authorization: `Bearer ${adminAccessToken}` },
    payload: { name: `chave de teste (${scopes.join(",")})`, scopes },
  });
  if (res.statusCode !== 201) {
    throw new Error(`createApiKey falhou (${res.statusCode}): ${res.body}`);
  }
  return res.json() as { id: string; key: string; scopes: string[] };
}

/** Fluxo OTP completo (pede código, lê do banco, verifica) — sessão de CLIENTE de verdade, não simulada. */
export async function clientLogin(app: FastifyInstance, phone: string) {
  const requestRes = await app.inject({ method: "POST", url: "/auth/otp/request", payload: { phone } });
  if (requestRes.statusCode !== 202) {
    throw new Error(`otp/request falhou (${requestRes.statusCode}): ${requestRes.body}`);
  }

  const otp = await prisma.otpCode.findFirst({ where: { phone, consumedAt: null }, orderBy: { createdAt: "desc" } });
  if (!otp) throw new Error("OTP não encontrado no banco após /auth/otp/request");

  const verifyRes = await app.inject({ method: "POST", url: "/auth/otp/verify", payload: { phone, code: otp.code } });
  if (verifyRes.statusCode !== 200) {
    throw new Error(`otp/verify falhou (${verifyRes.statusCode}): ${verifyRes.body}`);
  }
  return verifyRes.json() as { accessToken: string; refreshToken: string; client: { id: string } };
}
