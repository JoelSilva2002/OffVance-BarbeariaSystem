import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import type { CreateServiceInput, UpdateServiceInput } from "./catalog.schema.js";

export async function listCategories() {
  return prisma.serviceCategory.findMany({ orderBy: { position: "asc" } });
}

export async function createCategory(input: { name: string; position?: number }) {
  return prisma.serviceCategory.create({ data: { name: input.name, position: input.position ?? 0 } });
}

export async function updateCategory(id: string, input: { name?: string; position?: number }) {
  const category = await prisma.serviceCategory.findUnique({ where: { id } });
  if (!category) throw new Problem(404, "CATEGORY_NOT_FOUND", "Categoria não encontrada.");
  return prisma.serviceCategory.update({ where: { id }, data: input });
}

export async function listServices(filters: { active?: string; bookable?: string; categoryId?: string }) {
  return prisma.service.findMany({
    where: {
      active: filters.active === undefined ? undefined : filters.active === "true",
      onlineBookable: filters.bookable === undefined ? undefined : filters.bookable === "true",
      categoryId: filters.categoryId,
    },
    include: { category: true },
    orderBy: { name: "asc" },
  });
}

export async function getService(id: string) {
  const service = await prisma.service.findUnique({ where: { id }, include: { category: true } });
  if (!service) throw new Problem(404, "SERVICE_NOT_FOUND", "Serviço não encontrado.");
  return service;
}

export async function createService(input: CreateServiceInput) {
  const category = await prisma.serviceCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new Problem(422, "CATEGORY_NOT_FOUND", "Categoria informada não existe.");

  return prisma.service.create({
    data: {
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      durationMin: input.durationMin,
      bufferAfterMin: input.bufferAfterMin ?? 0,
      priceCents: input.priceCents,
      active: input.active ?? true,
      onlineBookable: input.onlineBookable ?? true,
    },
  });
}

export async function updateService(id: string, input: UpdateServiceInput) {
  await getService(id);

  if (input.categoryId) {
    const category = await prisma.serviceCategory.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new Problem(422, "CATEGORY_NOT_FOUND", "Categoria informada não existe.");
  }

  // Reajustar preço/duração aqui NÃO retroage em appointment_items já criados
  // (decisão de modelagem: preço e duração são congelados na reserva).
  return prisma.service.update({ where: { id }, data: input });
}

export async function getServiceBarbers(serviceId: string) {
  await getService(serviceId);
  const rows = await prisma.barberService.findMany({
    where: { serviceId, barber: { status: "ACTIVE" } },
    include: { barber: true },
  });
  return rows.map((r) => ({
    id: r.barber.id,
    displayName: r.barber.displayName,
    photoUrl: r.barber.photoUrl,
    durationOverrideMin: r.durationOverrideMin,
    priceOverrideCents: r.priceOverrideCents,
  }));
}
