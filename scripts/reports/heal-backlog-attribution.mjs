#!/usr/bin/env node
/**
 * Heal closed-backlog attribution (#782).
 *
 * Reconciles the value/activity report's view of *delivered work* for closed
 * issues that predate the mandatory `[#N]` commit-subject token. Runs the shared
 * three-signal resolver (`lib/attribution-resolver.mjs`) over every closed issue
 * and prints a classification: HEALABLE / COMMITS_OFFTRUNK / DELIVERABLE / DEAD /
 * UNKNOWN, mirroring the audit in `output/closed-issues-healing-analysis.md`.
 *
 * READ-ONLY by default. `--apply` opts into the single mutating action: for
 * COMMITS_OFFTRUNK issues (an `aitm-commits` marker whose SHAs are all absent
 * from trunk, e.g. after a rebase/squash), re-trace each orphaned SHA to its
 * current trunk commit (patch-id, then exact-subject fallback) and rewrite the
 * marker in place via `mutateIssueBody` — never `gh issue edit --body`. Ambiguous
 * (>1 candidate) matches are reported and left untouched.
 *
 * Usage:
 *   node scripts/reports/heal-backlog-attribution.mjs [--repo owner/name]
 *     [--trunk trunk] [--limit 1000] [--apply] [--json]
 *
 * Side effects: none without --apply. With --apply, rewrites `aitm-commits`
 * markers on COMMITS_OFFTRUNK issues only. Safe to re-run (idempotent).
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../task-tracker/config.mjs';
import { GH_API_TIMEOUT_MS, GIT_TIMEOUT_MS } from '../task-tracker/lib/process-timeouts.mjs';
import { mutateIssueBody } from '../task-tracker/lib/issue-body-mutate.mjs';
import { parseMarker } from '../task-tracker/lib/commit-trail.mjs';
import { classifyIssue, retraceSha, LOG_FIELD_SEP } from './lib/attribution-resolver.mjs';
import { loadTrunkSignals } from './lib/trunk-signals.mjs';
import { assertKnownArgv, reportStrictArgvError } from '../task-tracker/lib/argv-strict.mjs';
import { confirmBlastRadius } from '../task-tracker/lib/blast-radius-guard.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('heal-backlog-attribution');
  process.exit(0);
}

export const USAGE =
  'Usage: heal-backlog-attribution.mjs [--apply] [--json] [--repo owner/name]\n' +
  '                                   [--trunk <ref>] [--limit <n>] [--yes]\n' +
  '  (default)   audit only, no writes\n' +
  '  --yes       skip the blast-radius confirmation prompt on a multi-issue --apply\n' +
  '  --help, -h  print this usage and exit; never writes\n';

const __dir = path.dirname(fileURLToPath(import.meta.url));

const CLASSES = ['HEALABLE', 'COMMITS_OFFTRUNK', 'DELIVERABLE', 'DEAD', 'UNKNOWN'];

// --- git helpers (only exercised on the live --apply re-trace path) ---

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
}

// Rewrite the `aitm-commits` marker's SHA list in place, preserving the marker's
// position. Grammar matches MARKER_NEW_RE in commit-trail.mjs; SHAs are hex so no
// value escaping is required.
export function rewriteCommitsMarker(body, shaList) {
  const parsed = parseMarker(body);
  if (parsed.index === -1) return body;
  const marker = `<!-- aitm-commits shas="${shaList.join(',')}" -->`;
  return body.slice(0, parsed.index) + marker + body.slice(parsed.index + parsed.raw.length);
}

// Build `patchId -> [trunkSha]` and `subject -> [trunkSha]` indices from trunk.
function buildTrunkRetraceIndices(trunk) {
  const trunkByPatchId = new Map();
  const trunkBySubject = new Map();

  // `git log <trunk> -p | git patch-id --stable` emits `<patchId> <commitSha>`.
  const patchOut = execFileSync('bash', [
    '-c',
    `git log ${trunk} -p --no-color | git patch-id --stable`,
  ], { encoding: 'utf8', timeout: GIT_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024 });
  for (const line of patchOut.split('\n')) {
    const [pid, sha] = line.trim().split(/\s+/);
    if (!pid || !sha) continue;
    if (!trunkByPatchId.has(pid)) trunkByPatchId.set(pid, []);
    if (!trunkByPatchId.get(pid).includes(sha)) trunkByPatchId.get(pid).push(sha);
  }

  const subjOut = git(['log', trunk, `--format=%H${LOG_FIELD_SEP}%s`]);
  for (const line of subjOut.split('\n')) {
    const sep = line.indexOf(LOG_FIELD_SEP);
    if (sep === -1) continue;
    const sha = line.slice(0, sep).trim();
    const subject = line.slice(sep + 1);
    if (!sha) continue;
    if (!trunkBySubject.has(subject)) trunkBySubject.set(subject, []);
    if (!trunkBySubject.get(subject).includes(sha)) trunkBySubject.get(subject).push(sha);
  }

  return { trunkByPatchId, trunkBySubject };
}

// Compute an orphan SHA's own patch-id + subject, if the object is still present
// in the repo. Returns { oldPatchId|null, oldSubject|null }.
function orphanRetraceKeys(sha) {
  let oldSubject = null;
  let oldPatchId = null;
  try {
    oldSubject = git(['log', '-1', '--format=%s', sha]).trim() || null;
  } catch {
    return { oldPatchId: null, oldSubject: null };
  }
  try {
    const out = execFileSync('bash', ['-c', `git show ${sha} --no-color | git patch-id --stable`], {
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    });
    oldPatchId = out.trim().split(/\s+/)[0] || null;
  } catch {
    oldPatchId = null;
  }
  return { oldPatchId, oldSubject };
}

// --- main ---

function parseArgs(argv) {
  // #878 — refuse unknown flags before any gh/git call.
  if (
    assertKnownArgv(argv, {
      flags: ['--apply', '--json', '--yes'],
      options: ['--repo', '--trunk', '--limit'],
      usage: USAGE,
    })
  ) {
    return { help: true };
  }

  const flag = (f, def = null) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : def;
  };
  return {
    apply: argv.includes('--apply'),
    json: argv.includes('--json'),
    yes: argv.includes('--yes'),
    repo: flag('--repo'),
    trunk: flag('--trunk'),
    limit: Number(flag('--limit', '1000')),
  };
}

function fetchClosedIssues(repo, limit) {
  const out = execFileSync(
    'gh',
    [
      'issue',
      'list',
      '--repo',
      repo,
      '--state',
      'closed',
      '--limit',
      String(limit),
      '--json',
      'number,title,body,stateReason',
    ],
    { encoding: 'utf8', timeout: GH_API_TIMEOUT_MS, maxBuffer: 128 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

async function main(deps = {}) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const ttCfg = loadConfig({
    projectPath: path.join(__dir, '..', '..', '.ai-task-manager', 'task-tracker.json'),
    legacyProjectPath: path.join(__dir, '..', '..', '.claude', 'task-tracker.json'),
  });
  const repo = args.repo ?? ttCfg.repo;
  if (!repo) {
    console.error('No repo resolved. Pass --repo owner/name or configure task-tracker.json.');
    process.exit(1);
  }
  const trunk = args.trunk ?? ttCfg.trunkBranch ?? ttCfg.trunk ?? 'trunk';

  console.error(`Loading trunk signals from ${trunk}...`);
  const { trunkTokens, trunkShas } = loadTrunkSignals({ trunk });

  console.error(`Fetching closed issues from ${repo}...`);
  const issues = fetchClosedIssues(repo, args.limit);

  const classified = issues.map((iss) => {
    const c = classifyIssue({
      issueNumber: iss.number,
      body: iss.body ?? '',
      stateReason: iss.stateReason,
      trunkTokens,
      trunkShas,
    });
    return { number: iss.number, title: iss.title, ...c };
  });

  const groups = Object.fromEntries(CLASSES.map((k) => [k, []]));
  for (const c of classified) (groups[c.klass] ?? (groups[c.klass] = [])).push(c);

  if (args.json) {
    console.log(JSON.stringify({ repo, trunk, total: classified.length, classified }, null, 2));
  } else {
    console.log(`\nClosed-backlog attribution — ${repo} (trunk: ${trunk})`);
    console.log(`${classified.length} closed issues\n`);
    for (const k of CLASSES) {
      const rows = groups[k];
      console.log(`${k}: ${rows.length}`);
      for (const r of rows) {
        const shas = r.shas.length ? `  [${r.shas.map((s) => s.slice(0, 7)).join(', ')}]` : '';
        console.log(`  #${r.number} ${r.title}${shas}`);
      }
      console.log('');
    }
  }

  // --apply: re-trace COMMITS_OFFTRUNK markers to trunk and rewrite in place.
  const offtrunk = groups['COMMITS_OFFTRUNK'] ?? [];
  if (offtrunk.length === 0) return;

  if (!args.apply) {
    console.log(
      `\n${offtrunk.length} COMMITS_OFFTRUNK issue(s). Re-run with --apply to re-trace and rewrite markers.`,
    );
    return;
  }

  const confirm = deps.confirmBlastRadius || confirmBlastRadius;
  const decision = await confirm({
    issueNumbers: offtrunk.map((r) => r.number),
    yes: args.yes,
    log: (s) => process.stdout.write(s),
    warn: (s) => process.stderr.write(s),
  });
  if (!decision.proceed) {
    process.exit(2);
    return;
  }

  console.error('\nBuilding trunk re-trace indices (patch-id + subject)...');
  const indices = buildTrunkRetraceIndices(trunk);

  for (const r of offtrunk) {
    const remaps = [];
    let ambiguous = false;
    for (const sha of r.shas) {
      const keys = orphanRetraceKeys(sha);
      const res = retraceSha(sha, { ...keys, ...indices });
      if (res.mapped) remaps.push({ from: sha, to: res.mapped, method: res.method });
      else if (res.ambiguous) {
        ambiguous = true;
        console.log(`  #${r.number} ${sha.slice(0, 7)} → AMBIGUOUS (${res.method}); left untouched`);
      } else {
        console.log(`  #${r.number} ${sha.slice(0, 7)} → no trunk match; left untouched`);
      }
    }
    if (remaps.length === 0) continue;

    const newShaSet = new Set(r.shas);
    for (const { from, to } of remaps) {
      newShaSet.delete(from);
      newShaSet.add(to);
    }
    const newShaList = [...newShaSet];

    for (const { from, to, method } of remaps) {
      console.log(`  #${r.number} ${from.slice(0, 7)} → ${to.slice(0, 7)} (${method})`);
    }
    if (ambiguous) {
      console.log(`  #${r.number} has unresolved SHAs; rewriting only the resolved ones.`);
    }

    await mutateIssueBody({
      issueNumber: r.number,
      repo,
      mutate: (base) => rewriteCommitsMarker(base, newShaList),
    });
    console.log(`  #${r.number} marker rewritten (${newShaList.length} SHA(s)).`);
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    if (reportStrictArgvError(err, { usage: USAGE })) process.exit(2);
    console.error(err.message);
    process.exit(1);
  });
}
