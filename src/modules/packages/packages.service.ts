import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import type { CreatePackageInput, UpdatePackageInput } from "./packages.schema.js";

async function assertServicesExist(serviceIds: string[] | undefined) {
  if (!serviceIds || serviceIds.length === 0) return;
  const found = await prisma.service.count({ where: { id: { in: serviceIds } } });
  if (found !== new Set(serviceIds).size) {
    throw new Problem(422, "SERVICE_NOT_FOUND", "Um ou mais serviços informados não existem.");
  }
}

export async function listPackages(active?: string) {
  return prisma.package.findMany({
    where: { active: active === undefined ? undefined : active === "true" },
    orderBy: { name: "asc" },
  });
}

export async function getPackage(id: string) {
  const pkg = await prisma.package.findUnique({ where: { id } });
  if (!pkg) throw new Problem(404, "PACKAGE_NOT_FOUND", "Pacote não encontrado.");
  return pkg;
}

export async function createPackage(input: CreatePackageInput) {
  await assertServicesExist(input.scopeServiceIds);
  return prisma.package.create({
    data: {
      name: input.name,
      description: input.description,
      priceCents: input.priceCents,
      creditsQty: input.creditsQty,
      scopeServiceIds: input.scopeServiceIds ?? [],
      validityDays: input.validityDays,
      isRecurring: input.isRecurring ?? false,
      active: input.active ?? true,
    },
  });
}

export async function updatePackage(id: string, input: UpdatePackageInput) {
  await getPackage(id);
  await assertServicesExist(input.scopeServiceIds);
  return prisma.package.update({ where: { id }, data: input });
}
