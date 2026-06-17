#!/usr/bin/env node
// #442 — Lint runner for the scoped fleet-sandbox-isolation guard.
//
// Scans all test files under scripts/ and fails if any fleet-registering test
// creates a sandbox with bare `mkdtempSync(projectScratchDir(...))` instead of
// `mkdtempProjectIsolated(...)`. See lib/lint-fleet-sandbox-isolation.mjs for
// the rationale and scoping rules.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

import { findFleetSandboxViolations } from '../task-tracker/lib/lint-fleet-sandbox-isolation.mjs';

const ROOT = path.resolve('scripts');

// The guard's own unit test contains fixture strings (bare-mkdtemp + a
// registering token) that would self-trip the guard. It exercises the guard via
// its exported functions, so it never creates a real sandbox — exclude it.
const ALLOWED = new Set(['lint-fleet-sandbox-isolation.test.mjs']);

const testFiles = execSync(`find ${ROOT} -type f -name '*.mjs'`, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean)
  .filter((f) => /\/tests\//.test(f))
  .filter((f) => !ALLOWED.has(path.basename(f)));

const files = testFiles.map((f) => ({
  path: path.relative(process.cwd(), path.resolve(f)),
  src: readFileSync(f, 'utf8'),
}));

const offenders = findFleetSandboxViolations(files);

if (offenders.length) {
  process.stderr.write(`lint:fleet-sandbox — ${offenders.length} violation(s):\n`);
  for (const o of offenders) {
    process.stderr.write(`  ${o.file}:${o.line}: ${o.message}\n`);
  }
  process.stderr.write(
    `\nFix: replace the bare call with mkdtempProjectIsolated(prefix) from ` +
      `scripts/task-tracker/lib/scratch-dir.mjs.\n`
  );
  process.exit(1);
}

console.log(`lint:fleet-sandbox — ${files.length} test file(s) clean`);
