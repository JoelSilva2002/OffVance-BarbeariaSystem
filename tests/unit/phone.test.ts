import { describe, expect, it } from "vitest";
import { normalizePhone, phoneLookupVariants } from "../../src/lib/phone.js";

describe("normalizePhone", () => {
  it("tira o sufixo de JID do WhatsApp", () => {
    expect(normalizePhone("5511999998888@s.whatsapp.net")).toBe("5511999998888");
    expect(normalizePhone("5511999998888@c.us")).toBe("5511999998888");
  });

  it("mantém o código de país quando já vem com +", () => {
    expect(normalizePhone("+5511999998888")).toBe("5511999998888");
  });

  it("tira espaços, parênteses e traços", () => {
    expect(normalizePhone("+55 (11) 99999-8888")).toBe("5511999998888");
  });

  it("tira o 00 de discagem internacional", () => {
    expect(normalizePhone("005511999998888")).toBe("5511999998888");
  });

  it("prefixa 55 num número BR nu de 11 dígitos (celular, DDD+9dígitos)", () => {
    expect(normalizePhone("11999998888")).toBe("5511999998888");
  });

  it("prefixa 55 num número BR nu de 10 dígitos (fixo, DDD+8dígitos)", () => {
    expect(normalizePhone("1199998888")).toBe("551199998888");
  });

  it("string vazia vira string vazia, sem estourar", () => {
    expect(normalizePhone("")).toBe("");
  });
});

describe("phoneLookupVariants", () => {
  it("inclui a forma normalizada com e sem +", () => {
    const variants = phoneLookupVariants("+5511999998888");
    expect(variants).toContain("5511999998888");
    expect(variants).toContain("+5511999998888");
  });

  it("celular (9º dígito presente) também gera a variante sem o 9º dígito", () => {
    const variants = phoneLookupVariants("+5511999998888");
    expect(variants).toContain("551199998888");
    expect(variants).toContain("+551199998888");
  });

  it("fixo (8 dígitos após o DDD) também gera a variante com o 9º dígito", () => {
    const variants = phoneLookupVariants("+551199998888");
    expect(variants).toContain("5511999998888");
    expect(variants).toContain("+5511999998888");
  });

  it("aceita direto o formato de JID do Evolution", () => {
    const variants = phoneLookupVariants("5511999998888@s.whatsapp.net");
    expect(variants).toContain("5511999998888");
    expect(variants).toContain("551199998888");
  });

  it("não duplica variantes quando elas coincidem", () => {
    const variants = phoneLookupVariants("+5511999998888");
    expect(new Set(variants).size).toBe(variants.length);
  });

  it("string vazia devolve lista vazia, não um array de lixo", () => {
    expect(phoneLookupVariants("")).toEqual([]);
  });
});
