import { describe, expect, it } from "vitest";
import {
  apiKeyPrefix,
  generateApiKey,
  generateRefreshToken,
  hashApiKey,
  hashRefreshToken,
  isApiKeyFormat,
} from "../../src/lib/tokens.js";

describe("refresh token", () => {
  it("gera valores diferentes a cada chamada", () => {
    expect(generateRefreshToken()).not.toBe(generateRefreshToken());
  });

  it("hash é determinístico (precisa ser, pra buscar no banco por igualdade)", () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });

  it("tokens diferentes produzem hashes diferentes", () => {
    expect(hashRefreshToken(generateRefreshToken())).not.toBe(hashRefreshToken(generateRefreshToken()));
  });
});

describe("api key", () => {
  it("sempre começa com o prefixo sk_", () => {
    expect(generateApiKey().startsWith("sk_")).toBe(true);
  });

  it("isApiKeyFormat reconhece o formato sk_ e recusa o resto", () => {
    expect(isApiKeyFormat(generateApiKey())).toBe(true);
    expect(isApiKeyFormat(generateRefreshToken())).toBe(false);
    expect(isApiKeyFormat("qualquer.jwt.token")).toBe(false);
  });

  it("apiKeyPrefix trunca sem nunca devolver a chave inteira", () => {
    const key = generateApiKey();
    const prefix = apiKeyPrefix(key);
    expect(prefix.length).toBeLessThan(key.length);
    expect(key.startsWith(prefix)).toBe(true);
  });

  it("hash é determinístico e diferente entre chaves diferentes", () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toBe(hashApiKey(generateApiKey()));
  });
});
