// @story #667 #1011 #1023
// Drift guard for the `/task help` surface.
//
// The single source of truth for "what verbs exist" is the `switch (ctx.verb)`
// block in task-tracker.mjs — its `case '<verb>':` labels. This test parses
// that source to derive the LIVE registry, then asserts the help data documents
// every dispatched verb. Adding a verb to the router without a VERB_REFERENCE
// entry therefore fails here — help cannot silently drift from behavior.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { verbHelp, resolveVerb } from '../../../../task-tracker/verbs/help.mjs';
import {
  VERB_REFERENCE,
  TOPICS,
  STATE_TRANSITIONS,
  GATE_EVIDENCE_MODEL,
} from '../../../../task-tracker/verbs/help-data.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTER = join(__dirname, '../../../../task-tracker/task-tracker.mjs');
const REPO_ROOT = join(__dirname, '../../../../..');
const AITM = join(REPO_ROOT, 'bin', 'aitm.mjs');

// Invoke the real `aitm` wrapper as a child so the routing test exercises the
// actual `/task help` entrypoint, not just the in-process renderer.
function aitm(args) {
  return spawnSync(process.execPath, [AITM, ...args], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
}

// Labels that are dispatched but intentionally NOT documented as standalone
// reference pages. `move` is an explicit error stub that directs callers to
// promote/demote; advertising a full page would invent a callable route.
const ALIAS_OR_STUB = new Set(['move']);

function liveVerbsFromRouter() {
  const src = readFileSync(ROUTER, 'utf8');
  const labels = [...src.matchAll(/case '([^']+)':/g)].map((m) => m[1]);
  return [...new Set(labels)];
}

// Capture console.log output of a thunk.
function capture(thunk) {
  const orig = console.log;
  const out = [];
  console.log = (...args) => out.push(args.join(' '));
  try {
    thunk();
  } finally {
    console.log = orig;
  }
  return out.join('\n');
}

test('(a) every dispatched verb has a VERB_REFERENCE entry', () => {
  const live = liveVerbsFromRouter();
  assert.ok(live.length > 20, `expected to parse the router registry, got ${live.length} labels`);
  // A live verb is documented if it has its own entry OR resolves to one via
  // an alias (e.g. `next` → `promote`, `?` → `help`).
  const missing = live.filter((v) => !ALIAS_OR_STUB.has(v) && resolveVerb(v) === null);
  assert.deepEqual(missing, [], `verbs dispatched but undocumented: ${missing.join(', ')}`);
});

test('standalone commands never resolve as /task verbs', () => {
  assert.equal(resolveVerb('create-issue'), null);
  assert.equal(resolveVerb('value-report'), null);
});

test('(b) every entry has a non-empty usage and >=1 example', () => {
  for (const [key, e] of Object.entries(VERB_REFERENCE)) {
    assert.ok(typeof e.usage === 'string' && e.usage.trim(), `${key}: missing usage`);
    assert.ok(Array.isArray(e.examples) && e.examples.length >= 1, `${key}: needs >=1 example`);
    for (const ex of e.examples) {
      assert.ok(typeof ex === 'string' && ex.trim(), `${key}: empty example`);
    }
    assert.ok(typeof e.summary === 'string' && e.summary.trim(), `${key}: missing summary`);
    assert.ok(
      TOPICS.some((t) => t.key === e.topic),
      `${key}: topic "${e.topic}" is not a known TOPIC`
    );
  }
});

test('(c) declared flags are well-formed', () => {
  for (const [key, e] of Object.entries(VERB_REFERENCE)) {
    if (!e.flags) continue;
    assert.ok(Array.isArray(e.flags), `${key}: flags must be an array`);
    for (const f of e.flags) {
      assert.ok(typeof f.flag === 'string' && f.flag.trim(), `${key}: empty flag name`);
      assert.ok(typeof f.desc === 'string' && f.desc.trim(), `${key}: flag ${f.flag} missing desc`);
    }
  }
});

test('(d) top-level help contains the state-transition map and gate/evidence headers', () => {
  const out = capture(() => verbHelp());
  assert.match(out, /State-transition map/i);
  for (const t of STATE_TRANSITIONS) {
    assert.ok(out.includes(`${t.from} → ${t.to}`), `state map missing edge ${t.from}→${t.to}`);
  }
  assert.match(out, /Gate & evidence model/i);
  for (const block of GATE_EVIDENCE_MODEL) {
    assert.ok(out.includes(block.heading), `gate/evidence section missing "${block.heading}"`);
  }
  // topic grouping is present
  for (const topic of TOPICS) {
    assert.ok(out.includes(topic.title), `top-level help missing topic "${topic.title}"`);
  }
});

test('(e) per-verb help names the requested verb and shows exit codes', () => {
  for (const key of Object.keys(VERB_REFERENCE)) {
    const out = capture(() => verbHelp(key));
    assert.ok(out.includes(key), `help for "${key}" does not name the verb`);
    assert.match(out, /Exit codes:/, `help for "${key}" omits exit codes`);
    assert.match(out, /Examples:/, `help for "${key}" omits examples`);
  }
});

test('Shelve help documents the narrow schema-1 stale-blocker migration', () => {
  const out = capture(() => verbHelp('shelve'));
  assert.match(out, /--refresh-stale-blockers/);
  assert.match(out, /schema-1 blocker migration/i);
  assert.match(out, /not a general stale-snapshot repair/i);
});

test('Park help omits the Shelve-only stale-blocker migration flag', () => {
  const out = capture(() => verbHelp('park'));
  assert.doesNotMatch(out, /refresh-stale-blockers/);
});

test('(f) the aitm wrapper routes every user-facing help form to verbHelp', () => {
  // `aitm help` / bare `aitm` → orchestrator index PLUS the /task verb
  // reference (topics + state map + gate model) appended.
  for (const argv of [['help'], []]) {
    const r = aitm(argv);
    assert.equal(r.status, 0, `exit for ${JSON.stringify(argv)}`);
    assert.match(r.stdout, /State-transition map/i, `${JSON.stringify(argv)}: state map`);
    assert.match(r.stdout, /Gate & evidence model/i, `${JSON.stringify(argv)}: gate model`);
    for (const t of TOPICS) {
      assert.ok(r.stdout.includes(t.title), `${JSON.stringify(argv)}: topic "${t.title}"`);
    }
    // #413 registry contract still holds: names-only, script groups present.
    assert.match(r.stdout, /Workflow verbs/, 'orchestrator index retained');
    assert.ok(!r.stdout.includes('node_modules'), 'no node_modules leak');
  }

  // `aitm help <verb>` and `aitm <verb> help` and `aitm <verb> --help` all reach
  // the per-verb page for a representative flag-bearing verb.
  for (const argv of [
    ['help', 'refine'],
    ['refine', 'help'],
    ['refine', '--help'],
  ]) {
    const r = aitm(argv);
    assert.equal(r.status, 0, `exit for ${JSON.stringify(argv)}`);
    assert.match(r.stdout, /\/task refine —/, `${JSON.stringify(argv)}: names refine`);
    assert.match(r.stdout, /Exit codes:/, `${JSON.stringify(argv)}: exit codes`);
    assert.match(r.stdout, /--size <XS\|S\|M\|L\|XL>/, `${JSON.stringify(argv)}: flags`);
  }
});

test('resolveVerb follows aliases to canonical keys', () => {
  assert.equal(resolveVerb('next'), 'promote');
  assert.equal(resolveVerb('end'), 'close');
  assert.equal(resolveVerb('story'), 'user-story');
  assert.equal(resolveVerb('?'), 'help');
  assert.equal(resolveVerb('brainstorm'), 'discover');
  assert.equal(resolveVerb('nonexistent-verb'), null);
  assert.equal(resolveVerb(''), null);
  assert.equal(resolveVerb(undefined), null);
});
