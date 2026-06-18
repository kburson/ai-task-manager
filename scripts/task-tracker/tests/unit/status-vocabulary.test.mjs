#!/usr/bin/env node
// @story #209
// Regression for #209 — sub-agent status verb vocabulary.
//
// Asserts the parallel.md Status Reporting table encodes the distinction
// between `HUMAN_APPROVED` (human ran /task approve after reading the diff)
// and `HUMAN_AUTHORIZED_AI_APPROVED` (human pre-authorized the gate-keeper;
// agent ran auto-approve under TT_FULL_AUTO=1 or single-gate-disable).
//
// The verbs are behavioral labels consumed by orchestrator agents reading
// parallel.md — no code-level parser exists. The contract being asserted
// here IS the spec text in skill/shared/rules/parallel.md.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dir, '..', '../../..');
const parallelMd = readFileSync(path.join(root, 'skill', 'shared', 'rules', 'parallel.md'), 'utf8');
const guideMd = readFileSync(path.join(root, 'docs', 'guides', 'parallel-agents.md'), 'utf8');

// ── 1. FULL_AUTO path: HUMAN_AUTHORIZED_AI_APPROVED row exists and is wired
//      to TT_FULL_AUTO / single-gate-disable, and maps to the same close
//      orchestrator action as HUMAN_APPROVED.
const aiApprovedRowMatch = parallelMd
  .split('\n')
  .find((line) => line.includes('`HUMAN_AUTHORIZED_AI_APPROVED`'));
assert.ok(
  aiApprovedRowMatch,
  'parallel.md must contain a Status Reporting row for `HUMAN_AUTHORIZED_AI_APPROVED`'
);
assert.ok(
  /TT_FULL_AUTO|single-gate-disable/.test(aiApprovedRowMatch),
  'HUMAN_AUTHORIZED_AI_APPROVED row must reference TT_FULL_AUTO or single-gate-disable as the authorizing condition'
);
assert.ok(
  /\/task close/.test(aiApprovedRowMatch),
  'HUMAN_AUTHORIZED_AI_APPROVED row must instruct the orchestrator to run `/task close`'
);

// ── 2. Non-FULL_AUTO human-approval path: HUMAN_APPROVED row exists and is
//      narrowed to "explicitly ran /task approve after reading the diff" and
//      explicitly forbids sub-agents under TT_FULL_AUTO=1 from emitting it.
// The HUMAN_APPROVED row starts with `| \`HUMAN_APPROVED\`` (cell boundary);
// the HUMAN_AUTHORIZED_AI_APPROVED row starts with `| \`HUMAN_AUTHORIZED_AI_APPROVED\``.
// Anchor on the leading cell to pick the right row even though it may
// cross-reference the other verb in its description.
const humanApprovedRow = parallelMd.split('\n').find((line) => /^\|\s*`HUMAN_APPROVED`/.test(line));
assert.ok(
  humanApprovedRow,
  'parallel.md must still contain a Status Reporting row for `HUMAN_APPROVED`'
);
assert.ok(
  /explicitly ran/i.test(humanApprovedRow) || /eyes on the diff/i.test(humanApprovedRow),
  'HUMAN_APPROVED row must be narrowed to "explicitly ran /task approve" (or equivalent eyes-on-the-diff wording)'
);
assert.ok(
  /MUST NOT emit|must not emit/.test(humanApprovedRow),
  'HUMAN_APPROVED row must explicitly forbid sub-agents under TT_FULL_AUTO from emitting it'
);
assert.ok(
  /\/task close/.test(humanApprovedRow),
  'HUMAN_APPROVED row must still map to `/task close` (terminal success equivalent to HUMAN_AUTHORIZED_AI_APPROVED)'
);

// ── 3. Docs rationale — parallel-agents.md must explain the distinction with
//      the "human eyes on the diff" framing.
assert.ok(
  /human eyes on the diff/i.test(guideMd),
  'docs/guides/parallel-agents.md must include the "human eyes on the diff" rationale paragraph'
);
assert.ok(
  /HUMAN_AUTHORIZED_AI_APPROVED/.test(guideMd) && /HUMAN_APPROVED/.test(guideMd),
  'parallel-agents.md rationale must name both status verbs'
);

// ── 4. Exhaustive grep audit — every remaining HUMAN_APPROVED/HUMAN_AUTHORIZED
//      reference in skill/, scripts/, docs/, templates/ must be in one of the
//      three audited buckets. Any unclassified hit fails closed.
const grepRaw = execFileSync(
  'git',
  [
    'grep',
    '-nE',
    'HUMAN_APPROVED|HUMAN_AUTHORIZED',
    '--',
    'skill/**',
    'scripts/**',
    'docs/**',
    'templates/**',
  ],
  { cwd: root, encoding: 'utf8' }
);
const lines = grepRaw.split('\n').filter((l) => l.length > 0);
const allowedPrefixes = [
  'skill/shared/rules/parallel.md:',
  'docs/guides/parallel-agents.md:',
  'scripts/task-tracker/tests/unit/status-vocabulary.test.mjs:',
];
for (const line of lines) {
  const ok = allowedPrefixes.some((p) => line.startsWith(p));
  assert.ok(
    ok,
    `unaudited HUMAN_APPROVED/HUMAN_AUTHORIZED reference — must be classified in #209 deep-dive or removed: ${line}`
  );
}

console.log(`status-vocabulary.test.mjs: all passed (${lines.length} grep hits classified)`);
