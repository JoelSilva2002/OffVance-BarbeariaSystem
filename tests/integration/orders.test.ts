import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma.js";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { createAdmin, createClientUser, staffLogin } from "../setup/fixtures.js";

describe("pedidos (mini e-commerce)", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let clientId: string;

  beforeEach(async () => {
    await resetDatabase();
    const admin = await createAdmin();
    const { client } = await createClientUser();
    clientId = client.id;
    app = await createTestApp();
    ({ accessToken: adminToken } = await staffLogin(app, admin.user.email!, admin.password));
  });

  afterEach(async () => {
    await app.close();
  });

  function authHeader() {
    return { authorization: `Bearer ${adminToken}` };
  }

  async function createProduct(overrides: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: "POST",
      url: "/products",
      headers: authHeader(),
      payload: { name: "Produto", costPriceCents: 1000, salePriceCents: 2500, stockQty: 5, ...overrides },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it("cria pedido: preço/custo travados do produto, estoque debitado, pagamento PAID gerado", async () => {
    const product = await createProduct({ salePriceCents: 3000, costPriceCents: 1200, stockQty: 5 });

    const res = await app.inject({
      method: "POST",
      url: "/orders",
      headers: authHeader(),
      payload: { clientId, method: "PIX", items: [{ productId: product.id, qty: 2 }] },
    });
    expect(res.statusCode).toBe(201);
    const order = res.json();
    expect(order.status).toBe("PAID");
    expect(order.totalCents).toBe(6000);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].unitPriceCents).toBe(3000);
    expect(order.items[0].unitCostCents).toBe(1200);
    expect(order.payment.amountCents).toBe(6000);
    expect(order.payment.status).toBe("PAID");

    const updatedProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(updatedProduct.stockQty).toBe(3);

    const movement = await prisma.stockMovement.findFirst({ where: { productId: product.id, reason: "SALE" } });
    expect(movement?.delta).toBe(-2);
    expect(movement?.refType).toBe("order");
    expect(movement?.refId).toBe(order.id);
  });

  it("reajuste de preço depois da venda não reescreve o pedido antigo", async () => {
    const product = await createProduct({ salePriceCents: 3000 });
    const res = await app.inject({
      method: "POST",
      url: "/orders",
      headers: authHeader(),
      payload: { clientId, method: "CASH", items: [{ productId: product.id, qty: 1 }] },
    });
    const order = res.json();

    await app.inject({
      method: "PATCH",
      url: `/products/${product.id}`,
      headers: authHeader(),
      payload: { salePriceCents: 9999 },
    });

    const reloaded = await app.inject({ method: "GET", url: `/orders/${order.id}`, headers: authHeader() });
    expect(reloaded.json().items[0].unitPriceCents).toBe(3000);
  });

  it("estoque insuficiente recusa o pedido inteiro (422) sem debitar nada", async () => {
    const product = await createProduct({ stockQty: 1 });

    const res = await app.inject({
      method: "POST",
      url: "/orders",
      headers: authHeader(),
      payload: { clientId, method: "CASH", items: [{ productId: product.id, qty: 5 }] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("INSUFFICIENT_STOCK");

    const unchanged = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(unchanged.stockQty).toBe(1);
    const orders = await prisma.order.findMany({ where: { clientId } });
    expect(orders).toHaveLength(0);
  });

  it("produto inativo recusa o pedido com 422 PRODUCT_INACTIVE", async () => {
    const product = await createProduct({ active: false });
    const res = await app.inject({
      method: "POST",
      url: "/orders",
      headers: authHeader(),
      payload: { clientId, method: "CASH", items: [{ productId: product.id, qty: 1 }] },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().title).toBe("PRODUCT_INACTIVE");
  });

  it("produto inexistente dá 404 PRODUCT_NOT_FOUND; cliente inexistente dá 404 CLIENT_NOT_FOUND", async () => {
    const product = await createProduct();

    const badProduct = await app.inject({
      method: "POST",
      url: "/orders",
      headers: authHeader(),
      payload: { clientId, method: "CASH", items: [{ productId: "nao-existe", qty: 1 }] },
    });
    expect(badProduct.statusCode).toBe(404);
    expect(badProduct.json().title).toBe("PRODUCT_NOT_FOUND");

    const badClient = await app.inject({
      method: "POST",
      url: "/orders",
      headers: authHeader(),
      payload: { clientId: "nao-existe", method: "CASH", items: [{ productId: product.id, qty: 1 }] },
    });
    expect(badClient.statusCode).toBe(404);
    expect(badClient.json().title).toBe("CLIENT_NOT_FOUND");
  });

  it("lista pedidos filtrando por cliente; sem autenticação é recusado com 401", async () => {
    const product = await createProduct();
    await app.inject({
      method: "POST",
      url: "/orders",
      headers: authHeader(),
      payload: { clientId, method: "CASH", items: [{ productId: product.id, qty: 1 }] },
    });
    const { client: otherClient } = await createClientUser();
    await app.inject({
      method: "POST",
      url: "/orders",
      headers: authHeader(),
      payload: { clientId: otherClient.id, method: "CASH", items: [{ productId: product.id, qty: 1 }] },
    });

    const filtered = await app.inject({ method: "GET", url: `/orders?clientId=${clientId}`, headers: authHeader() });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().orders).toHaveLength(1);
    expect(filtered.json().orders[0].clientId).toBe(clientId);

    const unauth = await app.inject({ method: "GET", url: "/orders" });
    expect(unauth.statusCode).toBe(401);
  });
});
