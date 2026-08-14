/**
 * Álgebra de intervalos de tempo, em milissegundos desde a época.
 * Base do cálculo de disponibilidade (docs/ARQUITETURA.md, seção 03,
 * camada 1): livre = grade − exceções − folgas − ocupados.
 */
export interface Interval {
  start: number;
  end: number;
}

/** Une intervalos sobrepostos ou adjacentes em uma lista mínima e ordenada. */
export function union(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const result: Interval[] = [{ ...sorted[0]! }];

  for (const current of sorted.slice(1)) {
    const last = result[result.length - 1]!;
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      result.push({ ...current });
    }
  }

  return result;
}

/** Subtrai `remove` de `base`, devolvendo o que sobra de `base`. */
export function subtract(base: Interval[], remove: Interval[]): Interval[] {
  const removeSorted = union(remove);
  let remaining = union(base);

  for (const r of removeSorted) {
    const next: Interval[] = [];
    for (const b of remaining) {
      if (r.end <= b.start || r.start >= b.end) {
        // sem sobreposição
        next.push(b);
        continue;
      }
      if (r.start > b.start) next.push({ start: b.start, end: Math.min(r.start, b.end) });
      if (r.end < b.end) next.push({ start: Math.max(r.end, b.start), end: b.end });
    }
    remaining = next;
  }

  return remaining;
}

/** Verifica se [start, end) está inteiramente contido em algum intervalo livre. */
export function isFullyContained(target: Interval, free: Interval[]): boolean {
  return free.some((f) => target.start >= f.start && target.end <= f.end);
}
