#!/usr/bin/env node
// #439 acceptance probes — re-runnable verifiers behind the AC3/AC5/AC7
// `aitm-verified` declarations on issue #439. Each probe asserts a post-fix
// invariant and exits non-zero on failure so `ac-stamp` captures genuine
// evidence (exit + head sha + ts) rather than an unverified tick.
//
//   node scripts/maintenance/verify-439-acceptance.mjs ac3   # #436 body U+FFFD-free
//   node scripts/maintenance/verify-439-acceptance.mjs ac5    # probe markers + scratch gone
//   node scripts/maintenance/verify-439-acceptance.mjs ac7    # on-deck config key present
//
// The decode fix lives in scripts/task-tracker/lib/versioned-issue-write.mjs
// (collectStreamUtf8). AC3/AC5 query live GitHub via `gh`; AC7 reads loadConfig.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const REPO = 'kburson/ai-task-manager';
const REPLACEMENT = '�';

async function fetchBody(issue) {
  const { stdout } = await pexec('gh', ['api', `repos/${REPO}/issues/${issue}`, '-q', '.body']);
  return stdout;
}

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

async function ac3() {
  const body = await fetchBody(436);
  const n = count(body, REPLACEMENT);
  if (n > 0) throw new Error(`AC3 FAIL: #436 body carries ${n} U+FFFD`);
  console.log('AC3 OK: #436 body contains 0 U+FFFD');
}

async function ac5() {
  const body = await fetchBody(436);
  const markers = count(body, 'aitm-probe-run1');
  if (markers > 0)
    throw new Error(`AC5 FAIL: #436 still carries ${markers} aitm-probe-run1 marker(s)`);

  const here = path.dirname(fileURLToPath(import.meta.url));
  const inspectDir = path.resolve(here, '..', '..', '.tmp', 'inspect');
  let leftover = [];
  try {
    const entries = await readdir(inspectDir);
    leftover = entries.filter((f) => /probe.*436|diff-436|deep-dive-437/.test(f));
  } catch {
    // .tmp/inspect absent (gitignored / fresh checkout) → nothing to clean
  }
  if (leftover.length) throw new Error(`AC5 FAIL: leftover scratch ${leftover.join(', ')}`);
  console.log('AC5 OK: 0 aitm-probe-run1 markers, no investigation scratch');
}

async function ac7() {
  const { loadConfig } = await import('../task-tracker/config.mjs');
  const cfg = loadConfig();
  if (!cfg.kanbanOptionOnDeck)
    throw new Error('AC7 FAIL: loadConfig().kanbanOptionOnDeck is empty');
  console.log(`AC7 OK: loadConfig().kanbanOptionOnDeck = ${cfg.kanbanOptionOnDeck}`);
}

const probes = { ac3, ac5, ac7 };
const which = (process.argv[2] || '').toLowerCase();
const probe = probes[which];
if (!probe) {
  console.error(`Usage: verify-439-acceptance.mjs <ac3|ac5|ac7>`);
  process.exit(2);
}
try {
  await probe();
} catch (err) {
  console.error(String(err.message || err));
  process.exit(1);
}
