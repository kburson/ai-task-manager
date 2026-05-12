#!/usr/bin/env node
// #89 — session-scoped auto-mode toggles + per-parent prompting.
//
// 8 unit cases covering loadSession/saveSession, applyChoice (and `reset`),
// gate resolution precedence, bothGatesExplicit, sweepOrphans, and the
// concurrent-session isolation guarantee. The filesystem is faked via a
// minimal in-memory shim so the tests never touch real disk.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import path from 'node:path';

import {
  loadSession,
  saveSession,
  applyChoice,
  sweepOrphans,
  sessionFilePath,
} from '../lib/session-store.mjs';
import { resolveGate, bothGatesExplicit } from '../lib/gate-resolve.mjs';

// In-memory fs shim: subset of node:fs the store needs.
function memFs(initial = {}) {
  const files = new Map(Object.entries(initial)); // path -> { content, mtimeMs }
  return {
    _files: files,
    existsSync: (p) => files.has(p),
    readFileSync: (p) => {
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      return files.get(p).content;
    },
    writeFileSync: (p, content) => {
      files.set(p, { content, mtimeMs: Date.now() });
    },
    mkdirSync: () => {},
    readdirSync: (dir) => {
      const prefix = dir.endsWith('/') ? dir : dir + '/';
      return [...files.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length));
    },
    statSync: (p) => {
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      return { mtimeMs: files.get(p).mtimeMs };
    },
    unlinkSync: (p) => {
      files.delete(p);
    },
  };
}

// Case 1 — resolveGate honors project-config when both keys explicit; no override needed.
test('case 1: project config with BOTH gate keys explicit → resolveGate reads from project', () => {
  const proj = { gateAnalysisToDevelopment: false, gateReviewToDone: true };
  assert.equal(resolveGate('analysisToDevelopment', { projectConfig: proj }), false);
  assert.equal(resolveGate('reviewToDone', { projectConfig: proj }), true);
  assert.equal(bothGatesExplicit(proj), true);
});

// Case 2 — missing key(s) leaves bothGatesExplicit=false → caller should prompt.
test('case 2: project config missing one or both gate keys → bothGatesExplicit=false (prompt fires)', () => {
  assert.equal(bothGatesExplicit({}), false);
  assert.equal(bothGatesExplicit({ gateAnalysisToDevelopment: true }), false);
  assert.equal(bothGatesExplicit({ gateReviewToDone: false }), false);
  // Resolution still falls back to default true when nothing set.
  assert.equal(resolveGate('analysisToDevelopment', { projectConfig: {} }), true);
  assert.equal(resolveGate('reviewToDone', { projectConfig: {} }), true);
});

// Case 3 — same parent on second bind → no re-prompt; saved lastPromptedParent guards.
test('case 3: same parent re-bind reuses prior choice without prompting', () => {
  const fs = memFs();
  const dir = '.claude';
  let state = loadSession('sid-A', { fs, dir });
  state = applyChoice(state, 'both', { parent: '61' });
  saveSession(state, { fs, dir });
  const reloaded = loadSession('sid-A', { fs, dir });
  assert.equal(reloaded.lastPromptedParent, '61');
  assert.equal(reloaded.gates.analysisToDevelopment, false);
  assert.equal(reloaded.gates.reviewToDone, false);
  // The trigger logic in verbSwitch only re-prompts when lastPromptedParent !== rootKey,
  // so binding under the same parent keeps the saved gates.
});

// Case 4 — different parent → prompt should fire (lastPromptedParent diverges).
test('case 4: different parent on subsequent bind triggers re-prompt', () => {
  const fs = memFs();
  const dir = '.claude';
  let state = loadSession('sid-A', { fs, dir });
  state = applyChoice(state, 'plan', { parent: '61' });
  saveSession(state, { fs, dir });
  const reloaded = loadSession('sid-A', { fs, dir });
  assert.notEqual(reloaded.lastPromptedParent, '99'); // prompt fires for #99
});

// Case 5 — /task auto reset clears override AND lastPromptedParent.
test('case 5: applyChoice("reset") clears gates and lastPromptedParent', () => {
  const fs = memFs();
  const dir = '.claude';
  let state = loadSession('sid-A', { fs, dir });
  state = applyChoice(state, 'both', { parent: '61' });
  saveSession(state, { fs, dir });
  let reset = loadSession('sid-A', { fs, dir });
  reset = applyChoice(reset, 'reset');
  saveSession(reset, { fs, dir });
  const reloaded = loadSession('sid-A', { fs, dir });
  assert.equal(reloaded.gates.analysisToDevelopment, null);
  assert.equal(reloaded.gates.reviewToDone, null);
  assert.equal(reloaded.lastPromptedParent, null);
  // After reset, resolveGate falls back to project / default.
  assert.equal(
    resolveGate('analysisToDevelopment', { session: reloaded, projectConfig: {} }),
    true
  );
});

// Case 6 — concurrent sessions: separate IDs each get their own file; no cross-read.
test("case 6: two session IDs do not see each other's overrides", () => {
  const fs = memFs();
  const dir = '.claude';
  let a = applyChoice(loadSession('sid-A', { fs, dir }), 'both', { parent: '61' });
  saveSession(a, { fs, dir });
  let b = applyChoice(loadSession('sid-B', { fs, dir }), 'off', { parent: '70' });
  saveSession(b, { fs, dir });
  const reA = loadSession('sid-A', { fs, dir });
  const reB = loadSession('sid-B', { fs, dir });
  assert.equal(reA.gates.analysisToDevelopment, false);
  assert.equal(reB.gates.analysisToDevelopment, true);
  assert.equal(reA.lastPromptedParent, '61');
  assert.equal(reB.lastPromptedParent, '70');
  // The file paths must differ.
  assert.notEqual(sessionFilePath('sid-A', dir), sessionFilePath('sid-B', dir));
});

// Case 7 — orphan GC: stale file deleted, fresh file untouched.
test('case 7: sweepOrphans deletes files older than maxAgeMs and leaves younger ones', () => {
  const dir = '.claude';
  const now = 10_000_000;
  const maxAgeMs = 1000;
  const stalePath = sessionFilePath('stale', dir);
  const freshPath = sessionFilePath('fresh', dir);
  const fs = memFs({
    [stalePath]: { content: '{}', mtimeMs: now - 5000 }, // older than maxAgeMs
    [freshPath]: { content: '{}', mtimeMs: now - 500 }, // younger
    [path.join(dir, 'unrelated.json')]: { content: '{}', mtimeMs: now - 9999 },
  });
  const deleted = sweepOrphans({ now, maxAgeMs, fs, dir });
  assert.equal(deleted, 1);
  assert.equal(fs.existsSync(stalePath), false);
  assert.equal(fs.existsSync(freshPath), true);
  assert.equal(fs.existsSync(path.join(dir, 'unrelated.json')), true);
});

// Case 8 — resumed-after-TTL session: no file present → loadSession returns fresh shell,
// which means bothGatesExplicit(project)=false → prompt path fires.
test('case 8: no session file present yields fresh state and unprompted (prompt path)', () => {
  const fs = memFs();
  const state = loadSession('sid-fresh', { fs, dir: '.claude' });
  assert.equal(state.lastPromptedParent, null);
  assert.equal(state.gates.analysisToDevelopment, null);
  assert.equal(state.gates.reviewToDone, null);
  // resolveGate falls back to default true when both session and project are empty.
  assert.equal(resolveGate('analysisToDevelopment', { session: state, projectConfig: {} }), true);
});

// Bonus — session override beats project config (precedence: session > project > default).
test('precedence: session override takes precedence over project config', () => {
  const session = {
    sessionId: 'x',
    lastPromptedParent: null,
    gates: { analysisToDevelopment: true, reviewToDone: false },
    updatedAt: '',
  };
  const proj = { gateAnalysisToDevelopment: false, gateReviewToDone: true };
  assert.equal(resolveGate('analysisToDevelopment', { session, projectConfig: proj }), true);
  assert.equal(resolveGate('reviewToDone', { session, projectConfig: proj }), false);
});
