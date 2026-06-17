#!/usr/bin/env node
// @story #405
// AC1 coverage for #405: binding to an issue whose body carries a visible
// `{discuss}` token must (a) print a `DISCUSS REQUESTED — #N` banner gated on
// hasDiscussMarker, and (b) be matched by a rules/bind.md clause directing the
// agent to brainstorm BEFORE any deep-dive/refine step and to call
// finalizeDiscussion on resolution.
//
// The banner emit lives in verbSwitch (side-effecting, gh/state-backed), and
// the bind directive lives in authored docs; both are asserted here against the
// shipped sources so AC1 has a real automated check rather than a manual one.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

// (a) switch.mjs wiring: banner string + hasDiscussMarker gate.
const switchSrc = readFileSync(
  path.join(repoRoot, 'scripts/task-tracker/verbs/switch.mjs'),
  'utf8'
);
assert.ok(
  /hasDiscussMarker/.test(switchSrc),
  'switch.mjs must gate the banner on hasDiscussMarker'
);
assert.ok(
  /DISCUSS REQUESTED — \$\{target\}/.test(switchSrc),
  'switch.mjs must emit a `DISCUSS REQUESTED — #N` banner interpolating the bound issue'
);
const gateIdx = switchSrc.indexOf('hasDiscussMarker(body)');
const bannerIdx = switchSrc.indexOf('DISCUSS REQUESTED');
assert.ok(
  gateIdx >= 0 && bannerIdx >= 0 && gateIdx < bannerIdx,
  'the DISCUSS REQUESTED banner must be emitted inside the hasDiscussMarker(body) guard'
);

// (b) bind.md directive: brainstorm-before-refine + finalizeDiscussion.
const bindMd = readFileSync(path.join(repoRoot, 'skill/shared/rules/bind.md'), 'utf8');
assert.ok(/\{discuss\}/.test(bindMd), 'bind.md must document the {discuss} trigger');
assert.ok(
  /brainstorm/i.test(bindMd),
  'bind.md must instruct the agent to brainstorm on a DISCUSS REQUESTED bind'
);
assert.ok(
  /before\b[\s\S]{0,40}(deep-dive|refine)/i.test(bindMd),
  'bind.md must order the brainstorm BEFORE any deep-dive/refine step'
);
assert.ok(
  /finalizeDiscussion/.test(bindMd),
  'bind.md must direct calling finalizeDiscussion to consume the token on resolution'
);

console.log('discuss-banner-wiring.test.mjs: all passed');
