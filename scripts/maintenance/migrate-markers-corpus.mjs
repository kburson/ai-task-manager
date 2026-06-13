// cspell:ignore rescan Multiset fams
// #369 — one-time corpus marker-grammar migration (EPIC #367).
//
// Enumerates EVERY issue in the repo (open + closed, GraphQL cursor pagination,
// checkpoint-resumable) and rewrites every legacy-form hidden marker standardized
// under #367 into the consolidated `key="value"` property grammar. All live
// writes route through `mutateIssueBody` (body-write contract + MarkerLossError).
// Dry-run is the default; `--live` writes; `--rescan` asserts zero residual
// legacy markers.
//
// The per-family transforms live in the COMMITTED, unit-tested library
// `scripts/maintenance/lib/corpus-marker-transforms.mjs` (#389). This runner is
// the thin enumeration/diff/IO shell around `migrateBodyWithFamilies` — it adds
// no transform logic of its own, so what the dry-run shows is exactly what the
// tested chain produces.
//
// The live resume-checkpoint is a runtime artifact written under `.tmp/heal/`
// (gitignored), not beside this committed runner.
//
// Usage:
//   node scripts/maintenance/migrate-markers-corpus.mjs                 # dry-run (default)
//   node scripts/maintenance/migrate-markers-corpus.mjs --live          # write changes
//   node scripts/maintenance/migrate-markers-corpus.mjs --rescan        # residual scan only
//   node scripts/maintenance/migrate-markers-corpus.mjs --issue 369     # single issue
//   node scripts/maintenance/migrate-markers-corpus.mjs --limit 25      # first N issues
//   node scripts/maintenance/migrate-markers-corpus.mjs --verbose       # print per-issue diffs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

import { loadConfig } from '../task-tracker/config.mjs';
import { gql } from '../gh/lib/github-projects.mjs';
import { mutateIssueBody } from '../task-tracker/lib/issue-body-mutate.mjs';
import { migrateBodyWithFamilies } from './lib/corpus-marker-transforms.mjs';

const STATE_PATH = new URL('../../.tmp/heal/migrate-markers-corpus.state.json', import.meta.url);

// ---------------------------------------------------------------------------
// Residual legacy-form detectors (inverse of each transform). Used by --rescan.
// The proof detector deliberately EXCLUDES bare `aitm-verified-by:` declarations
// (current canonical form) — only execution proofs / consolidated markers
// carrying legacy keys count as residual.
// ---------------------------------------------------------------------------
const RESIDUAL_DETECTORS = [
  ['stage-entry', /<!--\s*aitm-entered-[a-z]+(?:-\d+)?:\s/i],
  [
    'lifecycle',
    /<!--\s*aitm-(?:refine-complete|deep-dive-posted|deep-dive-complete|plan-approved|review-approved):\s/i,
  ],
  ['body-version', /<!--\s*aitm-body-version:\s/i],
  ['sha-ts', /<!--\s*aitm-(?:dod-verified|test-started):\s/i],
  ['last-known-state', /<!--\s*aitm-last-known-state(?:-ts)?:\s/i],
  ['evidence', /<!--\s*aitm-(?:ac|dod)-evidence:[0-9a-z-]+\s/i],
  ['audit', /<!--\s*aitm-(?:full-auto-approved|human-reviewer|backfill|reentry-audit):\s/i],
  ['csv-list', /<!--\s*aitm-(?:commits|blocked-by):\s/i],
  ['proof', /<!--\s*aitm-verified-at:|<!--\s*aitm-verified\s[^>]*(?:verified-at|verified-by)=/i],
];

// #392 (C6) — legacy marker grammar that appears purely as DOCUMENTATION trips
// the residual detectors as false positives: inside fenced code blocks, inline
// `code` spans, and angle-bracket placeholders (`<iso-ts>`, `<ts>`, `<N>`) on the
// issues that introduce or document the grammar. A real functional marker is
// always a bare HTML comment outside any code context with a concrete value, so
// redacting these documentation contexts before detection cannot hide a true
// marker — verified by the regression test that a bare legacy marker outside any
// code context is still reported.
export function redactDocContexts(body) {
  let s = String(body ?? '');
  s = s.replace(/```[\s\S]*?```/g, ''); // fenced code blocks
  s = s.replace(/`[^`\n]*`/g, ''); // inline-code spans
  // Marker comments whose value is an angle-bracket placeholder are template
  // documentation, never real markers (real values are timestamps/shas/ints).
  s = s.replace(/<!--[\s\S]*?-->/g, (c) => (/<[a-z][a-z0-9-]*>/i.test(c) ? '' : c));
  return s;
}

export function residualFamilies(body) {
  const src = redactDocContexts(body);
  // The deep-dive-complete JSON-payload relics are intentionally NOT migrated
  // (C2/#388 handled them by hand); a `{`-payload marker is not residual.
  return RESIDUAL_DETECTORS.filter(([name, re]) => {
    if (!re.test(src)) return false;
    if (name === 'lifecycle' && /<!--\s*aitm-deep-dive-complete:\s*\{/.test(src)) {
      // Re-test excluding the JSON relic form.
      return (
        /<!--\s*aitm-(?:refine-complete|deep-dive-posted|plan-approved|review-approved):\s/i.test(
          src
        ) || /<!--\s*aitm-deep-dive-complete:\s*(?!\{)/.test(src)
      );
    }
    return true;
  }).map(([name]) => name);
}

// ---------------------------------------------------------------------------
// Multiset line diff (good enough to review marker changes).
// ---------------------------------------------------------------------------
function diffLines(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const bCount = new Map();
  for (const l of b) bCount.set(l, (bCount.get(l) || 0) + 1);
  const aCount = new Map();
  for (const l of a) aCount.set(l, (aCount.get(l) || 0) + 1);
  const removed = [];
  for (const l of a) {
    if ((bCount.get(l) || 0) > 0) bCount.set(l, bCount.get(l) - 1);
    else removed.push(l);
  }
  const added = [];
  for (const l of b) {
    if ((aCount.get(l) || 0) > 0) aCount.set(l, aCount.get(l) - 1);
    else added.push(l);
  }
  return { removed: removed.filter((l) => l.trim()), added: added.filter((l) => l.trim()) };
}

// ---------------------------------------------------------------------------
// Enumeration — GraphQL cursor pagination over open+closed, body inlined.
// ---------------------------------------------------------------------------
async function* allIssues(owner, name) {
  let cursor = null;
  for (;;) {
    const data = await gql(
      `query($o:String!,$n:String!,$c:String){
         repository(owner:$o,name:$n){
           issues(first:100, after:$c, orderBy:{field:CREATED_AT, direction:ASC}){
             pageInfo{ hasNextPage endCursor }
             nodes{ number body }
           }
         }
       }`,
      { o: owner, n: name, c: cursor }
    );
    const conn = data.repository.issues;
    for (const nd of conn.nodes) yield { number: nd.number, body: nd.body || '' };
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { done: [], updatedAt: null };
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { done: [], updatedAt: null };
  }
}
function saveState(state, nowIso) {
  state.updatedAt = nowIso;
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

function parseArgs(argv) {
  const a = { live: false, rescan: false, verbose: false, issue: null, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--live') a.live = true;
    else if (t === '--rescan') a.rescan = true;
    else if (t === '--verbose') a.verbose = true;
    else if (t === '--issue') a.issue = Number(argv[++i]);
    else if (t === '--limit') a.limit = Number(argv[++i]);
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  const [owner, name] = cfg.repo.split('/');
  const nowIso = new Date().toISOString();

  // -------- residual re-scan (AC-4 / C4 #390) --------
  if (args.rescan) {
    let scanned = 0;
    const offenders = [];
    for await (const { number, body } of allIssues(owner, name)) {
      if (args.issue && number !== args.issue) continue;
      if (args.limit && scanned >= args.limit) break;
      scanned++;
      const fams = residualFamilies(body);
      if (fams.length) offenders.push({ number, fams });
    }
    console.log(`\n=== RESCAN: scanned ${scanned} issue(s) ===`);
    if (offenders.length === 0) {
      console.log('✓ zero residual legacy-form markers across every migrated family');
      process.exit(0);
    }
    console.log(`✗ ${offenders.length} issue(s) carry residual legacy markers:`);
    for (const o of offenders) console.log(`  #${o.number}: ${o.fams.join(', ')}`);
    process.exit(1);
  }

  // -------- dry-run / live migration (AC-1/2/3) --------
  const state = args.live ? loadState() : { done: [], updatedAt: null };
  const doneSet = new Set(state.done);
  let scanned = 0;
  let changedCount = 0;
  const familyTotals = new Map();
  const errors = [];

  for await (const { number, body } of allIssues(owner, name)) {
    if (args.issue && number !== args.issue) continue;
    if (args.limit && scanned >= args.limit) break;
    scanned++;
    if (args.live && doneSet.has(number)) continue; // resume: skip processed

    const { body: next, families } = migrateBodyWithFamilies(body);
    if (next === body) {
      if (args.live) {
        doneSet.add(number);
        state.done = [...doneSet];
        saveState(state, nowIso);
      }
      continue;
    }

    changedCount++;
    for (const f of families) familyTotals.set(f, (familyTotals.get(f) || 0) + 1);

    const { removed, added } = diffLines(body, next);
    console.log(`\n#${number}  [${families.join(', ')}]  -${removed.length}/+${added.length}`);
    if (args.verbose || !args.live) {
      for (const l of removed) console.log(`  - ${l.trim()}`);
      for (const l of added) console.log(`  + ${l.trim()}`);
    }

    if (args.live) {
      try {
        await mutateIssueBody({
          issueNumber: number,
          repo: cfg.repo,
          // Re-apply on the FRESH base; marker-only, never changes tick state.
          mutate: (base) => migrateBodyWithFamilies(base).body,
          allowUnverifiedTicks: true,
        });
        doneSet.add(number);
        state.done = [...doneSet];
        saveState(state, nowIso);
      } catch (err) {
        errors.push({ number, error: err?.message || String(err) });
        console.log(`  ✗ write failed: ${err?.message || err}`);
      }
    }
  }

  console.log(
    `\n=== ${args.live ? 'LIVE' : 'DRY-RUN'}: scanned ${scanned}, ${
      args.live ? 'changed' : 'would change'
    } ${changedCount} ===`
  );
  const fam = [...familyTotals.entries()].sort((a, b) => b[1] - a[1]);
  for (const [f, c] of fam) console.log(`  ${f}: ${c}`);
  if (errors.length) {
    console.log(`\n✗ ${errors.length} write error(s):`);
    for (const e of errors) console.log(`  #${e.number}: ${e.error}`);
    process.exit(1);
  }
}

// Only run as a CLI entry point — importing the module (e.g. from the unit
// tests that exercise redactDocContexts / residualFamilies) must not execute
// the live enumeration.
const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err?.stack || err);
    process.exit(1);
  });
}
