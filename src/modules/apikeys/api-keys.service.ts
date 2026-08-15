import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { apiKeyPrefix, generateApiKey, hashApiKey } from "../../lib/tokens.js";
import type { CreateApiKeyInput, UpdateApiKeyInput } from "./api-keys.schema.js";

const publicFields = {
  id: true,
  name: true,
  keyPrefix: true,
  scopes: true,
  active: true,
  lastUsedAt: true,
  expiresAt: true,
  createdAt: true,
} as const;

/** A chave crua só existe nesta resposta — depois disso só o hash sobrevive. */
export async function createApiKey(input: CreateApiKeyInput) {
  const rawKey = generateApiKey();

  const apiKey = await prisma.apiKey.create({
    data: {
      name: input.name,
      keyPrefix: apiKeyPrefix(rawKey),
      keyHash: hashApiKey(rawKey),
      scopes: input.scopes,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    },
    select: publicFields,
  });

  return { ...apiKey, key: rawKey };
}

export async function listApiKeys() {
  return prisma.apiKey.findMany({ select: publicFields, orderBy: { createdAt: "desc" } });
}

export async function updateApiKey(id: string, input: UpdateApiKeyInput) {
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) throw new Problem(404, "API_KEY_NOT_FOUND", "API key não encontrada.");

  return prisma.apiKey.update({ where: { id }, data: input, select: publicFields });
}

export async function deleteApiKey(id: string) {
  const existing = await prisma.apiKey.findUnique({ where: { id } });
  if (!existing) throw new Problem(404, "API_KEY_NOT_FOUND", "API key não encontrada.");
  await prisma.apiKey.delete({ where: { id } });
}
