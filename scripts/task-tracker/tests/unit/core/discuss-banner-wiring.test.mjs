#!/usr/bin/env node
// @story #405 #495
// AC1 coverage for #405 + #495: binding to an issue whose body carries a visible
// `{discuss}` token must (a) print a 💬-led `DISCUSSION REQUESTED — #N` banner via
// the shared formatter gated on `pending`, (a2) emit the shared ✅ end banner from
// BOTH conclusion paths (finalizeDiscussion + check.mjs's discussion-complete
// branch), and (b) be matched by a rules/bind.md clause directing the agent to
// brainstorm BEFORE any deep-dive/refine step, to call finalizeDiscussion on
// resolution, and documenting the 💬/✅ chat-delimiter convention.
//
// The banner emit lives in verbSwitch (side-effecting, gh/state-backed), and
// the bind directive lives in authored docs; both are asserted here against the
// shipped sources so AC1 has a real automated check rather than a manual one.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

// (a) switch.mjs wiring: #486 — bind reconciles (converge body + sync label) via
// reconcileDiscuss, then gates the banner on the returned `pending` state. #495 —
// the banner text is produced by the shared `formatDiscussStartBanner` formatter
// (no inline string), so assert the CALL sits inside the `if (pending)` guard.
const switchSrc = readFileSync(
  path.join(repoRoot, 'scripts/task-tracker/verbs/switch.mjs'),
  'utf8'
);
assert.ok(
  /reconcileDiscuss/.test(switchSrc),
  'switch.mjs must reconcile discuss state at bind via reconcileDiscuss'
);
assert.ok(
  /formatDiscussStartBanner\(target\)/.test(switchSrc),
  'switch.mjs must emit the start banner via the shared formatDiscussStartBanner(target)'
);
assert.ok(
  !/DISCUSS REQUESTED/.test(switchSrc),
  'switch.mjs must no longer carry the old plain `DISCUSS REQUESTED` text'
);
const gateIdx = switchSrc.indexOf('if (pending)');
const callIdx = switchSrc.indexOf('formatDiscussStartBanner(target)');
assert.ok(
  gateIdx >= 0 && callIdx >= 0 && gateIdx < callIdx,
  'the start banner must be emitted inside the `if (pending)` guard keyed on reconcileDiscuss'
);

// (a2) #495 — the end banner must fire on BOTH conclusion paths. check.mjs's
// `"discussion complete"` branch (which calls markDiscussed directly, NOT
// finalizeDiscussion) must also emit the shared end banner.
const checkSrc = readFileSync(path.join(repoRoot, 'scripts/task-tracker/verbs/check.mjs'), 'utf8');
assert.ok(
  /formatDiscussEndBanner/.test(checkSrc),
  'check.mjs discussion-complete branch must emit the shared formatDiscussEndBanner'
);

// (b) bind.md directive: brainstorm-before-refine + finalizeDiscussion, plus the
// #495 💬/✅ chat-delimiter convention.
const bindMd = readFileSync(path.join(repoRoot, 'skill/shared/rules/bind.md'), 'utf8');
assert.ok(/\{discuss\}/.test(bindMd), 'bind.md must document the {discuss} trigger');
assert.ok(
  /brainstorm/i.test(bindMd),
  'bind.md must instruct the agent to brainstorm on a DISCUSSION REQUESTED bind'
);
assert.ok(
  /before\b[\s\S]{0,40}(deep-dive|refine)/i.test(bindMd),
  'bind.md must order the brainstorm BEFORE any deep-dive/refine step'
);
assert.ok(
  /finalizeDiscussion/.test(bindMd),
  'bind.md must direct calling finalizeDiscussion to consume the token on resolution'
);
assert.ok(
  /💬[\s\S]*✅/.test(bindMd),
  'bind.md must document the 💬 start / ✅ end chat-delimiter convention'
);

console.log('discuss-banner-wiring.test.mjs: all passed');
