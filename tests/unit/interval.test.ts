import { describe, expect, it } from "vitest";
import { isFullyContained, subtract, union, type Interval } from "../../src/lib/interval.js";

describe("union", () => {
  it("mescla intervalos sobrepostos", () => {
    expect(union([{ start: 0, end: 10 }, { start: 5, end: 15 }])).toEqual([{ start: 0, end: 15 }]);
  });

  it("mescla intervalos adjacentes (fim de um = início do outro)", () => {
    expect(union([{ start: 0, end: 10 }, { start: 10, end: 20 }])).toEqual([{ start: 0, end: 20 }]);
  });

  it("mantém intervalos separados por um gap como itens distintos", () => {
    // é exatamente isso que representa o buraco do almoço na grade
    expect(union([{ start: 0, end: 10 }, { start: 15, end: 20 }])).toEqual([
      { start: 0, end: 10 },
      { start: 15, end: 20 },
    ]);
  });

  it("ordena independente da ordem de entrada", () => {
    expect(union([{ start: 15, end: 20 }, { start: 0, end: 10 }])).toEqual([
      { start: 0, end: 10 },
      { start: 15, end: 20 },
    ]);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(union([])).toEqual([]);
  });
});

describe("subtract", () => {
  it("remove um intervalo totalmente contido no meio, abrindo dois pedaços", () => {
    // é literalmente o "buraco do almoço": grade 09-19 menos 12-13:30
    const working: Interval[] = [{ start: 9, end: 19 }];
    const busy: Interval[] = [{ start: 12, end: 13.5 }];
    expect(subtract(working, busy)).toEqual([
      { start: 9, end: 12 },
      { start: 13.5, end: 19 },
    ]);
  });

  it("remove sobreposição parcial no início", () => {
    expect(subtract([{ start: 0, end: 10 }], [{ start: -5, end: 5 }])).toEqual([{ start: 5, end: 10 }]);
  });

  it("remove sobreposição parcial no fim", () => {
    expect(subtract([{ start: 0, end: 10 }], [{ start: 8, end: 20 }])).toEqual([{ start: 0, end: 8 }]);
  });

  it("intervalo que só toca a borda (sem sobreposição real) não remove nada", () => {
    // mesmo raciocínio do '[)' da constraint de exclusão: tocar não é colidir
    expect(subtract([{ start: 0, end: 10 }], [{ start: 10, end: 20 }])).toEqual([{ start: 0, end: 10 }]);
  });

  it("remove tudo quando o intervalo a remover cobre o todo", () => {
    expect(subtract([{ start: 0, end: 10 }], [{ start: -5, end: 15 }])).toEqual([]);
  });

  it("busy vazio não altera nada", () => {
    expect(subtract([{ start: 0, end: 10 }], [])).toEqual([{ start: 0, end: 10 }]);
  });
});

describe("isFullyContained", () => {
  const free: Interval[] = [{ start: 9, end: 12 }, { start: 13.5, end: 19 }];

  it("aceita um intervalo totalmente dentro de um bloco livre", () => {
    expect(isFullyContained({ start: 9, end: 9.5 }, free)).toBe(true);
  });

  it("aceita quando toca exatamente as duas bordas do bloco", () => {
    expect(isFullyContained({ start: 9, end: 12 }, free)).toBe(true);
  });

  it("recusa quando cruza o buraco do almoço", () => {
    expect(isFullyContained({ start: 11, end: 14 }, free)).toBe(false);
  });

  it("recusa quando está inteiramente fora de qualquer bloco livre", () => {
    expect(isFullyContained({ start: 20, end: 21 }, free)).toBe(false);
  });

  it("lista de livres vazia nunca contém nada", () => {
    expect(isFullyContained({ start: 0, end: 1 }, [])).toBe(false);
  });
});
