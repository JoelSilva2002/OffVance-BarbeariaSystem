import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../src/lib/prisma.js";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { createAdmin, createApiKey, createBarberWithSchedule, staffLogin } from "../setup/fixtures.js";

/**
 * Portal do cliente (Fase 0): GET /barbers e GET /barbers/:id são públicos
 * (sem guarda) — o portal do cliente os usa pra escolher barbeiro no fluxo
 * de agendamento — mas `commissionPct` (comissão do barbeiro) não pode ir
 * pra um chamador anônimo. O mesmo endpoint continua devolvendo o campo pro
 * painel de equipe autenticado, que precisa dele pra editar
 * (`tryResolveStaffIdentity`, src/plugins/auth.ts).
 */
describe("GET /barbers — commissionPct só pra quem é staff/API key com escopo", () => {
  let app: FastifyInstance;
  let barberId: string;
  let adminToken: string;

  beforeEach(async () => {
    await resetDatabase();
    const { barber } = await createBarberWithSchedule({ displayName: "João" });
    barberId = barber.id;
    await prisma.barber.update({ where: { id: barberId }, data: { commissionPct: "35.00" } });

    const admin = await createAdmin();
    app = await createTestApp();
    ({ accessToken: adminToken } = await staffLogin(app, admin.user.email!, admin.password));
  });

  afterEach(async () => {
    await app.close();
  });

  it("sem autenticação: commissionPct some da listagem e do detalhe", async () => {
    const listRes = await app.inject({ method: "GET", url: "/barbers" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().barbers[0]).not.toHaveProperty("commissionPct");

    const detailRes = await app.inject({ method: "GET", url: `/barbers/${barberId}` });
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json()).not.toHaveProperty("commissionPct");
  });

  it("com sessão de equipe: commissionPct continua presente (painel precisa dele pra editar)", async () => {
    const headers = { authorization: `Bearer ${adminToken}` };

    const listRes = await app.inject({ method: "GET", url: "/barbers", headers });
    expect(Number(listRes.json().barbers[0].commissionPct)).toBe(35);

    const detailRes = await app.inject({ method: "GET", url: `/barbers/${barberId}`, headers });
    expect(Number(detailRes.json().commissionPct)).toBe(35);
  });

  it("API key com escopo barbers:read vê commissionPct; sem o escopo, não vê", async () => {
    const readKey = await createApiKey(app, adminToken, ["barbers:read"]);
    const withScope = await app.inject({
      method: "GET",
      url: `/barbers/${barberId}`,
      headers: { authorization: `Bearer ${readKey.key}` },
    });
    expect(Number(withScope.json().commissionPct)).toBe(35);

    const unrelatedKey = await createApiKey(app, adminToken, ["appointments:read"]);
    const withoutScope = await app.inject({
      method: "GET",
      url: `/barbers/${barberId}`,
      headers: { authorization: `Bearer ${unrelatedKey.key}` },
    });
    expect(withoutScope.statusCode).toBe(200); // rota continua pública — só o campo some
    expect(withoutScope.json()).not.toHaveProperty("commissionPct");
  });

  it("token inválido é tratado como anônimo, não como erro (rota continua pública)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/barbers/${barberId}`,
      headers: { authorization: "Bearer sk_chave_invalida_00000000000000000000000" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty("commissionPct");
  });
});
