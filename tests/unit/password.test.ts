import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/password.js";

describe("hashPassword / verifyPassword", () => {
  it("verifica a senha correta", () => {
    const hash = hashPassword("minha-senha-forte");
    expect(verifyPassword("minha-senha-forte", hash)).toBe(true);
  });

  it("recusa a senha errada", () => {
    const hash = hashPassword("minha-senha-forte");
    expect(verifyPassword("senha-errada", hash)).toBe(false);
  });

  it("nunca guarda a senha em texto puro no hash", () => {
    const hash = hashPassword("minha-senha-forte");
    expect(hash).not.toContain("minha-senha-forte");
  });

  it("duas chamadas com a mesma senha geram hashes diferentes (salt aleatório)", () => {
    const a = hashPassword("mesma-senha");
    const b = hashPassword("mesma-senha");
    expect(a).not.toBe(b);
    // mas as duas continuam validando a senha original
    expect(verifyPassword("mesma-senha", a)).toBe(true);
    expect(verifyPassword("mesma-senha", b)).toBe(true);
  });

  it("hash malformado (sem salt) não derruba a verificação, só recusa", () => {
    expect(verifyPassword("qualquer", "hash-sem-formato-esperado")).toBe(false);
  });

  it("string vazia como hash armazenado não derruba a verificação", () => {
    expect(verifyPassword("qualquer", "")).toBe(false);
  });
});
