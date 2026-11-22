import { test, eq, assert, near } from './runner.js';
import { createRng, hashString } from '../js/core/rng.js';

test('rng: same seed gives same sequence, different seed differs', () => {
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const sa = [a.next(), a.next(), a.next()];
  eq(sa, [b.next(), b.next(), b.next()]);
  assert(sa[0] !== c.next());
});

test('rng: string seeds are hashed and stable', () => {
  eq(createRng('abc').next(), createRng('abc').next());
  eq(hashString('abc'), hashString('abc'));
});

test('rng: int and range stay in bounds', () => {
  const r = createRng(1);
  for (let i = 0; i < 1000; i++) {
    const x = r.int(5);
    assert(x >= 0 && x < 5 && Number.isInteger(x));
    const y = r.range(3, 6);
    assert(y >= 3 && y <= 6);
  }
});

test('rng: shuffle is a permutation and leaves the input alone', () => {
  const r = createRng(7);
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = r.shuffle(input);
  eq(input, [1, 2, 3, 4, 5, 6, 7, 8]);
  eq(out.slice().sort((x, y) => x - y), input);
});

test('rng: weighted follows weights and never picks weight 0', () => {
  const r = createRng(9);
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 10000; i++) counts[r.weighted(['a', 'b', 'c'], (k) => ({ a: 3, b: 1, c: 0 })[k])]++;
  eq(counts.c, 0);
  near(counts.a / 10000, 0.75, 0.03);
});

test('rng: chance(0) never, chance(1) always', () => {
  const r = createRng(3);
  for (let i = 0; i < 200; i++) { assert(!r.chance(0)); assert(r.chance(1)); }
});
