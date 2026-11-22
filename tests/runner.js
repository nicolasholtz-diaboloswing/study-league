// Tiny dependency-free test runner.
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assert(cond, msg = 'assertion failed') {
  if (!cond) throw new Error(msg);
}

const show = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };

export function eq(actual, expected, msg = '') {
  if (show(actual) !== show(expected)) throw new Error(`${msg} expected ${show(expected)} but got ${show(actual)}`.trim());
}

export function near(actual, expected, tol, msg = '') {
  if (Math.abs(actual - expected) > tol) throw new Error(`${msg} expected ~${expected} (+-${tol}) but got ${actual}`.trim());
}

export async function throws(fn, code) {
  try {
    await fn();
  } catch (e) {
    if (code && e.code !== code) throw new Error(`expected error code ${code} but got ${e.code || e.message}`);
    return e;
  }
  throw new Error('expected an error but none was thrown');
}

/** Run all registered tests. Returns { passed, total, failures: [{name, error}] } */
export async function runAll() {
  const failures = [];
  for (const t of tests) {
    try {
      await t.fn();
    } catch (e) {
      failures.push({ name: t.name, error: e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e) });
    }
  }
  return { passed: tests.length - failures.length, total: tests.length, failures };
}
