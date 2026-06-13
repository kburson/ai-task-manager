#!/usr/bin/env node
// #388 — verify the deep-dive-complete relic migration landed correctly on the
// live bodies of #96, #97, #102. Exits 0 when every post-condition holds, 1
// otherwise. Used as the `aitm-verified-by` verifier for the issue's ACs.

import { execFileSync } from 'node:child_process';
import { loadConfig } from '../task-tracker/config.mjs';

const cfg = loadConfig();

function body(n) {
  return execFileSync(
    'gh',
    ['issue', 'view', String(n), '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
    { encoding: 'utf8' }
  );
}

const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const b96 = body(96);
const b97 = body(97);
const b102 = body(102);

const jsonRelic = (b) => (b.match(/aitm-deep-dive-complete:\s*\{/g) || []).length;
const canon = (b) => (b.match(/aitm-deep-dive-complete ts="/g) || []).length;

// AC5 — every marker normalized to canonical ts="..." form; no JSON relics.
for (const [n, b] of [
  [96, b96],
  [97, b97],
  [102, b102],
]) {
  check(
    jsonRelic(b) === 0,
    `#${n}: ${jsonRelic(b)} JSON-payload deep-dive-complete relic(s) remain`
  );
  check(canon(b) >= 1, `#${n}: no canonical \`aitm-deep-dive-complete ts="..."\` marker`);
}

// AC4 — #102 deduped to exactly one marker.
check(
  canon(b102) === 1,
  `#102: expected exactly 1 deep-dive-complete marker, found ${canon(b102)}`
);

// AC1/AC3 — Plan Metadata present on all three with the core fields.
for (const [n, b] of [
  [96, b96],
  [97, b97],
  [102, b102],
]) {
  check(b.includes('## Plan Metadata'), `#${n}: missing \`## Plan Metadata\` section`);
  check(/\*\*Size:\*\*/.test(b), `#${n}: Plan Metadata missing **Size:** field`);
  check(/\*\*Estimate:\*\*/.test(b), `#${n}: Plan Metadata missing **Estimate:** field`);
  check(/\*\*Priority:\*\*/.test(b), `#${n}: Plan Metadata missing **Priority:** field`);
}

// AC2 — reconciliation noted where values were derived/disagreed (#96, #97, #102).
check(/\*\*Reconciliation:\*\*/.test(b96), '#96: missing **Reconciliation:** note');
check(/\*\*Reconciliation:\*\*/.test(b97), '#97: missing **Reconciliation:** note');
check(/\*\*Reconciliation:\*\*/.test(b102), '#102: missing **Reconciliation:** note');

// AC6 — no invariant-marker loss: aitm-fields still present on all three.
for (const [n, b] of [
  [96, b96],
  [97, b97],
  [102, b102],
]) {
  check(/aitm-fields/.test(b), `#${n}: aitm-fields invariant marker lost`);
}

if (failures.length) {
  console.error(`verify-388: FAIL (${failures.length})`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('verify-388: PASS — all post-conditions hold on #96, #97, #102');
