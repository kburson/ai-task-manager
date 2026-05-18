#!/usr/bin/env node
// Generalized heal for stage-entry markers. Backfills missing markers and
// re-stamps out-of-order chains for the early-lifecycle stages (refine, plan)
// that historically traversed before entry-marker stamping was mandatory
// (#140) or the chain-integrity close gate (#138) treated them as required.
//
// Three cases warrant a heal, applied per stage in HEALABLE_STAGES:
//
//   (a) `aitm-entered-<stage>` missing AND a later-indexed stage marker is
//       present — the issue traversed <stage> before stamping existed.
//   (b) `aitm-entered-<stage>` present but `aitm-backfill:<stage>:` audit
//       marker missing — the entry was injected without an audit trail.
//   (c) `aitm-entered-<stage>` present but out-of-order relative to a later
//       stage's marker — the chain-integrity gate (#138) will refuse close.
//       Strips both the entry and any existing audit marker, then re-stamps
//       using `createdAt` (with a per-stage ms offset to preserve internal
//       order) as a conservative lower bound.
//
// Usage:
//   node scripts/task-tracker/heal-entry-markers.mjs [#N ...] [--apply]
//
// Without `--apply`, runs in dry-run mode and prints the plan. Without issue
// numbers, scans all open issues in the configured repo.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config.mjs';
import {
  STAGES,
  parseEntryMarkers,
  backfillEntryMarker,
} from './lib/stage-entry-markers.mjs';
import { GH_API_TIMEOUT_MS } from './lib/process-timeouts.mjs';

const pexec = promisify(execFile);

const HEALABLE_STAGES = ['refine', 'plan'];
const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s, i]));

function parseArgs(argv) {
  const issues = [];
  let apply = false;
  for (const a of argv) {
    if (a === '--apply') apply = true;
    else if (/^#?\d+$/.test(a)) issues.push(String(a).replace(/^#/, ''));
  }
  return { issues, apply };
}

async function fetchOpenIssues(repo) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'list', '-R', repo, '--state', 'open', '--limit', '200', '--json', 'number'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return JSON.parse(stdout).map((i) => String(i.number));
}

async function fetchIssue(repo, num) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', num, '-R', repo, '--json', 'number,body,createdAt'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return JSON.parse(stdout);
}

async function writeBody(repo, num, body) {
  const tmp = path.join(tmpdir(), `aitm-heal-entry-${process.pid}-${Date.now()}.md`);
  writeFileSync(tmp, body, 'utf8');
  try {
    await pexec('gh', ['issue', 'edit', num, '-R', repo, '--body-file', tmp], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* best-effort */
    }
  }
}

async function postComment(repo, num, body) {
  await pexec('gh', ['issue', 'comment', num, '-R', repo, '--body', body], {
    timeout: GH_API_TIMEOUT_MS,
  });
}

function normalizeTs(iso) {
  return String(iso || '').replace(/\.\d+Z$/, 'Z');
}

// Strip both entry and audit-backfill markers for a single stage. Used before
// re-stamping out-of-order entries.
export function stripStageMarkers(body, stage) {
  const entryRe = new RegExp(
    `[ \\t]*<!--\\s*aitm-entered-${stage}:[^>]*?-->[ \\t]*\\n?`,
    'gi'
  );
  const auditRe = new RegExp(
    `[ \\t]*<!--\\s*aitm-backfill:\\s*${stage}:[^>]*?-->[ \\t]*\\n?`,
    'gi'
  );
  return body.replace(entryRe, '').replace(auditRe, '').replace(/\n{3,}/g, '\n\n');
}

// Compute a safe ts for backfilling <stage>: the earlier of `createdAt` and
// `earliestLaterStageTs - 1ms`. Adds a per-stage ms offset so multiple
// backfilled stages preserve their relative order (refine < plan < ...).
export function safeBackfillTs({ stage, markers, createdAt }) {
  const stageIdx = STAGE_INDEX[stage];
  const createdMs = Date.parse(createdAt);
  let upperMs = null;
  for (const [s, ts] of Object.entries(markers)) {
    if (s === stage) continue;
    if (STAGE_INDEX[s] > stageIdx) {
      const ms = Date.parse(ts);
      if (Number.isFinite(ms) && (upperMs === null || ms < upperMs)) upperMs = ms;
    }
  }
  let baseMs;
  if (Number.isFinite(createdMs) && (upperMs === null || createdMs < upperMs)) {
    baseMs = createdMs;
  } else if (upperMs !== null) {
    // createdAt isn't usable; fall back to earliest-later - (STAGES.length).
    baseMs = upperMs - STAGES.length;
  } else {
    throw new Error(`safeBackfillTs: no usable bound for stage ${stage}`);
  }
  return normalizeTs(new Date(baseMs + stageIdx).toISOString());
}

// Detect out-of-order: returns the set of HEALABLE_STAGES whose timestamp is
// strictly greater than at least one later-indexed stage's timestamp.
export function outOfOrderHealableStages(markers) {
  const out = new Set();
  for (const stage of HEALABLE_STAGES) {
    if (!(stage in markers)) continue;
    const ts = markers[stage];
    const stageIdx = STAGE_INDEX[stage];
    for (const [s, otherTs] of Object.entries(markers)) {
      if (s === stage) continue;
      if (STAGE_INDEX[s] > stageIdx && ts > otherTs) {
        out.add(stage);
        break;
      }
    }
  }
  return out;
}

// Decide what to do for one stage. Returns { action, ts?, reason?, mode? }.
export function planStageHeal({ stage, body, createdAt }) {
  const markers = parseEntryMarkers(body);
  const hasEntry = stage in markers;
  const hasAudit = new RegExp(`<!--\\s*aitm-backfill:\\s*${stage}:`, 'i').test(body);
  const hasLater = Object.entries(markers).some(
    ([s]) => STAGE_INDEX[s] > STAGE_INDEX[stage]
  );
  const outOfOrder = outOfOrderHealableStages(markers).has(stage);

  if (outOfOrder) {
    const stripped = stripStageMarkers(body, stage);
    const ts = safeBackfillTs({
      stage,
      markers: parseEntryMarkers(stripped),
      createdAt,
    });
    return {
      action: 'restamp',
      ts,
      reason: 'out-of-order-chain-heal',
      mode: 'restamp',
      strippedBody: stripped,
    };
  }
  if (hasLater && !hasEntry) {
    const ts = safeBackfillTs({ stage, markers, createdAt });
    return {
      action: 'backfill',
      ts,
      reason: 'pre-gate-traversal',
      mode: 'entry+audit',
    };
  }
  if (hasEntry && hasLater && !hasAudit) {
    const m = new RegExp(`<!--\\s*aitm-entered-${stage}:\\s*([^\\s-][^\\s]*?)\\s*-->`, 'i').exec(
      body
    );
    const ts = m ? normalizeTs(m[1]) : null;
    if (!ts) return { action: 'skip', reason: 'entry-marker-unparseable' };
    return { action: 'audit-only', ts, reason: 'audit-only-unaudited-entry', mode: 'audit-only' };
  }
  return { action: 'skip', reason: 'no-heal-needed' };
}

function applyStageHeal({ body, stage, plan }) {
  if (plan.action === 'restamp') {
    return backfillEntryMarker(plan.strippedBody, stage, plan.ts, plan.reason);
  }
  return backfillEntryMarker(body, stage, plan.ts, plan.reason);
}

async function healOne({ repo, num, apply }) {
  const issue = await fetchIssue(repo, num);
  let body = issue.body || '';
  const createdAt = normalizeTs(issue.createdAt);
  const stagesActed = [];
  for (const stage of HEALABLE_STAGES) {
    const plan = planStageHeal({ stage, body, createdAt });
    if (plan.action === 'skip') continue;
    stagesActed.push({ stage, ...plan });
    if (apply) body = applyStageHeal({ body, stage, plan });
  }
  if (stagesActed.length === 0) {
    return { num, action: 'skip', reason: 'no-heal-needed' };
  }
  if (!apply) {
    return { num, action: 'plan', stagesActed };
  }
  await writeBody(repo, num, body);
  const summary = stagesActed
    .map((s) => `\`aitm-entered-${s.stage}: ${s.ts}\` (${s.action}, reason: ${s.reason})`)
    .join('; ');
  const commentBody = `🛠 Heal entry markers: ${summary}. The chain-integrity close gate (#138) requires monotonic, audited stage-entry markers; this comment + the per-stage \`aitm-backfill\` markers provide retroactive provenance.`;
  await postComment(repo, num, commentBody);
  return { num, action: 'applied', stagesActed };
}

async function main() {
  const { issues, apply } = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  const repo = cfg.repo;
  const targets = issues.length > 0 ? issues : await fetchOpenIssues(repo);
  const results = [];
  for (const num of targets) {
    try {
      results.push(await healOne({ repo, num, apply }));
    } catch (err) {
      results.push({ num, action: 'error', reason: err.message });
    }
  }
  for (const r of results) {
    if (r.action === 'plan') {
      const parts = r.stagesActed.map(
        (s) => `${s.stage}=${s.action}:${s.ts}(${s.reason})`
      );
      process.stdout.write(`#${r.num}: would heal ${parts.join(', ')}\n`);
    } else if (r.action === 'applied') {
      const parts = r.stagesActed.map((s) => `${s.stage}=${s.action}:${s.ts}`);
      process.stdout.write(`#${r.num}: healed ${parts.join(', ')}\n`);
    } else if (r.action === 'skip') {
      process.stdout.write(`#${r.num}: skip (${r.reason})\n`);
    } else if (r.action === 'error') {
      process.stderr.write(`#${r.num}: ERROR ${r.reason}\n`);
    }
  }
  if (!apply) {
    process.stdout.write('\n(dry-run — pass --apply to write)\n');
  }
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
    process.stderr.write(`heal-entry-markers: ${err.message}\n`);
    process.exit(1);
  });
}
