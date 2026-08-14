import { prisma } from "../../lib/prisma.js";
import { Problem } from "../../lib/problem.js";
import { adjustStock } from "../products/products.service.js";
import type { CreateOrderInput } from "./orders.schema.js";

/**
 * Preço E custo travados na venda dentro da mesma transação que trava e
 * debita o estoque (docs/ARQUITETURA.md §01/§03) — reajuste de tabela
 * depois não reescreve a margem do que já foi vendido, e duas vendas
 * concorrentes da última unidade não estouram o saldo.
 */
export async function createOrder(input: CreateOrderInput) {
  return prisma.$transaction(async (tx) => {
    if (input.clientId) {
      const client = await tx.client.findUnique({ where: { id: input.clientId } });
      if (!client) throw new Problem(404, "CLIENT_NOT_FOUND", "Cliente não encontrado.");
    }
    if (input.appointmentId) {
      const appointment = await tx.appointment.findUnique({ where: { id: input.appointmentId } });
      if (!appointment) throw new Problem(404, "APPOINTMENT_NOT_FOUND", "Agendamento não encontrado.");
    }

    const lines = [];
    for (const line of input.items) {
      const rows = await tx.$queryRaw<
        { id: string; name: string; sale_price_cents: number; cost_price_cents: number; active: boolean }[]
      >`SELECT id, name, sale_price_cents, cost_price_cents, active FROM products WHERE id = ${line.productId} FOR UPDATE`;
      const product = rows[0];
      if (!product) throw new Problem(404, "PRODUCT_NOT_FOUND", `Produto ${line.productId} não encontrado.`);
      if (!product.active) throw new Problem(422, "PRODUCT_INACTIVE", `Produto "${product.name}" não está disponível.`);
      lines.push({
        productId: line.productId,
        qty: line.qty,
        unitPriceCents: product.sale_price_cents,
        unitCostCents: product.cost_price_cents,
      });
    }

    const totalCents = lines.reduce((sum, item) => sum + item.unitPriceCents * item.qty, 0);

    const order = await tx.order.create({
      data: {
        clientId: input.clientId,
        appointmentId: input.appointmentId,
        status: "PAID",
        totalCents,
        items: { create: lines.map((item, position) => ({ ...item, position })) },
      },
      include: { items: { include: { product: true } } },
    });

    for (const item of lines) {
      await adjustStock(tx, item.productId, -item.qty, "SALE", "order", order.id);
    }

    const payment = await tx.payment.create({
      data: { orderId: order.id, amountCents: totalCents, method: input.method, status: "PAID", paidAt: new Date() },
    });

    return { ...order, payment };
  });
}

export async function listOrders(clientId: string | undefined, limit: number) {
  return prisma.order.findMany({
    where: { clientId },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getOrder(id: string) {
  const order = await prisma.order.findUnique({ where: { id }, include: { items: { include: { product: true } } } });
  if (!order) throw new Problem(404, "ORDER_NOT_FOUND", "Pedido não encontrado.");
  return order;
}
