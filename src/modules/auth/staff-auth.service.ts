import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import type { CreateAdminInput, UpdateAdminInput } from "./staff-auth.schema.js";

export async function staffLogin(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email }, include: { barber: true } });

  // mensagem idêntica para "não existe" e "senha errada" — não dar pista de qual delas é
  if (!user || !user.passwordHash || (user.role !== "ADMIN" && user.role !== "BARBER")) {
    throw new Problem(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
  }
  if (user.status !== "ACTIVE") {
    throw new Problem(403, "ACCOUNT_INACTIVE", "Esta conta está inativa.");
  }
  if (!verifyPassword(password, user.passwordHash)) {
    throw new Problem(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
  }

  return { userId: user.id, role: user.role as "ADMIN" | "BARBER", barberId: user.barber?.id };
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
