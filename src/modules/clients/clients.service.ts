import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import type { CreateClientInput } from "./clients.schema.js";

/**
 * `Client` não guarda telefone/e-mail — moram no `User` (relação 1:1; mesmo
 * motivo de `Client.fullName` ser opcional: o autocadastro por OTP cria o
 * `User` antes de o cliente preencher o nome, via PATCH /me depois). Por
 * isso a busca precisa de `include` + achatamento manual, diferente de
 * `listAdmins()` em `staff-auth.service.ts`, que consulta `User` direto com
 * um único `select`.
 */
export async function searchClients(search: string, limit: number) {
  const clients = await prisma.client.findMany({
    where: {
      OR: [{ fullName: { contains: search, mode: "insensitive" } }, { user: { phone: { contains: search } } }],
    },
    include: { user: { select: { phone: true, email: true } } },
    orderBy: { fullName: "asc" },
    take: limit,
  });

  return clients.map((client) => ({
    id: client.id,
    fullName: client.fullName,
    phone: client.user.phone,
    email: client.user.email,
  }));
}

/**
 * Cadastro de cliente avulso (walk-in) pela equipe — mesmo par User+Client
 * que o primeiro login por OTP cria sozinho (verifyOtp, em
 * auth/otp.service.ts), só que aqui é síncrono e feito por quem está no
 * balcão: `fullName` é obrigatório desde já (no caminho do OTP fica
 * pendente até o cliente preencher via PATCH /me).
 */
export async function createWalkInClient(input: CreateClientInput) {
  const [byPhone, byEmail] = await Promise.all([
    prisma.user.findUnique({ where: { phone: input.phone } }),
    input.email ? prisma.user.findUnique({ where: { email: input.email } }) : Promise.resolve(null),
  ]);
  if (byPhone) throw new Problem(409, "PHONE_TAKEN", "Esse telefone já está em uso.");
  if (byEmail) throw new Problem(409, "EMAIL_TAKEN", "Esse e-mail já está em uso.");

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { phone: input.phone, email: input.email, role: "CLIENT", status: "ACTIVE" },
    });
    const client = await tx.client.create({ data: { userId: user.id, fullName: input.fullName } });
    return { id: client.id, fullName: client.fullName, phone: user.phone, email: user.email };
  });
}
