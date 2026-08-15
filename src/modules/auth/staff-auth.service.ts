import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { generateRefreshToken, hashRefreshToken } from "../../lib/tokens.js";
import type { CreateAdminInput, UpdateAdminInput } from "./staff-auth.schema.js";

const REFRESH_TOKEN_TTL_DAYS = 30;

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

/** Emite e persiste (hash) um novo refresh token — chamado no login e a cada rotação. */
export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3_600_000),
    },
  });
  return raw;
}

/**
 * Rotação (docs de segurança padrão para refresh token): cada uso troca o
 * token por um novo e revoga o anterior. Reapresentar um token já revogado
 * é sinal de roubo — a resposta é revogar TODAS as sessões ativas do
 * usuário, não só recusar aquele uso.
 */
export async function rotateRefreshToken(rawToken: string): Promise<StaffSession & { refreshToken: string }> {
  const tokenHash = hashRefreshToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    throw new Problem(401, "INVALID_REFRESH_TOKEN", "Sessão inválida. Faça login novamente.");
  }

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new Problem(
      401,
      "REFRESH_TOKEN_REUSED",
      "Sessão comprometida — todos os dispositivos foram desconectados. Faça login novamente.",
    );
  }

  if (existing.expiresAt < new Date()) {
    throw new Problem(401, "REFRESH_TOKEN_EXPIRED", "Sessão expirada. Faça login novamente.");
  }

  const user = await prisma.user.findUnique({ where: { id: existing.userId }, include: { barber: true } });
  if (!user || user.status !== "ACTIVE" || (user.role !== "ADMIN" && user.role !== "BARBER")) {
    throw new Problem(401, "INVALID_REFRESH_TOKEN", "Sessão inválida. Faça login novamente.");
  }

  const newRaw = generateRefreshToken();
  const [newToken] = await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: hashRefreshToken(newRaw),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3_600_000),
      },
    }),
    prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } }),
  ]);
  await prisma.refreshToken.update({ where: { id: existing.id }, data: { replacedById: newToken.id } });

  return {
    userId: user.id,
    role: user.role as "ADMIN" | "BARBER",
    barberId: user.barber?.id,
    refreshToken: newRaw,
  };
}

/** Encerra só esta sessão/dispositivo — os demais refresh tokens do usuário continuam válidos. */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
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
