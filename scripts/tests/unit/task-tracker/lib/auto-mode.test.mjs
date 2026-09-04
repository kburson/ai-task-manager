#!/usr/bin/env node
// @story #89 #1512
// Session-scoped auto-mode toggles with Full-Auto defaults.
//
// Covers load/save, additive choices, Full-Auto defaults, legacy hydration,
// prompt retirement, precedence, orphan cleanup, and concurrent isolation.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';

import {
  loadSession,
  saveSession,
  applyChoice,
  sweepOrphans,
  sessionFilePath,
} from '../../../../task-tracker/lib/session-store.mjs';
import { DEFAULTS } from '../../../../task-tracker/config.mjs';
import { resolveGate } from '../../../../task-tracker/lib/gate-resolve.mjs';
import { reviewNeedsHumanApproval } from '../../../../task-tracker/verbs/review.mjs';

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

test('new sessions and project defaults are Full-Auto for all three review boundaries', () => {
  assert.equal(DEFAULTS.gateAnalysisToDevelopment, false);
  assert.equal(DEFAULTS.gatePullRequestReview, false);
  assert.equal(DEFAULTS.gateReviewToDone, false);
  assert.equal(resolveGate('analysisToDevelopment', { projectConfig: {} }), false);
  assert.equal(resolveGate('pullRequestReview', { projectConfig: {} }), false);
  assert.equal(resolveGate('reviewToDone', { projectConfig: {} }), false);
});

test('explicit project policy remains authoritative over Full-Auto defaults', () => {
  const proj = {
    gateAnalysisToDevelopment: true,
    gatePullRequestReview: true,
    gateReviewToDone: true,
  };
  assert.equal(resolveGate('analysisToDevelopment', { projectConfig: proj }), true);
  assert.equal(resolveGate('pullRequestReview', { projectConfig: proj }), true);
  assert.equal(resolveGate('reviewToDone', { projectConfig: proj }), true);
});

test('legacy two-gate project config keeps explicit values and defaults PR review to auto', () => {
  const proj = { gateAnalysisToDevelopment: false, gateReviewToDone: true };
  assert.equal(resolveGate('analysisToDevelopment', { projectConfig: proj }), false);
  assert.equal(resolveGate('pullRequestReview', { projectConfig: proj }), false);
  assert.equal(resolveGate('reviewToDone', { projectConfig: proj }), true);
});

test('legacy parent metadata survives session round trips without changing gate values', () => {
  const fs = memFs();
  const dir = '.claude';
  let state = loadSession('sid-A', { fs, dir });
  state = applyChoice(state, 'both', { parent: '61' });
  saveSession(state, { fs, dir });
  const reloaded = loadSession('sid-A', { fs, dir });
  assert.equal(reloaded.lastPromptedParent, '61');
  assert.equal(reloaded.gates.analysisToDevelopment, false);
  assert.equal(reloaded.gates.pullRequestReview, false);
  assert.equal(reloaded.gates.reviewToDone, false);
});

test('binding source contains no legacy first-bind auto-mode prompt', () => {
  const source = readFileSync(
    new URL('../../../../task-tracker/verbs/switch.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /PROMPT_REQUIRED: auto-mode/);
  assert.doesNotMatch(source, /bothGatesExplicit/);
});

// Case 5 — /task auto reset clears override AND lastPromptedParent.
test('reset clears all three overrides and returns to Full-Auto defaults', () => {
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
  assert.equal(reloaded.gates.pullRequestReview, null);
  assert.equal(reloaded.gates.reviewToDone, null);
  assert.equal(reloaded.lastPromptedParent, null);
  // After reset, resolveGate falls back to project / default.
  assert.equal(
    resolveGate('analysisToDevelopment', { session: reloaded, projectConfig: {} }),
    false
  );
  assert.equal(resolveGate('pullRequestReview', { session: reloaded, projectConfig: {} }), false);
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

test('fresh and legacy session files hydrate the third nullable override', () => {
  const fs = memFs();
  const state = loadSession('sid-fresh', { fs, dir: '.claude' });
  assert.equal(state.lastPromptedParent, null);
  assert.equal(state.gates.analysisToDevelopment, null);
  assert.equal(state.gates.pullRequestReview, null);
  assert.equal(state.gates.reviewToDone, null);
  assert.equal(resolveGate('analysisToDevelopment', { session: state, projectConfig: {} }), false);

  const legacyPath = sessionFilePath('sid-legacy', '.claude');
  fs._files.set(legacyPath, {
    content: JSON.stringify({
      sessionId: 'sid-legacy',
      gates: { analysisToDevelopment: true, reviewToDone: false },
    }),
    mtimeMs: Date.now(),
  });
  const legacy = loadSession('sid-legacy', { fs, dir: '.claude' });
  assert.equal(legacy.gates.analysisToDevelopment, true);
  assert.equal(legacy.gates.pullRequestReview, null);
  assert.equal(legacy.gates.reviewToDone, false);
});

test('manual and auto choices update one gate additively', () => {
  let state = { gates: {}, lastPromptedParent: null };
  state = applyChoice(state, 'manual-plan');
  assert.deepEqual(state.gates, {
    analysisToDevelopment: true,
    pullRequestReview: null,
    reviewToDone: null,
  });
  state = applyChoice(state, 'manual-code');
  state = applyChoice(state, 'manual-task');
  assert.deepEqual(state.gates, {
    analysisToDevelopment: true,
    pullRequestReview: true,
    reviewToDone: true,
  });
  state = applyChoice(state, 'auto-code');
  assert.deepEqual(state.gates, {
    analysisToDevelopment: true,
    pullRequestReview: false,
    reviewToDone: true,
  });
});

// Bonus — session override beats project config (precedence: session > project > default).
test('precedence: session override takes precedence over project config', () => {
  const session = {
    sessionId: 'x',
    lastPromptedParent: null,
    gates: { analysisToDevelopment: true, pullRequestReview: true, reviewToDone: false },
    updatedAt: '',
  };
  const proj = {
    gateAnalysisToDevelopment: false,
    gatePullRequestReview: false,
    gateReviewToDone: true,
  };
  assert.equal(resolveGate('analysisToDevelopment', { session, projectConfig: proj }), true);
  assert.equal(resolveGate('pullRequestReview', { session, projectConfig: proj }), true);
  assert.equal(resolveGate('reviewToDone', { session, projectConfig: proj }), false);
});

test('Review handoff honors the session final-task override over project policy', () => {
  const projectConfig = { gateReviewToDone: true };
  assert.equal(
    reviewNeedsHumanApproval({
      cfg: projectConfig,
      env: {},
      session: { gates: { reviewToDone: false } },
    }),
    false
  );
  assert.equal(
    reviewNeedsHumanApproval({
      cfg: { gateReviewToDone: false },
      env: {},
      session: { gates: { reviewToDone: true } },
    }),
    true
  );
});
