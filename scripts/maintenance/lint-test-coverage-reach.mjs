#!/usr/bin/env node
// #866 — Lint runner: reject test files that exercise no code in this repo.
//
// A `*.test.mjs` must exercise code under `scripts/`. A test that references no
// repo source module — no import of, and no spawned/resolved path to, any
// non-test `.mjs` — cannot appear in the c8 coverage report (`.c8rc.json`
// scopes `src` to `scripts/` with `all: true`), so it costs a process spawn on
// every full run and proves nothing about the product. This runner surfaces
// every such file. See ./lint-test-coverage-reach-detector.mjs for the detector and
// its DEFAULT-ALLOW-on-ambiguity rationale (reach != import: CLI tests reach
// product code by spawning it, which c8 still measures).
//
// BASELINE / RATCHET. Roughly three dozen such tests already exist; rewriting or
// deleting them is out of #866's scope, but the lint must not be tuned blind to
// them (issue AC: report every current offender). So the runner ALWAYS prints
// every offender it finds, and enumerates the known-pre-existing set in
// lint-test-coverage-reach.baseline.json. It exits 1 only when a NEW offender
// (one not in the baseline) appears — a freshly-added freeloader. Fix the new
// test; do not append it to the baseline to silence the lint. The baseline
// entries are a follow-up triage backlog, not a permanent allowlist.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverTestFiles } from '../task-tracker/lib/discover-test-files.mjs';
import { findNoReachTestFiles } from './lint-test-coverage-reach-detector.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(HERE, 'lint-test-coverage-reach.baseline.json');

function loadBaseline() {
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    return new Set(Array.isArray(parsed?.files) ? parsed.files : []);
  } catch {
    return new Set();
  }
}

// Canonical discovery (#874): the single source of truth for the `*.test.mjs`
// set under scripts/. Replaces this runner's private `find` shell-out so it can
// never drift from the enumerator every other consumer uses.
const files = discoverTestFiles().map((rel) => ({
  path: rel,
  src: readFileSync(rel, 'utf8'),
}));

const baseline = loadBaseline();
const offenders = findNoReachTestFiles(files);
const newOffenders = offenders.filter((o) => !baseline.has(o.file));

// Always surface every offender — the baseline never blinds the detector.
if (offenders.length) {
  process.stderr.write(
    `lint:test-reach — ${offenders.length} test file(s) exercise no repo source ` +
      `(${baseline.size} baselined, ${newOffenders.length} new):\n`
  );
  for (const o of offenders) {
    const tag = baseline.has(o.file) ? 'baseline' : 'NEW';
    process.stderr.write(`  [${tag}] ${o.file}\n`);
  }
}

if (newOffenders.length) {
  process.stderr.write(
    `\nlint:test-reach FAILED — ${newOffenders.length} new test file(s) exercise no ` +
      `code in this repo:\n`
  );
  for (const o of newOffenders) {
    process.stderr.write(`  ${o.file}: ${o.message}\n`);
  }
  process.stderr.write(
    `\nFix: make the test exercise a module under scripts/ (import it, or spawn ` +
      `it via execFileSync('node', ['scripts/...'])), or convert its assertions ` +
      `to a lint (as #852 did), or delete it. Do NOT add it to ` +
      `${path.relative(process.cwd(), BASELINE_PATH)} to silence this gate.\n`
  );
  process.exit(1);
}

console.log(
  `lint:test-reach — ${files.length} test file(s) scanned, ${offenders.length} ` +
    `baselined offender(s), 0 new`
);
