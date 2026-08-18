import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import {
  createAdmin,
  createApiKey,
  createBarberWithSchedule,
  createClientUser,
  seedShopSettings,
  staffLogin,
} from "../setup/fixtures.js";
import { nextWeekdayAt } from "../setup/dates.js";
import { phoneLookupVariants } from "../../src/lib/phone.js";

/**
 * Escopos ampliados de API key (docs/ARQUITETURA.md §02): barbers:*,
 * catalog:write e financeiro:* — cobrem o que antes só uma sessão de
 * equipe conseguia fazer em barbeiros/catálogo/pedidos/pacotes/fidelidade/
 * relatórios.
 */
describe("API key — escopos de barbeiros, catálogo e financeiro", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let barberId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedShopSettings();
    const admin = await createAdmin();
    const { barber } = await createBarberWithSchedule();
    barberId = barber.id;

    app = await createTestApp();
    ({ accessToken: adminToken } = await staffLogin(app, admin.user.email!, admin.password));
  });

  afterEach(async () => {
    await app.close();
  });

  function adminHeader() {
    return { authorization: `Bearer ${adminToken}` };
  }

  describe("barbers:read / barbers:write", () => {
    it("chave com os dois escopos lê e edita grade/folga/agenda de qualquer barbeiro (como ADMIN)", async () => {
      const apiKey = await createApiKey(app, adminToken, ["barbers:read", "barbers:write"]);
      const keyHeader = { authorization: `Bearer ${apiKey.key}` };

      const scheduleRes = await app.inject({ method: "GET", url: `/barbers/${barberId}/schedule`, headers: keyHeader });
      expect(scheduleRes.statusCode).toBe(200);

      const putRes = await app.inject({
        method: "PUT",
        url: `/barbers/${barberId}/schedule`,
        headers: keyHeader,
        payload: [{ weekday: 6, startTime: "09:00", endTime: "12:00" }],
      });
      expect(putRes.statusCode).toBe(200);

      const timeOffRes = await app.inject({
        method: "POST",
        url: `/barbers/${barberId}/time-off`,
        headers: keyHeader,
        payload: { startsAt: nextWeekdayAt(0, 20), endsAt: nextWeekdayAt(23, 20), reason: "Férias" },
      });
      expect(timeOffRes.statusCode).toBe(201);

      const agendaRes = await app.inject({
        method: "GET",
        url: `/barbers/${barberId}/agenda?date=${nextWeekdayAt(10).slice(0, 10)}`,
        headers: keyHeader,
      });
      expect(agendaRes.statusCode).toBe(200);
    });

    it("chave só com barbers:read não pode escrever (403); sem nenhum escopo de barbeiro não pode nem ler", async () => {
      const readOnlyKey = await createApiKey(app, adminToken, ["barbers:read"]);
      const writeRes = await app.inject({
        method: "PUT",
        url: `/barbers/${barberId}/schedule`,
        headers: { authorization: `Bearer ${readOnlyKey.key}` },
        payload: [],
      });
      expect(writeRes.statusCode).toBe(403);
      expect(writeRes.json().title).toBe("INSUFFICIENT_SCOPE");

      const unrelatedKey = await createApiKey(app, adminToken, ["events:read"]);
      const readRes = await app.inject({
        method: "GET",
        url: `/barbers/${barberId}/schedule`,
        headers: { authorization: `Bearer ${unrelatedKey.key}` },
      });
      expect(readRes.statusCode).toBe(403);
    });

    it("criar/editar/remover a IDENTIDADE do barbeiro continua ADMIN-only — nenhum escopo de API key dá acesso", async () => {
      const apiKey = await createApiKey(app, adminToken, ["barbers:read", "barbers:write"]);
      const res = await app.inject({
        method: "POST",
        url: "/barbers",
        headers: { authorization: `Bearer ${apiKey.key}` },
        payload: { displayName: "Novo barbeiro", phone: "+5511999998888" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("catalog:write", () => {
    it("chave cria categoria, serviço, produto e pacote", async () => {
      const apiKey = await createApiKey(app, adminToken, ["catalog:write"]);
      const keyHeader = { authorization: `Bearer ${apiKey.key}` };

      const categoryRes = await app.inject({
        method: "POST",
        url: "/service-categories",
        headers: keyHeader,
        payload: { name: "Cortes" },
      });
      expect(categoryRes.statusCode).toBe(201);

      const serviceRes = await app.inject({
        method: "POST",
        url: "/services",
        headers: keyHeader,
        payload: { categoryId: categoryRes.json().id, name: "Corte simples", durationMin: 30, priceCents: 4000 },
      });
      expect(serviceRes.statusCode).toBe(201);

      const productRes = await app.inject({
        method: "POST",
        url: "/products",
        headers: keyHeader,
        payload: { name: "Cera", costPriceCents: 500, salePriceCents: 1500, stockQty: 10 },
      });
      expect(productRes.statusCode).toBe(201);

      const packageRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: keyHeader,
        payload: { name: "Combo", priceCents: 10000, creditsQty: 3, validityDays: 60 },
      });
      expect(packageRes.statusCode).toBe(201);
    });

    it("BARBER autenticado continua sem acesso (requireAdminOrApiKey não abre pra BARBER)", async () => {
      const { user: barberUser, password } = await createBarberWithSchedule();
      const { accessToken: barberToken } = await staffLogin(app, barberUser.email!, password);
      const res = await app.inject({
        method: "POST",
        url: "/service-categories",
        headers: { authorization: `Bearer ${barberToken}` },
        payload: { name: "Categoria" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().title).toBe("FORBIDDEN");
    });

    it("chave sem catalog:write é recusada com 403", async () => {
      const apiKey = await createApiKey(app, adminToken, ["financeiro:read"]);
      const res = await app.inject({
        method: "POST",
        url: "/service-categories",
        headers: { authorization: `Bearer ${apiKey.key}` },
        payload: { name: "Categoria" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().title).toBe("INSUFFICIENT_SCOPE");
    });
  });

  describe("financeiro:read / financeiro:write", () => {
    it("chave vende produto (POST /orders) e lê o pedido de volta", async () => {
      const writeKey = await createApiKey(app, adminToken, ["financeiro:write"]);
      const readKey = await createApiKey(app, adminToken, ["financeiro:read"]);
      const { client } = await createClientUser();

      const productRes = await app.inject({
        method: "POST",
        url: "/products",
        headers: adminHeader(),
        payload: { name: "Shampoo", costPriceCents: 800, salePriceCents: 2000, stockQty: 5 },
      });
      const product = productRes.json();

      const orderRes = await app.inject({
        method: "POST",
        url: "/orders",
        headers: { authorization: `Bearer ${writeKey.key}` },
        payload: { clientId: client.id, method: "PIX", items: [{ productId: product.id, qty: 1 }] },
      });
      expect(orderRes.statusCode).toBe(201);
      const order = orderRes.json();

      const listRes = await app.inject({
        method: "GET",
        url: "/orders",
        headers: { authorization: `Bearer ${readKey.key}` },
      });
      expect(listRes.statusCode).toBe(200);

      const getRes = await app.inject({
        method: "GET",
        url: `/orders/${order.id}`,
        headers: { authorization: `Bearer ${readKey.key}` },
      });
      expect(getRes.statusCode).toBe(200);

      const writeCannotRead = await app.inject({
        method: "GET",
        url: "/orders",
        headers: { authorization: `Bearer ${writeKey.key}` },
      });
      expect(writeCannotRead.statusCode).toBe(403);
    });

    it("chave vende e consulta pacote de cliente, e lê saldo de fidelidade", async () => {
      const writeKey = await createApiKey(app, adminToken, ["financeiro:write"]);
      const readKey = await createApiKey(app, adminToken, ["financeiro:read"]);
      const { client } = await createClientUser();

      const pkgRes = await app.inject({
        method: "POST",
        url: "/packages",
        headers: adminHeader(),
        payload: { name: "Pacote", priceCents: 9000, creditsQty: 2, validityDays: 30 },
      });
      const pkg = pkgRes.json();

      const purchaseRes = await app.inject({
        method: "POST",
        url: `/clients/${client.id}/packages`,
        headers: { authorization: `Bearer ${writeKey.key}` },
        payload: { packageId: pkg.id, method: "CASH" },
      });
      expect(purchaseRes.statusCode).toBe(201);

      const listRes = await app.inject({
        method: "GET",
        url: `/clients/${client.id}/packages`,
        headers: { authorization: `Bearer ${readKey.key}` },
      });
      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().packages).toHaveLength(1);

      const loyaltyRes = await app.inject({
        method: "GET",
        url: `/clients/${client.id}/loyalty`,
        headers: { authorization: `Bearer ${readKey.key}` },
      });
      expect(loyaltyRes.statusCode).toBe(200);
      expect(loyaltyRes.json().balance).toBe(0);
    });

    it("chave lê os dashboards de agendamento e financeiro", async () => {
      const readKey = await createApiKey(app, adminToken, ["financeiro:read"]);
      const today = new Date().toISOString().slice(0, 10);

      const appointmentsReportRes = await app.inject({
        method: "GET",
        url: `/reports/appointments?from=${today}&to=${today}`,
        headers: { authorization: `Bearer ${readKey.key}` },
      });
      expect(appointmentsReportRes.statusCode).toBe(200);

      const revenueReportRes = await app.inject({
        method: "GET",
        url: `/reports/revenue?from=${today}&to=${today}`,
        headers: { authorization: `Bearer ${readKey.key}` },
      });
      expect(revenueReportRes.statusCode).toBe(200);
    });

    it("chave sem escopo financeiro é recusada em qualquer uma dessas rotas (403)", async () => {
      const { client } = await createClientUser();
      const unrelatedKey = await createApiKey(app, adminToken, ["catalog:write"]);

      const ordersRes = await app.inject({
        method: "GET",
        url: "/orders",
        headers: { authorization: `Bearer ${unrelatedKey.key}` },
      });
      expect(ordersRes.statusCode).toBe(403);

      const loyaltyRes = await app.inject({
        method: "GET",
        url: `/clients/${client.id}/loyalty`,
        headers: { authorization: `Bearer ${unrelatedKey.key}` },
      });
      expect(loyaltyRes.statusCode).toBe(403);

      const reportRes = await app.inject({
        method: "GET",
        url: "/reports/revenue?from=2026-01-01&to=2026-01-31",
        headers: { authorization: `Bearer ${unrelatedKey.key}` },
      });
      expect(reportRes.statusCode).toBe(403);
    });
  });

  describe("clients:read", () => {
    it("chave com clients:read acha cliente pela grafia de telefone que o Evolution manda; sem o escopo é 403", async () => {
      const { user, client } = await createClientUser();
      const readKey = await createApiKey(app, adminToken, ["clients:read"]);
      // simula o JID que o Evolution entrega num webhook de entrada, não o
      // formato salvo em `users.phone` — é phoneLookupVariants que faz a ponte.
      const [asJidDigits] = phoneLookupVariants(user.phone);

      const res = await app.inject({
        method: "GET",
        url: `/clients?phone=${encodeURIComponent(`${asJidDigits}@s.whatsapp.net`)}`,
        headers: { authorization: `Bearer ${readKey.key}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().clients.map((c: { id: string }) => c.id)).toEqual([client.id]);

      const unrelatedKey = await createApiKey(app, adminToken, ["appointments:write"]);
      const denied = await app.inject({
        method: "GET",
        url: `/clients?phone=${encodeURIComponent(user.phone)}`,
        headers: { authorization: `Bearer ${unrelatedKey.key}` },
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.json().title).toBe("INSUFFICIENT_SCOPE");
    });

    it("cadastro de cliente (POST) continua staff-only mesmo com clients:read", async () => {
      const readKey = await createApiKey(app, adminToken, ["clients:read"]);
      const res = await app.inject({
        method: "POST",
        url: "/clients",
        headers: { authorization: `Bearer ${readKey.key}` },
        payload: { fullName: "Via API key", phone: "+5511944443333" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  it("chave inválida continua recebendo 401 em rotas antes só-ADMIN, nunca 500", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/reports/revenue?from=2026-01-01&to=2026-01-31",
      headers: { authorization: "Bearer sk_chave_invalida_00000000000000000000000" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().title).toBe("INVALID_API_KEY");
  });
});
