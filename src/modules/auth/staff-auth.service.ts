import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { revokeRefreshToken, rotateRefreshToken as rotateToken } from "../../lib/refresh-tokens.js";
import type { CreateAdminInput, UpdateAdminInput } from "./staff-auth.schema.js";

export { issueRefreshToken, revokeRefreshToken } from "../../lib/refresh-tokens.js";

interface StaffSession {
  userId: string;
  role: "ADMIN" | "BARBER";
  barberId?: string;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Bloqueio de conta — camada complementar ao rate limit por IP (registrado
 * na rota): o limite por IP para um ataque rápido de um único lugar; isto
 * aqui para um ataque lento ou distribuído mirando UMA conta específica.
 * Conta bloqueada nem chega a rodar scrypt na senha — 401 direto, sem
 * gastar CPU tentando validar algo que já sabemos que vai falhar.
 */
export async function staffLogin(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email }, include: { barber: true } });

  // mensagem idêntica para "não existe" e "senha errada" — não dar pista de qual delas é
  if (!user || !user.passwordHash || (user.role !== "ADMIN" && user.role !== "BARBER")) {
    throw new Problem(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
  }
  if (user.status !== "ACTIVE") {
    throw new Problem(403, "ACCOUNT_INACTIVE", "Esta conta está inativa.");
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new Problem(
      429,
      "ACCOUNT_LOCKED",
      `Muitas tentativas com senha errada. Tente de novo em ${minutesLeft} min.`,
    );
  }

  if (!verifyPassword(password, user.passwordHash)) {
    const attempts = user.failedLoginAttempts + 1;
    const lockingOut = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lockingOut ? 0 : attempts,
        lockedUntil: lockingOut ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });
    if (lockingOut) {
      throw new Problem(
        429,
        "ACCOUNT_LOCKED",
        `Muitas tentativas com senha errada. Tente de novo em ${LOCKOUT_MINUTES} min.`,
      );
    }
    throw new Problem(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  }

  return { userId: user.id, role: user.role as "ADMIN" | "BARBER", barberId: user.barber?.id };
}

/**
 * Rotaciona via o ciclo de vida compartilhado (src/lib/refresh-tokens.ts) e
 * então checa se o usuário ainda é elegível para sessão de equipe — se não
 * for (desativado, virou outro papel), revoga o token recém-emitido antes
 * de recusar, para não deixar um refresh token válido órfão no banco.
 */
export async function rotateStaffSession(rawToken: string): Promise<StaffSession & { refreshToken: string }> {
  const { userId, refreshToken } = await rotateToken(rawToken);

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { barber: true } });
  if (!user || user.status !== "ACTIVE" || (user.role !== "ADMIN" && user.role !== "BARBER")) {
    await revokeRefreshToken(refreshToken);
    throw new Problem(401, "INVALID_REFRESH_TOKEN", "Sessão inválida. Faça login novamente.");
  }

  return { userId: user.id, role: user.role as "ADMIN" | "BARBER", barberId: user.barber?.id, refreshToken };
}

/** true enquanto não existir nenhum ADMIN — só nesse momento POST /admins fica aberto. */
export async function isBootstrapNeeded(): Promise<boolean> {
  const count = await prisma.user.count({ where: { role: "ADMIN" } });
  return count === 0;
}

export async function createAdmin(input: CreateAdminInput) {
  const [byEmail, byPhone] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email } }),
    prisma.user.findUnique({ where: { phone: input.phone } }),
  ]);
  if (byEmail) throw new Problem(409, "EMAIL_TAKEN", "Esse e-mail já está em uso.");
  if (byPhone) throw new Problem(409, "PHONE_TAKEN", "Esse telefone já está em uso.");

  return prisma.user.create({
    data: {
      email: input.email,
      phone: input.phone,
      passwordHash: hashPassword(input.password),
      role: "ADMIN",
      status: "ACTIVE",
    },
    select: { id: true, email: true, phone: true, role: true, status: true, createdAt: true },
  });
}

export async function listAdmins() {
  return prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, email: true, phone: true, role: true, status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateAdmin(id: string, input: UpdateAdminInput) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== "ADMIN") throw new Problem(404, "ADMIN_NOT_FOUND", "Administrador não encontrado.");

  return prisma.user.update({
    where: { id },
    data: {
      passwordHash: input.password ? hashPassword(input.password) : undefined,
      status: input.status,
    },
    select: { id: true, email: true, phone: true, role: true, status: true, createdAt: true },
  });
}
