import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { createAdmin, createBarberWithSchedule, createClientUser, staffLogin } from "../setup/fixtures.js";

describe("clients — busca e cadastro de walk-in", () => {
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

  function authHeader() {
    return { authorization: `Bearer ${adminToken}` };
  }

  it("busca por nome parcial (case-insensitive), respeitando o limit", async () => {
    await createClientUser({ fullName: "Marcelo Andrade" });
    await createClientUser({ fullName: "Marcela Souza" });
    await createClientUser({ fullName: "Bruno Costa" });

    const res = await app.inject({ method: "GET", url: "/clients?search=marc", headers: authHeader() });
    expect(res.statusCode).toBe(200);
    const names = res.json().clients.map((c: { fullName: string }) => c.fullName).sort();
    expect(names).toEqual(["Marcela Souza", "Marcelo Andrade"]);

    const limited = await app.inject({ method: "GET", url: "/clients?search=marc&limit=1", headers: authHeader() });
    expect(limited.json().clients).toHaveLength(1);
  });

  it("busca por telefone parcial", async () => {
    const { user, client } = await createClientUser({ fullName: "Cliente Telefone" });
    const suffix = user.phone.slice(-6);

    const res = await app.inject({ method: "GET", url: `/clients?search=${suffix}`, headers: authHeader() });
    expect(res.statusCode).toBe(200);
    expect(res.json().clients.map((c: { id: string }) => c.id)).toContain(client.id);
  });

  it("cria cliente avulso (walk-in) e devolve nome/telefone/e-mail", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/clients",
      headers: authHeader(),
      payload: { fullName: "Cliente Balcão", phone: "+5511988887777", email: "balcao@teste.dev" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      fullName: "Cliente Balcão",
      phone: "+5511988887777",
      email: "balcao@teste.dev",
    });

    const found = await app.inject({ method: "GET", url: "/clients?search=Balcão", headers: authHeader() });
    expect(found.json().clients).toHaveLength(1);
  });

  it("recusa telefone já cadastrado (409 PHONE_TAKEN) e e-mail já cadastrado (409 EMAIL_TAKEN)", async () => {
    const { user: existing } = await createClientUser({ email: "duplicado@teste.dev" });

    const phoneConflict = await app.inject({
      method: "POST",
      url: "/clients",
      headers: authHeader(),
      payload: { fullName: "Outro Nome", phone: existing.phone },
    });
    expect(phoneConflict.statusCode).toBe(409);
    expect(phoneConflict.json().title).toBe("PHONE_TAKEN");

    const emailConflict = await app.inject({
      method: "POST",
      url: "/clients",
      headers: authHeader(),
      payload: { fullName: "Outro Nome", phone: "+5511977776666", email: "duplicado@teste.dev" },
    });
    expect(emailConflict.statusCode).toBe(409);
    expect(emailConflict.json().title).toBe("EMAIL_TAKEN");
  });

  it("exige sessão de equipe (401 sem token); BARBER também pode buscar e cadastrar (não é ADMIN-only)", async () => {
    const unauthSearch = await app.inject({ method: "GET", url: "/clients?search=ab" });
    expect(unauthSearch.statusCode).toBe(401);

    const { user: barberUser, password } = await createBarberWithSchedule();
    const { accessToken: barberToken } = await staffLogin(app, barberUser.email!, password);

    const searchAsBarber = await app.inject({
      method: "GET",
      url: "/clients?search=ab",
      headers: { authorization: `Bearer ${barberToken}` },
    });
    expect(searchAsBarber.statusCode).toBe(200);

    const createAsBarber = await app.inject({
      method: "POST",
      url: "/clients",
      headers: { authorization: `Bearer ${barberToken}` },
      payload: { fullName: "Criado por barbeiro", phone: "+5511966665555" },
    });
    expect(createAsBarber.statusCode).toBe(201);
  });
});
