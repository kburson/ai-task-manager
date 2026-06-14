#!/usr/bin/env node
// #403 — Detect + heal issues whose Functional DoD section predates the keyed
// template (#303). Such issues carry the five Functional checkbox lines but
// without their `dod:functional:KEY` markers, so `parseFunctionalDodKeys`
// yields fewer than five keys. Every verb that keys off those markers then
// silently degrades (proof gate refuses to tick, `dod-stamp` finds no line,
// the test-time auto-tick skips, `review.mjs` cannot derive the derived keys),
// leaving the Test→Review checkbox gate unsatisfiable through the normal chain.
//
// This module provides:
//   - detectMissingKeys(body): which of the five canonical keys are absent.
//   - healFunctionalSection(body): rewrite the Functional section to the
//     canonical keyed template, preserving tick state + any recorded evidence.
//
// CLI:
//   node scripts/task-tracker/heal-functional-dod.mjs [--state open|closed|all]
//                                                     [--apply]
//                                                     [--scope 241,242,...]
//
// Default: --state open, dry-run (no writes). `--apply` is the only switch that
// writes; every write routes through `mutateIssueBody`.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { loadConfig } from './config.mjs';
import { locateFunctionalSection } from './lib/lifecycle-dod.mjs';
import { parseFunctionalDodKeys } from './lib/functional-dod-evidence.mjs';
import { mutateIssueBody } from './lib/issue-body-mutate.mjs';
import { gql, splitRepo } from '../gh/lib/github-projects.mjs';

const pexec = promisify(execFile);

// Canonical Functional DoD keys, in canonical render order.
export const CANONICAL_KEYS = Object.freeze(['tests', 'lint', 'commits', 'acs', 'checkboxes']);

// Canonical line text per key (everything after `- [x] ` / `- [ ] `). Mirrors
// templates/definition-of-done.md exactly.
const CANONICAL_LINE = Object.freeze({
  tests:
    'All automated tests pass <!-- aitm-verified-by: `npm run test:all` --> <!-- dod:functional:tests -->',
  lint: 'Lint and format checks pass <!-- aitm-verified-by: `npm run lint` `npm run format:check` --> <!-- dod:functional:lint -->',
  commits:
    'All changes committed; commit messages follow project convention <!-- aitm-verified-by: `git log --oneline -1` --> <!-- dod:functional:commits -->',
  acs: 'Acceptance criteria met (including additions from deep dive) <!-- dod:functional:acs -->',
  checkboxes: 'Issue body checkboxes ticked <!-- dod:functional:checkboxes -->',
});

const BOX_RE = /^(\s*)- \[([ x])\]\s+(.+)$/;
const KEY_MARKER_RE = /<!--\s*dod:functional:([a-z0-9-]+)\s*-->/i;
// Execution-proof evidence marker, either grammar (legacy colon or consolidated
// property form). Distinct from the verifier DECLARATION the template supplies.
const EVIDENCE_ANY_RE = /<!--\s*aitm-dod-evidence(?::[a-z0-9-]+)?\s[\s\S]*?-->/i;

// Classify a stale (unkeyed) Functional line to a canonical key by its label
// text. lint is matched before tests so a line mentioning both resolves to the
// more specific key; in practice the five labels are disjoint.
export function classifyLabel(text) {
  const t = String(text || '').toLowerCase();
  if (/\blint\b|format/.test(t)) return 'lint';
  if (/test/.test(t)) return 'tests';
  if (/commit/.test(t)) return 'commits';
  if (/acceptance|criteria/.test(t)) return 'acs';
  if (/checkbox/.test(t)) return 'checkboxes';
  return null;
}

// Report which canonical keys the body's Functional section is missing.
// Returns { sectionPresent, presentKeys, missingKeys, affected }.
//   - sectionPresent: a `#### Functional` heading exists.
//   - affected: sectionPresent AND at least one canonical key is missing.
// A fully-keyed (canonical) issue reports missingKeys=[] and affected=false,
// which is the idempotency guarantee — such issues are never healed.
export function detectMissingKeys(body) {
  const loc = locateFunctionalSection(body);
  if (!loc) {
    return { sectionPresent: false, presentKeys: [], missingKeys: [...CANONICAL_KEYS], affected: false };
  }
  const present = new Set(parseFunctionalDodKeys(body).map((it) => it.key));
  const presentKeys = CANONICAL_KEYS.filter((k) => present.has(k));
  const missingKeys = CANONICAL_KEYS.filter((k) => !present.has(k));
  return {
    sectionPresent: true,
    presentKeys,
    missingKeys,
    affected: missingKeys.length > 0,
  };
}

// Extract the per-key facts worth preserving from the existing Functional
// section: tick state and any recorded execution-proof marker. Classifies each
// checkbox line authoritative-marker-first (an existing `dod:functional:KEY`
// wins), falling back to label-text keyword classification.
function collectExisting(sectionText) {
  const byKey = new Map();
  for (const raw of String(sectionText || '').split('\n')) {
    const box = raw.match(BOX_RE);
    if (!box) continue;
    const checked = box[2] === 'x';
    const rest = box[3];
    const km = rest.match(KEY_MARKER_RE);
    const key = km ? km[1].toLowerCase() : classifyLabel(rest);
    if (!key || !CANONICAL_KEYS.includes(key)) continue;
    if (byKey.has(key)) continue; // first occurrence wins
    const ev = rest.match(EVIDENCE_ANY_RE);
    byKey.set(key, { checked, evidence: ev ? ev[0] : null });
  }
  return byKey;
}

// Rewrite the body's Functional section to the canonical keyed template,
// preserving tick state and any recorded evidence marker. Returns
// { body, changed }. No-op (changed=false) when the rebuilt section is
// byte-identical to the input.
export function healFunctionalSection(body) {
  const src = String(body || '');
  const loc = locateFunctionalSection(src);
  if (!loc) return { body: src, changed: false };

  const existing = collectExisting(loc.section);
  const lines = CANONICAL_KEYS.map((key) => {
    const prev = existing.get(key);
    const mark = prev && prev.checked ? 'x' : ' ';
    let line = `- [${mark}] ${CANONICAL_LINE[key]}`;
    if (prev && prev.evidence) line += ` ${prev.evidence}`;
    return line;
  });

  const newSection = `\n\n${lines.join('\n')}\n\n`;
  const next = loc.before + newSection + loc.after;
  return { body: next, changed: next !== src };
}

// ----- Orchestrator (CLI entry) -----

function parseArgs(argv) {
  const args = { state: 'open', apply: false, scope: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--state') args.state = argv[++i];
    else if (a.startsWith('--state=')) args.state = a.slice('--state='.length);
    else if (a === '--scope')
      args.scope = argv[++i]
        .split(',')
        .map((s) => Number(s.replace(/^#/, '')))
        .filter(Number.isFinite);
    else if (a.startsWith('--scope='))
      args.scope = a
        .slice('--scope='.length)
        .split(',')
        .map((s) => Number(s.replace(/^#/, '')))
        .filter(Number.isFinite);
    else if (a === '--help' || a === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  if (!['open', 'closed', 'all'].includes(args.state)) {
    process.stderr.write(`heal-functional-dod: invalid --state ${args.state}\n`);
    process.exit(2);
  }
  return args;
}

function printUsage() {
  process.stdout.write(
    'Usage: heal-functional-dod.mjs [--state open|closed|all] [--apply] [--scope N,N,...]\n'
  );
}

async function fetchAllIssueNumbers({ repo, state, projectId }) {
  const { owner, repoName } = splitRepo(repo);
  const numbers = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const data = await gql(
      `
      query($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          issues(first: 100, after: $cursor, states: [OPEN, CLOSED], orderBy: {field: CREATED_AT, direction: ASC}) {
            pageInfo { hasNextPage endCursor }
            nodes {
              number
              state
              projectItems(first: 5) { nodes { project { id } } }
            }
          }
        }
      }
    `,
      { owner, repo: repoName, cursor }
    );
    const issues = data.repository.issues.nodes;
    for (const i of issues) {
      const onProject = i.projectItems.nodes.some((n) => n.project?.id === projectId);
      if (!onProject) continue;
      if (state === 'open' && i.state !== 'OPEN') continue;
      if (state === 'closed' && i.state !== 'CLOSED') continue;
      numbers.push(i.number);
    }
    if (!data.repository.issues.pageInfo.hasNextPage) break;
    cursor = data.repository.issues.pageInfo.endCursor;
  }
  return numbers;
}

async function fetchIssueBody(issueNumber, repo) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) { body }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  return data?.repository?.issue?.body ?? '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  if (!cfg.repo) {
    process.stderr.write('heal-functional-dod: repo not configured\n');
    process.exit(1);
  }
  if (!cfg.projectId) {
    process.stderr.write('heal-functional-dod: projectId not configured\n');
    process.exit(1);
  }

  const numbers =
    args.scope ??
    (await fetchAllIssueNumbers({ repo: cfg.repo, state: args.state, projectId: cfg.projectId }));

  process.stdout.write(
    `heal-functional-dod: mode=${args.apply ? 'APPLY' : 'dry-run'} state=${args.state} issues=${numbers.length}\n`
  );

  let affectedCount = 0;
  let healedCount = 0;
  let errorCount = 0;

  for (const n of numbers) {
    try {
      const body = await fetchIssueBody(n, cfg.repo);
      const det = detectMissingKeys(body);
      if (!det.affected) continue;
      affectedCount++;
      process.stdout.write(`#${n}\tmissing: ${det.missingKeys.join(',')}\n`);
      if (args.apply) {
        const res = await mutateIssueBody({
          issueNumber: n,
          repo: cfg.repo,
          mutate: (base) => healFunctionalSection(base).body,
          deps: { pexec },
        });
        if (res?.status !== 'no-op') healedCount++;
      }
    } catch (err) {
      errorCount++;
      process.stdout.write(`#${n}\tERROR: ${err.message}\n`);
    }
  }

  process.stdout.write(
    `Summary: affected=${affectedCount} healed=${healedCount} errors=${errorCount}\n`
  );
}

const _isMain = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (_isMain) {
  main().catch((err) => {
    process.stderr.write(`heal-functional-dod: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
