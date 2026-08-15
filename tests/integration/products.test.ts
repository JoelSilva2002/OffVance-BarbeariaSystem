import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { createAdmin, createBarberWithSchedule, staffLogin } from "../setup/fixtures.js";

describe("produtos (catálogo de e-commerce)", () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeEach(async () => {
    await resetDatabase();
    const admin = await createAdmin();
    app = await createTestApp();
    ({ accessToken: adminToken } = await staffLogin(app, admin.user.email!, admin.password));
  });

  afterEach(async () => {
    await app.close();
  });

  function adminHeader() {
    return { authorization: `Bearer ${adminToken}` };
  }

  async function createProduct(overrides: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: "POST",
      url: "/products",
      headers: adminHeader(),
      payload: {
        name: "Pomada modeladora",
        costPriceCents: 1000,
        salePriceCents: 2500,
        stockQty: 10,
        ...overrides,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it("cria produto como ADMIN; barbeiro sem privilégio é recusado com 403", async () => {
    const created = await createProduct();
    expect(created.name).toBe("Pomada modeladora");
    expect(created.stockQty).toBe(10);

    const { user: barberUser, password } = await createBarberWithSchedule();
    const { accessToken: barberToken } = await staffLogin(app, barberUser.email!, password);
    const res = await app.inject({
      method: "POST",
      url: "/products",
      headers: { authorization: `Bearer ${barberToken}` },
      payload: { name: "Outro produto", costPriceCents: 100, salePriceCents: 200 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().title).toBe("FORBIDDEN");
  });

  it("vitrine pública nunca expõe costPriceCents; cadastro como ADMIN expõe normalmente", async () => {
    const created = await createProduct({ costPriceCents: 1234, salePriceCents: 5678 });
    expect(created.costPriceCents).toBe(1234);

    const listRes = await app.inject({ method: "GET", url: "/products" });
    expect(listRes.statusCode).toBe(200);
    const listed = listRes.json().products.find((p: { id: string }) => p.id === created.id);
    expect(listed.salePriceCents).toBe(5678);
    expect(listed.costPriceCents).toBeUndefined();

    const getRes = await app.inject({ method: "GET", url: `/products/${created.id}` });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().costPriceCents).toBeUndefined();
  });

  it("filtra por active=true/false na listagem pública", async () => {
    const active = await createProduct({ name: "Ativo" });
    const inactive = await createProduct({ name: "Inativo", active: false });

    const onlyActive = await app.inject({ method: "GET", url: "/products?active=true" });
    const activeIds = onlyActive.json().products.map((p: { id: string }) => p.id);
    expect(activeIds).toContain(active.id);
    expect(activeIds).not.toContain(inactive.id);

    const onlyInactive = await app.inject({ method: "GET", url: "/products?active=false" });
    const inactiveIds = onlyInactive.json().products.map((p: { id: string }) => p.id);
    expect(inactiveIds).toContain(inactive.id);
    expect(inactiveIds).not.toContain(active.id);
  });

  it("404 PRODUCT_NOT_FOUND pra id inexistente", async () => {
    const res = await app.inject({ method: "GET", url: "/products/id-que-nao-existe" });
    expect(res.statusCode).toBe(404);
    expect(res.json().title).toBe("PRODUCT_NOT_FOUND");
  });

  it("PATCH atualiza preço/estoque mínimo; sem autenticação é recusado com 401", async () => {
    const created = await createProduct();
    const res = await app.inject({
      method: "PATCH",
      url: `/products/${created.id}`,
      headers: adminHeader(),
      payload: { salePriceCents: 3000, minStock: 2 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().salePriceCents).toBe(3000);

    const unauth = await app.inject({ method: "PATCH", url: `/products/${created.id}`, payload: { minStock: 5 } });
    expect(unauth.statusCode).toBe(401);
  });

  it("movimentação manual de estoque soma/subtrai e recusa deixar saldo negativo", async () => {
    const created = await createProduct({ stockQty: 5 });

    const addRes = await app.inject({
      method: "POST",
      url: `/products/${created.id}/stock-movements`,
      headers: adminHeader(),
      payload: { delta: 10, reason: "PURCHASE_IN" },
    });
    expect(addRes.statusCode).toBe(201);
    expect(addRes.json().stockQty).toBe(15);

    const overDrawRes = await app.inject({
      method: "POST",
      url: `/products/${created.id}/stock-movements`,
      headers: adminHeader(),
      payload: { delta: -100, reason: "LOSS" },
    });
    expect(overDrawRes.statusCode).toBe(422);
    expect(overDrawRes.json().title).toBe("INSUFFICIENT_STOCK");

    const historyRes = await app.inject({
      method: "GET",
      url: `/products/${created.id}/stock-movements`,
      headers: adminHeader(),
    });
    expect(historyRes.statusCode).toBe(200);
    // só o movimento aplicado com sucesso é registrado — o rejeitado não deixa rastro
    expect(historyRes.json().movements).toHaveLength(1);
    expect(historyRes.json().movements[0].delta).toBe(10);
  });

  it("imagens: adiciona e remove; remover imagem de outro produto dá 404", async () => {
    const productA = await createProduct({ name: "Produto A" });
    const productB = await createProduct({ name: "Produto B" });

    const imgRes = await app.inject({
      method: "POST",
      url: `/products/${productA.id}/images`,
      headers: adminHeader(),
      payload: { url: "https://example.com/foto.jpg" },
    });
    expect(imgRes.statusCode).toBe(201);
    const imageId = imgRes.json().id;

    const crossDelete = await app.inject({
      method: "DELETE",
      url: `/products/${productB.id}/images/${imageId}`,
      headers: adminHeader(),
    });
    expect(crossDelete.statusCode).toBe(404);
    expect(crossDelete.json().title).toBe("IMAGE_NOT_FOUND");

    const delRes = await app.inject({
      method: "DELETE",
      url: `/products/${productA.id}/images/${imageId}`,
      headers: adminHeader(),
    });
    expect(delRes.statusCode).toBe(204);
  });
});
