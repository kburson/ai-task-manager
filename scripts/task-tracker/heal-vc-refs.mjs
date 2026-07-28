#!/usr/bin/env node
// #721 — Detect + heal issues whose Acceptance Criteria still embed a raw
// command in their `aitm-verified cmd="..."` declaration instead of citing a
// shared `## Verification Commands` entry (`cmd="vc:<n>"`). Converting keeps a
// command that verifies more than one AC (or an AC and the regression floor)
// from being typed and run twice.
//
// This module's detect/heal pair lives in `lib/heal-vc-refs.mjs`:
//   - detectLegacyAcCitations(body): which ACs still embed a raw command.
//   - healVcRefs(body): rewrite those ACs to `vc:<n>` citations, appending any
//     newly-needed commands to `## Verification Commands`.
//
// CLI:
//   node scripts/task-tracker/heal-vc-refs.mjs [--state open|closed|all]
//                                               [--apply]
//                                               [--scope 241,242,...]
//
// Default: --state open, dry-run (no writes). `--apply` is the only switch that
// writes; every write routes through `mutateIssueBody`.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { loadConfig } from './config.mjs';
import { healVcRefs, planVcRefHeal } from './lib/heal-vc-refs.mjs';
import { mutateIssueBody } from './lib/issue-body-mutate.mjs';
import { gql, splitRepo } from '../gh/lib/github-projects.mjs';
import { assertKnownArgv, reportStrictArgvError } from './lib/argv-strict.mjs';
import { confirmBlastRadius } from './lib/blast-radius-guard.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('heal-vc-refs');
  process.exit(0);
}

const pexec = promisify(execFile);

export async function fetchAllIssueNumbers({ repo, state, projectId }, gqlFn = gql) {
  const { owner, repoName } = splitRepo(repo);
  const numbers = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const data = await gqlFn(
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

export async function fetchIssueBody(issueNumber, repo, gqlFn = gql) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gqlFn(
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

// #774 AC-2 — fetch body AND state in one query so the CLI can skip a CLOSED
// issue without a body mutation, even on the `--scope` path (which bypasses the
// state-filtered enumeration). Returns `{ body, state }` where `state` is
// GitHub's `OPEN`/`CLOSED`.
export async function fetchIssueMeta(issueNumber, repo, gqlFn = gql) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gqlFn(
    `
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) { body state }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const issue = data?.repository?.issue;
  return { body: issue?.body ?? '', state: issue?.state ?? 'OPEN' };
}

// Parse CLI flags. I/O + termination are injectable (`io.out`/`io.err`/
// `io.exit`) so the flag-routing branches (`--help`, invalid `--state`) are
// exercisable offline; every hook defaults to the real process stream/exit,
// keeping the CLI runtime path byte-identical.
export function parseArgs(argv, io = {}) {
  const out = io.out || process.stdout;
  const err = io.err || process.stderr;
  const exit = io.exit || ((code) => process.exit(code));
  const args = { state: 'open', apply: false, scope: null, yes: false };

  // #878 — refuse unknown flags before interpreting anything.
  try {
    assertKnownArgv(argv, { flags: ['--apply', '--yes'], options: ['--state', '--scope'] });
  } catch (e) {
    if (!reportStrictArgvError(e, { err: (s) => err.write(s) })) throw e;
    printUsage(err);
    exit(2);
    return args;
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--yes') args.yes = true;
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
      printUsage(out);
      exit(0);
      return args;
    }
  }
  if (!['open', 'closed', 'all'].includes(args.state)) {
    err.write(`heal-vc-refs: invalid --state ${args.state}\n`);
    exit(2);
    return args;
  }
  return args;
}

export function printUsage(out = process.stdout) {
  out.write(
    'Usage: heal-vc-refs.mjs [--state open|closed|all] [--apply] [--scope N,N,...] [--yes]\n' +
      '  --yes  skip the blast-radius confirmation prompt on a multi-issue --apply\n'
  );
}

// I/O + orchestration seams are injectable (`deps`) so `main` is exercisable
// offline; every dep defaults to the real implementation, keeping the CLI
// runtime path byte-identical.
export async function main(argv, deps = {}) {
  const loadConfigFn = deps.loadConfig || loadConfig;
  const fetchNumbers = deps.fetchAllIssueNumbers || fetchAllIssueNumbers;
  const fetchMeta = deps.fetchIssueMeta || fetchIssueMeta;
  const mutate = deps.mutateIssueBody || mutateIssueBody;
  const out = deps.out || process.stdout;
  const err = deps.err || process.stderr;
  const exit = deps.exit || ((code) => process.exit(code));

  const args = parseArgs(argv, { out, err, exit });
  const cfg = loadConfigFn();
  if (!cfg.repo) {
    err.write('heal-vc-refs: repo not configured\n');
    return exit(1);
  }
  if (!cfg.projectId) {
    err.write('heal-vc-refs: projectId not configured\n');
    return exit(1);
  }

  const numbers =
    args.scope ??
    (await fetchNumbers({ repo: cfg.repo, state: args.state, projectId: cfg.projectId }));

  out.write(
    `heal-vc-refs: mode=${args.apply ? 'APPLY' : 'dry-run'} state=${args.state} issues=${numbers.length}\n`
  );

  if (args.apply) {
    const confirm = deps.confirmBlastRadius || confirmBlastRadius;
    const decision = await confirm({
      issueNumbers: numbers,
      yes: args.yes,
      log: (s) => out.write(s),
      warn: (s) => err.write(s),
    });
    if (!decision.proceed) return exit(2);
  }

  let affectedCount = 0;
  let healedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const n of numbers) {
    try {
      const { body, state } = await fetchMeta(n, cfg.repo);
      // AC-2: never mutate a closed issue — enumerate it for the record, skip.
      if (state === 'CLOSED') {
        skippedCount++;
        out.write(`#${n}\tskipped (closed)\n`);
        continue;
      }
      const plan = planVcRefHeal(body);
      if (!plan.affected) continue;
      affectedCount++;
      // AC-4: report the planned conversions (and any VC ids that would be
      // stamped) for every in-scope issue — in dry-run this is the whole output.
      const stampNote = plan.stampedIds.length
        ? `, stamping VC ids: ${plan.stampedIds.join(', ')}`
        : '';
      out.write(`#${n}\tlegacy ACs: ${plan.conversions.length}${stampNote}\n`);
      for (const c of plan.conversions) {
        out.write(`  • ${c.label} → vc-list="${c.vcList}"\n`);
      }
      if (args.apply) {
        const res = await mutate({
          issueNumber: n,
          repo: cfg.repo,
          mutate: (base) => healVcRefs(base).body,
          deps: { pexec },
        });
        if (res?.status !== 'no-op') healedCount++;
      }
    } catch (e) {
      errorCount++;
      out.write(`#${n}\tERROR: ${e.message}\n`);
    }
  }

  out.write(
    `Summary: affected=${affectedCount} healed=${healedCount} skipped=${skippedCount} errors=${errorCount}\n`
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
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`heal-vc-refs: ${err.stack || err.message}\n`);
    process.exit(1);
  });
}
