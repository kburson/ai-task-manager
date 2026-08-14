// @story #809
// Tests for the Agent Review Gate validator registry (#809).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../../../../../task-tracker/lib/agent-review/registry.mjs';

function pass(id) {
  return { id, validate: () => ({ pass: true, failures: [] }) };
}
function fail(id, failures) {
  return { id, validate: () => ({ pass: false, failures }) };
}

test('register rejects malformed validators', () => {
  const r = createRegistry();
  assert.throws(() => r.register(null), /must be an object/);
  assert.throws(() => r.register({}), /id must be a non-empty string/);
  assert.throws(() => r.register({ id: '' }), /id must be a non-empty string/);
  assert.throws(() => r.register({ id: 'x' }), /must have a validate/);
});

test('register rejects a duplicate id', () => {
  const r = createRegistry();
  r.register(pass('v1'));
  assert.throws(() => r.register(pass('v1')), /already registered/);
});

test('validators() returns a snapshot in registration order', () => {
  const r = createRegistry();
  r.register(pass('a'));
  r.register(pass('b'));
  const snap = r.validators();
  assert.deepEqual(
    snap.map((v) => v.id),
    ['a', 'b']
  );
  // Mutating the snapshot does not affect the registry.
  snap.length = 0;
  assert.equal(r.validators().length, 2);
});

test('clear empties the registry', () => {
  const r = createRegistry();
  r.register(pass('a'));
  r.clear();
  assert.equal(r.validators().length, 0);
});

test('runAll with zero validators is a vacuous pass', () => {
  const r = createRegistry();
  const res = r.runAll({ body: 'anything' });
  assert.equal(res.pass, true);
  assert.deepEqual(res.failures, []);
  assert.equal(res.normalizedBody, undefined);
});

test('runAll aggregates pass as AND and prefixes failures with the id', () => {
  const r = createRegistry();
  r.register(pass('ok'));
  r.register(fail('bad', ['thing broke', 'other broke']));
  const res = r.runAll({ body: 'x' });
  assert.equal(res.pass, false);
  assert.deepEqual(res.failures, ['bad: thing broke', 'bad: other broke']);
});

test('a failing validator with no message still fails the aggregate', () => {
  const r = createRegistry();
  r.register({ id: 'silent', validate: () => ({ pass: false, failures: [] }) });
  const res = r.runAll({ body: 'x' });
  assert.equal(res.pass, false);
  assert.deepEqual(res.failures, ['silent: failed']);
});

test('a validator returning nothing fails the aggregate', () => {
  const r = createRegistry();
  r.register({ id: 'no-result', validate: () => undefined });
  const res = r.runAll({ body: 'x' });
  assert.equal(res.pass, false);
  assert.deepEqual(res.failures, ['no-result: no-result returned no result']);
});

test('a normalizer rewrite threads into later validators and re-runs on its own output', () => {
  const r = createRegistry();
  const seen = [];
  // Normalizer appends a marker once; on its second (re-validation) run the
  // marker is already present so it returns pass with no further normalize.
  r.register({
    id: 'norm',
    validate: ({ body }) => {
      if (body.includes('NORMALIZED')) return { pass: true, failures: [] };
      return { pass: true, failures: [], normalized: `${body}\nNORMALIZED` };
    },
  });
  r.register({
    id: 'downstream',
    validate: ({ body }) => {
      seen.push(body);
      return { pass: true, failures: [] };
    },
  });
  const res = r.runAll({ body: 'orig' });
  assert.equal(res.pass, true);
  // Downstream saw the normalized body, not the original.
  assert.equal(seen.length, 1);
  assert.match(seen[0], /NORMALIZED/);
  // The aggregate reports the rewritten body.
  assert.match(res.normalizedBody, /orig\nNORMALIZED/);
});

test('normalizedBody is undefined when no normalizer changed the body', () => {
  const r = createRegistry();
  r.register(pass('a'));
  const res = r.runAll({ body: 'unchanged' });
  assert.equal(res.normalizedBody, undefined);
});
