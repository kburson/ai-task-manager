// @story #527
// #527 AC1/AC2 — the fabrication-guard trust-boundary decision record exists and
// is complete. #527 is a spike/decision-record child resolving the fork deferred
// from #522: is `evidenceStamp: true` flag-sufficient, or must the guard
// re-derive the run record? This grep test pins the record's required sections
// so the threat model, the chosen option + rationale, and the resolved outcome
// can't be silently dropped in a later edit.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOC = fileURLToPath(
  new URL('../../../../docs/guides/fabrication-guard-trust-boundary.md', import.meta.url)
);

test('the decision record exists', () => {
  assert.ok(existsSync(DOC), `expected decision record at ${DOC}`);
});

test('states the threat model (who can set evidenceStamp, what re-derivation closes)', () => {
  const src = readFileSync(DOC, 'utf8');
  assert.match(src, /##?\s*Threat model/i);
  assert.match(src, /evidenceStamp/);
  // names the sanctioned stamper set that is the trust boundary
  assert.match(src, /ac-stamp/);
  assert.match(src, /sandbox auto-stamp/i);
});

test('records the chosen option (flag-sufficient) with rationale', () => {
  const src = readFileSync(DOC, 'utf8');
  assert.match(src, /##?\s*Decision/i);
  assert.match(src, /flag-sufficient/i);
  // the core rationale: re-derivation moves the trust boundary, not eliminates it
  assert.match(src, /moves the (trust )?boundary/i);
});

test('resolves to exactly one outcome — a follow-up issue filed and linked under #521', () => {
  const src = readFileSync(DOC, 'utf8');
  // outcome (a): a follow-up implementation issue is filed and linked under #521.
  assert.match(src, /#521/);
  // a concrete follow-up issue reference distinct from this issue and the epic.
  const refs = [...src.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
  const followUp = refs.find((n) => n !== 521 && n !== 527 && n !== 522 && n !== 516);
  assert.ok(
    followUp,
    'expected a follow-up implementation issue number (not #516/#521/#522/#527) in the record'
  );
});
