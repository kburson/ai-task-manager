#!/usr/bin/env node
// ai-memory-parity.mjs (#518) — verify the `docs/ai-memory/` seed on the
// `ai-memory` branch is at parity with the maintainer's live auto-memory
// source-of-truth, and that the branch is rebased on trunk.
//
// The seed is a curated, point-in-time export of the durable "lessons learned"
// captured while building this package. This tool is a MAINTAINER dev-tool: it
// diffs the committed seed against the maintainer's live Claude auto-memory
// directory. Downstream package users do not have that live directory and do
// not run this — it exists to keep the shipped seed honest.
//
// Modes:
//   --mode rebase  assert `ai-memory` is not behind trunk (linear / rebased)
//   --mode files   assert every durable live memory is present + content-current
//   --mode index   assert MEMORY.md index ⇄ on-disk durable set are consistent
//   --mode diff    print the full reconciliation report (never fails; exit 0)
//
// Live-dir resolution (in precedence order):
//   1. --live <path>
//   2. $AITM_LIVE_MEMORY
//   3. default maintainer path ($HOME/.claude/projects/<repo-slug>/memory)
//
// Ephemeral epic-status trackers are intentionally EXCLUDED from the seed (they
// are not reusable lessons). The exclusion patterns live in EXCLUDE_PATTERNS
// and are documented in docs/ai-memory/EXCLUDED.md.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const BRANCH_DIR = join(REPO_ROOT, 'docs', 'ai-memory');

// #728 — the durable-seed rule (EXCLUDE_PATTERNS, META_DOCS, isEphemeral,
// listMd) is shared with the install-time manifest so the shipping path and
// this drift lint can never diverge. Re-exported to preserve the historical
// public surface of this module.
import {
  EXCLUDE_PATTERNS,
  META_DOCS,
  isEphemeral,
  listMd,
} from '../../bin/lib/memory-seed-set.mjs';
export { EXCLUDE_PATTERNS };

// Content-normalize: drop blank lines entirely and strip trailing whitespace so
// cosmetic-only drift (a blank line after frontmatter, a trailing newline) does
// NOT read as a parity failure. Real content differences survive.
const normalize = (s) =>
  s
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .filter((l) => l.trim() !== '')
    .join('\n');

function repoSlug() {
  // Claude auto-memory dirs are keyed by the PRIMARY worktree path (the main
  // checkout) with separators → dashes — NOT by whatever worktree this script
  // happens to run from. Resolve the main worktree via `git worktree list`.
  let mainPath = REPO_ROOT;
  try {
    const porcelain = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const first = porcelain.split('\n').find((l) => l.startsWith('worktree '));
    if (first) mainPath = first.slice('worktree '.length).trim();
  } catch {
    /* fall back to REPO_ROOT */
  }
  return mainPath.replace(/\//g, '-');
}

function resolveLiveDir(argv) {
  const flagIdx = argv.indexOf('--live');
  if (flagIdx !== -1 && argv[flagIdx + 1]) return resolve(argv[flagIdx + 1]);
  if (process.env.AITM_LIVE_MEMORY) return resolve(process.env.AITM_LIVE_MEMORY);
  return join(homedir(), '.claude', 'projects', repoSlug(), 'memory');
}

// The durable live set = every live *.md minus ephemeral trackers and meta-docs.
function durableLive(liveDir) {
  return listMd(liveDir).filter((f) => !isEphemeral(f) && !META_DOCS.has(f));
}

function reconcile(liveDir) {
  const live = new Set(durableLive(liveDir));
  const branch = new Set(listMd(BRANCH_DIR).filter((f) => !isEphemeral(f) && !META_DOCS.has(f)));
  const missing = [...live].filter((f) => !branch.has(f)).sort(); // durable, not yet in seed
  const stale = [...branch].filter((f) => !live.has(f)).sort(); // in seed, no live source
  const common = [...live].filter((f) => branch.has(f));
  const drift = [];
  const cosmetic = [];
  for (const f of common) {
    const a = readFileSync(join(liveDir, f), 'utf8');
    const b = readFileSync(join(BRANCH_DIR, f), 'utf8');
    if (a === b) continue;
    if (normalize(a) === normalize(b)) cosmetic.push(f);
    else drift.push(f);
  }
  return { missing, stale, drift: drift.sort(), cosmetic: cosmetic.sort() };
}

function modeRebase() {
  let out;
  try {
    out = execFileSync('git', ['rev-list', '--left-right', '--count', 'trunk...ai-memory'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch (err) {
    console.error(`rebase: git rev-list failed: ${err.message}`);
    return 1;
  }
  const [behind, ahead] = out.split(/\s+/).map(Number);
  if (behind === 0) {
    console.log(`PASS rebase: ai-memory is ${ahead} ahead / 0 behind trunk (linear, rebased).`);
    return 0;
  }
  console.error(`FAIL rebase: ai-memory is ${behind} behind trunk — rebase needed.`);
  return 1;
}

function modeFiles(liveDir) {
  if (!existsSync(liveDir)) {
    console.error(`files: live memory dir not found: ${liveDir}`);
    console.error('       pass --live <path> or set $AITM_LIVE_MEMORY.');
    return 2;
  }
  const { missing, drift } = reconcile(liveDir);
  if (missing.length === 0 && drift.length === 0) {
    console.log(
      `PASS files: docs/ai-memory/ is at parity with ${durableLive(liveDir).length} durable live memories.`
    );
    return 0;
  }
  if (missing.length) {
    console.error(`FAIL files: ${missing.length} durable memory file(s) missing from seed:`);
    missing.forEach((f) => console.error(`  - ${f}`));
  }
  if (drift.length) {
    console.error(`FAIL files: ${drift.length} seed file(s) content-drifted from live:`);
    drift.forEach((f) => console.error(`  ~ ${f}`));
  }
  return 1;
}

// Extract markdown link targets `[label](target.md)` from MEMORY.md bullets.
function indexTargets(memoryMd) {
  const targets = [];
  const re = /\]\(([^)]+\.md)\)/g;
  let m;
  while ((m = re.exec(memoryMd)) !== null) targets.push(m[1]);
  return targets;
}

function modeIndex() {
  const memoryPath = join(BRANCH_DIR, 'MEMORY.md');
  if (!existsSync(memoryPath)) {
    console.error(`index: ${memoryPath} not found.`);
    return 1;
  }
  const listed = indexTargets(readFileSync(memoryPath, 'utf8'));
  const onDisk = listMd(BRANCH_DIR).filter((f) => !META_DOCS.has(f) && !isEphemeral(f));
  const onDiskSet = new Set(onDisk);
  const listedSet = new Set(listed);
  // Every listed link must resolve to an existing file.
  const brokenLinks = listed.filter((t) => !existsSync(join(BRANCH_DIR, t)));
  // Every durable on-disk file must be listed (archive/ files are not top-level).
  const unlisted = onDisk.filter((f) => !listedSet.has(f));
  if (brokenLinks.length === 0 && unlisted.length === 0) {
    console.log(
      `PASS index: MEMORY.md lists ${listedSet.size} file(s); all resolve, all ${onDiskSet.size} durable files listed.`
    );
    return 0;
  }
  if (brokenLinks.length) {
    console.error(`FAIL index: ${brokenLinks.length} listed link(s) point at missing files:`);
    brokenLinks.forEach((t) => console.error(`  - ${t}`));
  }
  if (unlisted.length) {
    console.error(`FAIL index: ${unlisted.length} durable file(s) not listed in MEMORY.md:`);
    unlisted.forEach((f) => console.error(`  + ${f}`));
  }
  return 1;
}

function modeDiff(liveDir) {
  if (!existsSync(liveDir)) {
    console.error(`diff: live memory dir not found: ${liveDir}`);
    console.error('      pass --live <path> or set $AITM_LIVE_MEMORY.');
    return 2;
  }
  const { missing, stale, drift, cosmetic } = reconcile(liveDir);
  const excluded = listMd(liveDir).filter(isEphemeral).sort();
  console.log('ai-memory parity report');
  console.log(`  live dir:   ${liveDir}`);
  console.log(`  seed dir:   ${BRANCH_DIR}`);
  console.log('');
  console.log(`  net-new (durable, missing from seed): ${missing.length}`);
  missing.forEach((f) => console.log(`    + ${f}`));
  console.log(`  content drift (seed ≠ live):          ${drift.length}`);
  drift.forEach((f) => console.log(`    ~ ${f}`));
  console.log(`  cosmetic-only drift (ignored):        ${cosmetic.length}`);
  console.log(`  stale (in seed, no live source):      ${stale.length}`);
  stale.forEach((f) => console.log(`    - ${f}`));
  console.log(`  ephemeral live files EXCLUDED:        ${excluded.length}`);
  excluded.forEach((f) => console.log(`    x ${f}`));
  console.log('');
  const atParity = missing.length === 0 && drift.length === 0 && stale.length === 0;
  console.log(atParity ? '  => AT PARITY' : '  => NOT at parity (run resync)');
  return 0;
}

function main() {
  const argv = process.argv.slice(2);
  const mi = argv.indexOf('--mode');
  const mode = mi !== -1 ? argv[mi + 1] : null;
  const liveDir = resolveLiveDir(argv);
  switch (mode) {
    case 'rebase':
      return modeRebase();
    case 'files':
      return modeFiles(liveDir);
    case 'index':
      return modeIndex();
    case 'diff':
      return modeDiff(liveDir);
    default:
      console.error('usage: ai-memory-parity.mjs --mode <rebase|files|index|diff> [--live <path>]');
      return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('ai-memory-parity');
  process.exit(0);
}
process.exit(main());
