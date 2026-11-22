// Seeded RNG (mulberry32). All randomness in js/core goes through an object made here.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Fresh seed for production use (views call createRng(randomSeed())). The only Math.random in core. */
export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}

export function createRng(seed) {
  let a = (typeof seed === 'string' ? hashString(seed) : (seed | 0)) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    /** integer in [0, n) */
    int: (n) => Math.floor(next() * n),
    /** integer in [min, max] inclusive */
    range: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** new shuffled array (Fisher-Yates), input untouched */
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /** pick an item with probability proportional to weightFn(item) (weights <= 0 are never picked) */
    weighted(items, weightFn) {
      let total = 0;
      for (const it of items) total += Math.max(0, weightFn(it));
      if (total <= 0) return items.length ? items[Math.floor(next() * items.length)] : undefined;
      let r = next() * total;
      for (const it of items) {
        const w = Math.max(0, weightFn(it));
        if (r < w) return it;
        r -= w;
      }
      return items[items.length - 1];
    },
  };
  return rng;
}
