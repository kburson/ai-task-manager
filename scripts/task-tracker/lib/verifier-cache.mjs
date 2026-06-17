// #446 (Strategy C from spike #445) — content-addressed result cache for
// heavyweight verifier suite runs.
//
// `runVerifiers` (lib/evidence-runner.mjs) executes each declared verifier with
// no memory; its callers (`ac-stamp`, `dod-stamp`) invoke it once per checkbox.
// When N Acceptance-Criteria lines plus the `tests` Functional-DoD item all
// declare the same heavyweight suite command, that suite runs N+ times at the
// identical `HEAD` against an unchanged tree — pure waste (#444 burned six full
// 292-file runs). One green run at a fixed commit already proves every one of
// those checkboxes.
//
// This module owns the cache's three concerns: eligibility (which commands may
// be cached), key derivation (normalized command + sha), and the on-disk store.
// `runVerifiers` consults it transparently when given a `cache` option, so all
// consumers benefit with no workflow or marker-format change.
//
// Genuine-evidence invariant (non-negotiable): a hit attributes the ORIGINAL
// real run to the new marker; it never fabricates a run. The store records the
// real `{cmd, exit:0, sha, ts}` of the execution that actually happened. Only
// `exit === 0` results at a clean tree are ever recorded; a non-zero result is
// never cached. Dirty tree, changed sha, or any uncertainty ⇒ miss ⇒ real run.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const STORE_VERSION = 1;

// Fail-closed eligibility allowlist. Only these exact normalized commands may be
// cached; everything else (lint, format:check, git log, unknown commands) always
// runs per marker and is never recorded. A new heavyweight suite must be added
// here deliberately. `npm run test:fast` is reserved for forward-compat (absent
// from the current package.json).
export const CACHE_ELIGIBLE_COMMANDS = Object.freeze([
  'npm run test:all',
  'npm test',
  'npm run test:slow',
  'npm run test:fast',
]);

// Trim + collapse internal runs of whitespace to single spaces. The cache key
// and the eligibility check both operate on the normalized form so that
// `  npm   test ` and `npm test` collide intentionally.
export function normalizeCommand(cmd) {
  return String(cmd || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isCacheEligible(cmd) {
  return CACHE_ELIGIBLE_COMMANDS.includes(normalizeCommand(cmd));
}

// Store key string: `${normCmd} ${sha}`. Only clean-tree results are written, so
// the clean flag is an admission precondition rather than a key dimension.
export function cacheKey(cmd, sha) {
  return `${normalizeCommand(cmd)} ${sha}`;
}

function storePath(dir) {
  return path.join(dir, 'cache', 'verifier-results.json');
}

// Read the store, tolerating a missing/corrupt file (fail-safe → empty store).
export function readStore(dir) {
  try {
    const raw = readFileSync(storePath(dir), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object') {
      return { version: STORE_VERSION, entries: {} };
    }
    return { version: STORE_VERSION, entries: parsed.entries || {} };
  } catch {
    return { version: STORE_VERSION, entries: {} };
  }
}

// Look up a cached green result for `cmd` at `sha`. Returns the recorded entry
// `{ cmd, sha, exit, ts }` or null. Only `exit === 0` entries are ever stored,
// but we re-assert it here so a hand-edited store can never inject a non-zero
// "pass".
export function lookup({ dir, cmd, sha }) {
  if (!dir || !sha || sha === 'unknown') return null;
  if (!isCacheEligible(cmd)) return null;
  const store = readStore(dir);
  const entry = store.entries[cacheKey(cmd, sha)];
  if (!entry || entry.exit !== 0) return null;
  return entry;
}

// Record a green result for `cmd` at `sha`. Prunes every entry whose sha differs
// from the current `sha` BEFORE inserting — this bounds the store to "verifiers
// green at the current commit" and makes staleness structurally impossible: a
// new commit changes the sha, every old entry is evicted on the next write, and
// reads at the new sha miss until a fresh real run records.
//
// No-ops (returns false without writing) when the command is ineligible, the sha
// is unknown, or the result is non-zero — the genuine-evidence invariant.
export function record({ dir, cmd, sha, exit, ts }) {
  if (!dir || !sha || sha === 'unknown') return false;
  if (!isCacheEligible(cmd)) return false;
  if (exit !== 0) return false;
  const store = readStore(dir);
  const pruned = {};
  for (const [k, v] of Object.entries(store.entries)) {
    if (v && v.sha === sha) pruned[k] = v;
  }
  pruned[cacheKey(cmd, sha)] = { cmd: normalizeCommand(cmd), sha, exit: 0, ts };
  const next = { version: STORE_VERSION, entries: pruned };
  const file = storePath(dir);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return true;
}
