// Element and page ids: short, random, URL-safe. Samples and tests use `idGen` for stable ids.
export function newId(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}
/** A deterministic id sequence: idGen('w')() -> 'w1', 'w2'... */
export function idGen(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}
