// Small seeded random number generator so every run can be reproduced.
// Same seed in, same numbers out, on client and server.

export type Rng = () => number;

/** mulberry32: fast, tiny, good enough for placing bots and for balance tests. Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash: turns a text seed such as "2026-12-01:board-3" into a 32-bit number. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Integer in [0, n). */
export function randomInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Convenience: an Rng from a text seed. */
export function rngFromText(text: string): Rng {
  return mulberry32(hashSeed(text));
}
