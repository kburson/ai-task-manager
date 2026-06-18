#!/usr/bin/env node
// ensure-wave-parent.mjs — orchestrator pre-flight that runs BEFORE the
// per-child dispatch-prep loop on a fan-out.
//
// Behaviour by classification (see lib/wave-detect.mjs):
//   - empty / single                  → no-op, exit 0
//   - all-parented-shared             → emit existing parent #, exit 0
//   - mixed | multi-parent            → exit 2 with rejection message
//   - all-solo (>=2 children)         → create parent, re-parent each child
//                                        via addSubIssue, post orchestration
//                                        start row, emit parent #, exit 0
//
// Idempotency: the parent body carries `<!-- wave-id: <id> -->` where <id> is
// a deterministic hash of the sorted child list. On retry, the helper queries
// open issues for a matching marker before creating a new parent.
//
// Usage:
//   ensure-wave-parent.mjs --children 12,13,14 --purpose "<text>"
//                          [--priority p0|p1|p2] [--rank <n>]
//                          [--dry-run]
//
// stdout (on a real or reused parent): `PARENT: #<N>`
// stdout (on no-op): `NO_WAVE_PARENT_NEEDED`

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { projectScratchDir } from '../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GH_API_TIMEOUT_MS } from '../task-tracker/lib/process-timeouts.mjs';
import { loadConfig } from '../task-tracker/config.mjs';
import { classify, rejectionMessage } from './lib/wave-detect.mjs';
import { gql, splitRepo } from './lib/github-projects.mjs';
import { buildRow, postTimingEvent } from '../task-tracker/gh-timing-comment.mjs';
import { stampEntryMarker } from '../task-tracker/lib/stage-entry-markers.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(
  __dir,
  '..',
  '..',
  'skill',
  'shared',
  'templates',
  'wave-parent.md'
);
const CREATE_ISSUE = path.join(__dir, 'create-issue.mjs');

function parseArgs(argv) {
  const out = { children: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--children') {
      const v = argv[++i] || '';
      out.children = v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === '--child') {
      out.children.push(argv[++i]);
    } else if (a === '--purpose') out.purpose = argv[++i];
    else if (a === '--priority') out.priority = argv[++i];
    else if (a === '--rank') out.rank = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '-h' || a === '--help') out.help = true;
  }
  return out;
}

function usage() {
  return 'Usage: ensure-wave-parent.mjs --children N1,N2,... --purpose "<text>" [--priority p0|p1|p2] [--rank <n>] [--dry-run]';
}

function waveId(children) {
  const sorted = [...children]
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const h = createHash('sha1').update(sorted.join(',')).digest('hex').slice(0, 10);
  return `${sorted.join('-')}.${h}`;
}

function renderTemplate({ purpose, children, waveIdValue }) {
  const tpl = readFileSync(TEMPLATE_PATH, 'utf8');
  const childList = children.map((n) => `- [ ] #${n}`).join('\n');
  return tpl
    .replaceAll('{{purpose}}', purpose)
    .replaceAll('{{children}}', childList)
    .replaceAll('{{wave_id}}', waveIdValue);
}

async function findExistingParentByWaveId({ repo, waveIdValue, assignee }) {
  const marker = `wave-id: ${waveIdValue}`;
  const q = `"<!-- ${marker} -->" in:body repo:${repo} state:open`;
  const args = ['search', 'issues', q, '--json', 'number,body', '--limit', '20'];
  if (assignee) args.push('--author', assignee.replace(/^@/, ''));
  let stdout;
  try {
    stdout = execFileSync('gh', args, { encoding: 'utf8', timeout: GH_API_TIMEOUT_MS });
  } catch {
    // gh search failure → caller treats this as "no existing parent found".
    return null;
  }
  try {
    const rows = JSON.parse(stdout || '[]');
    for (const row of rows) {
      if (typeof row.body === 'string' && row.body.includes(marker)) return Number(row.number);
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function getIssueNodeId({ repo, issueNumber }) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(
    `query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){issue(number:$n){id}}}`,
    { owner, name: repoName, n: Number(issueNumber) }
  );
  return data?.repository?.issue?.id || null;
}

async function addSubIssue({ parentId, childId }) {
  await gql(
    `mutation($parent:ID!,$child:ID!){addSubIssue(input:{issueId:$parent,subIssueId:$child}){issue{id} subIssue{id}}}`,
    { parent: parentId, child: childId }
  );
}

function createParentIssue({ purpose, children, waveIdValue, priority, rank, cfg }) {
  const body = renderTemplate({ purpose, children, waveIdValue });
  const tmpDir = mkdtempSync(path.join(projectScratchDir('test'), 'wave-parent-'));
  const bodyFile = path.join(tmpDir, 'body.md');
  writeFileSync(bodyFile, body, 'utf8');
  const title = `Wave: ${purpose}`.slice(0, 200);

  const args = [
    CREATE_ISSUE,
    '--title',
    title,
    '--body-file',
    bodyFile,
    '--no-placeholder-substitution',
    // Wave-parent body is a synthetic container (purpose + child list),
    // not the canonical Scope/AC/DoD/Pickup-Directive shape that
    // create-issue.mjs enforces on --body-file. Mark as internal and set
    // the env gate so the verifier (added in #200) lets this through.
    '--internal',
  ];
  if (priority) args.push('--priority', priority);
  if (rank) args.push('--rank', String(rank));
  if (cfg.assignee) args.push('--assignee', cfg.assignee);

  // create-issue.mjs makes multiple gh calls; allow gh-class budget plus headroom.
  let stdout;
  try {
    stdout = execFileSync('node', args, {
      encoding: 'utf8',
      timeout: GH_API_TIMEOUT_MS * 2,
      env: { ...process.env, AITM_CREATE_ISSUE_INTERNAL: '1' },
    });
  } catch (err) {
    if (err.stderr) process.stderr.write(String(err.stderr));
    throw new Error(`create-issue failed (exit ${err.status ?? 1})`);
  }
  const m = /\/issues\/(\d+)/.exec(stdout || '');
  if (!m) throw new Error(`could not parse new parent number from create-issue stdout: ${stdout}`);
  const parentNumber = Number(m[1]);

  // #272 — create-issue no longer accepts --status; all issues are born in
  // Backlog. Wave-parents are synthetic containers that legitimately bypass
  // the state-machine gates and live at `develop` for the duration of the
  // fan-out. Flip the project column directly and stamp the intermediate
  // entry markers (refine, plan, develop) so chain-integrity gates are happy
  // if the wave-parent is ever inspected by heal-entry-markers.
  promoteWaveParentToDevelop({ parentNumber, cfg });

  return parentNumber;
}

function promoteWaveParentToDevelop({ parentNumber, cfg }) {
  const tetherScript = path.join(__dir, 'project-tether.mjs');
  try {
    execFileSync('node', [tetherScript, '--issue', String(parentNumber), '--status', 'develop'], {
      encoding: 'utf8',
      timeout: GH_API_TIMEOUT_MS * 2,
    });
  } catch (err) {
    if (err.stderr) process.stderr.write(String(err.stderr));
    throw new Error(
      `wave-parent #${parentNumber} created but project-tether --status develop failed (exit ${err.status ?? 1})`
    );
  }

  // Stamp refine/plan/develop entry markers on the body so the chain is
  // contiguous (backlog already stamped by create-issue). Use a 1ms-stepped
  // ISO chain so order is unambiguous.
  let body;
  try {
    body = execFileSync(
      'gh',
      ['issue', 'view', String(parentNumber), '-R', cfg.repo, '--json', 'body', '--jq', '.body'],
      { encoding: 'utf8', timeout: GH_API_TIMEOUT_MS }
    );
  } catch (err) {
    if (err.stderr) process.stderr.write(String(err.stderr));
    throw new Error(
      `wave-parent #${parentNumber}: failed to fetch body for entry-marker chain (exit ${err.status ?? 1})`
    );
  }
  const baseMs = Date.now();
  body = stampEntryMarker(body, 'refine', new Date(baseMs).toISOString());
  body = stampEntryMarker(body, 'plan', new Date(baseMs + 1).toISOString());
  body = stampEntryMarker(body, 'develop', new Date(baseMs + 2).toISOString());

  const tmpDir = mkdtempSync(path.join(projectScratchDir('test'), 'wave-parent-stamp-'));
  const stampFile = path.join(tmpDir, 'body.md');
  writeFileSync(stampFile, body, 'utf8');
  try {
    execFileSync(
      'gh',
      ['issue', 'edit', String(parentNumber), '-R', cfg.repo, '--body-file', stampFile],
      { encoding: 'utf8', timeout: GH_API_TIMEOUT_MS }
    );
  } catch (err) {
    if (err.stderr) process.stderr.write(String(err.stderr));
    throw new Error(
      `wave-parent #${parentNumber}: failed to push entry-marker chain (exit ${err.status ?? 1})`
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage() + '\n');
    process.exit(0);
  }
  if (args.children.length === 0) {
    process.stderr.write(`ensure-wave-parent: --children is required\n${usage()}\n`);
    process.exit(2);
  }

  const cfg = loadConfig();
  if (!cfg.repo) {
    process.stderr.write('ensure-wave-parent: no repo configured\n');
    process.exit(2);
  }

  const result = await classify({ candidates: args.children, repo: cfg.repo });

  if (result.kind === 'empty' || result.kind === 'single') {
    process.stdout.write('NO_WAVE_PARENT_NEEDED\n');
    return;
  }
  if (result.kind === 'all-parented-shared') {
    const parent = [...result.parents][0];
    process.stdout.write(`PARENT: #${parent}\n`);
    return;
  }
  if (result.kind === 'mixed' || result.kind === 'multi-parent') {
    process.stderr.write(rejectionMessage(result) + '\n');
    process.exit(2);
  }
  // all-solo, >=2
  if (!args.purpose) {
    process.stderr.write('ensure-wave-parent: --purpose is required for solo fan-out\n');
    process.exit(2);
  }
  if (args.dryRun) {
    process.stdout.write(`DRY_RUN: would create parent for [${result.solos.join(',')}]\n`);
    return;
  }

  const waveIdValue = waveId(result.solos);
  const existing = await findExistingParentByWaveId({
    repo: cfg.repo,
    waveIdValue,
    assignee: cfg.assignee,
  });
  let parentNumber;
  if (existing) {
    parentNumber = existing;
    process.stderr.write(
      `ensure-wave-parent: reusing existing parent #${parentNumber} (wave-id ${waveIdValue})\n`
    );
  } else {
    parentNumber = createParentIssue({
      purpose: args.purpose,
      children: result.solos,
      waveIdValue,
      priority: args.priority,
      rank: args.rank,
      cfg,
    });
  }

  const parentId = await getIssueNodeId({ repo: cfg.repo, issueNumber: parentNumber });
  if (!parentId) throw new Error(`could not resolve node id for parent #${parentNumber}`);

  for (const child of result.solos) {
    const childId = await getIssueNodeId({ repo: cfg.repo, issueNumber: child });
    if (!childId) throw new Error(`could not resolve node id for child #${child}`);
    try {
      await addSubIssue({ parentId, childId });
    } catch (err) {
      if (!/already/i.test(err.message || '')) throw err;
    }
  }

  if (process.env.TT_SKIP_NETWORK !== '1') {
    const row = buildRow({
      ts: new Date().toISOString(),
      event: 'start',
      activeMin: 0,
      idleMin: 0,
      deltaWords: 0,
      wordMarker: 0,
      description: `orchestration start — wave fan-out (${result.solos.length} children)`,
    });
    await postTimingEvent({
      issueNumber: `#${parentNumber}`,
      repo: cfg.repo,
      row,
      timeoutMs: cfg.hookNetworkTimeoutMs ?? 5000,
    });
  }

  process.stdout.write(`PARENT: #${parentNumber}\n`);
}

main().catch((err) => {
  process.stderr.write(`ensure-wave-parent error: ${err.message}\n`);
  process.exit(1);
});
