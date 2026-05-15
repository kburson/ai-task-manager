import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { auditEvidenceMarkers, buildEvidenceBackfill } from '../lib/evidence-markers.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';

const pexec = promisify(execFile);

async function defaultFetchIssueBody({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return stdout || '';
}

async function defaultWriteIssueBody({ issueNumber, repo, body }) {
  const tmp = path.join(tmpdir(), `aitm-evidence-${process.pid}-${Date.now()}.md`);
  writeFileSync(tmp, body, 'utf8');
  try {
    await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmp], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

export async function runEvidenceMarkers({
  issueNumber,
  mode = 'audit',
  cfg,
  mappings = {},
  dryRun = false,
  deps = {},
} = {}) {
  if (!issueNumber) throw new Error('evidence-markers: issueNumber is required');
  if (!cfg?.repo) throw new Error('evidence-markers: cfg.repo is required');

  const fetchIssueBody = deps.fetchIssueBody || defaultFetchIssueBody;
  const writeIssueBody = deps.writeIssueBody || defaultWriteIssueBody;
  const body = await fetchIssueBody({ issueNumber, repo: cfg.repo });

  if (mode === 'audit') {
    const audit = auditEvidenceMarkers(body);
    return { status: audit.ok ? 'clean' : 'issues-found', audit };
  }

  if (mode !== 'backfill') throw new Error(`evidence-markers: unknown mode ${mode}`);
  const result = buildEvidenceBackfill(body, { mappings });
  if (!result.ok) return { status: 'ambiguous', ...result };
  if (!dryRun && result.body !== body) {
    await writeIssueBody({ issueNumber, repo: cfg.repo, body: result.body });
  }
  return { status: dryRun ? 'dry-run' : 'backfilled', ...result };
}

function parseArgs(rest) {
  const mode = rest[0] === 'backfill' ? 'backfill' : 'audit';
  const issueArg = rest.find((arg) => /^#?\d+$/.test(String(arg)));
  const issueNumber = issueArg ? Number(String(issueArg).replace(/^#/, '')) : null;
  const dryRun = rest.includes('--dry-run');
  const mapIdx = rest.indexOf('--map-file');
  const mapFile = mapIdx >= 0 ? rest[mapIdx + 1] : null;
  return { mode, issueNumber, dryRun, mapFile };
}

function printAudit(audit) {
  for (const item of audit.missingEvidence) {
    console.log(`missing-evidence: ${item.label}`);
  }
  for (const cmd of audit.missingVerificationCommands) {
    console.log(`missing-verification-command: ${cmd}`);
  }
  for (const cmd of audit.staleVerificationCommands) {
    console.log(`stale-verification-command: ${cmd}`);
  }
}

export async function verbEvidenceMarkers(ctx) {
  const { mode, issueNumber, dryRun, mapFile } = parseArgs(ctx.rest);
  if (!issueNumber) {
    console.error(
      'Usage: /task evidence-markers <audit|backfill> #N [--map-file mappings.json] [--dry-run]'
    );
    process.exit(1);
  }
  let mappings = {};
  if (mode === 'backfill') {
    if (!mapFile) {
      console.error('evidence-markers backfill requires --map-file <json>');
      process.exit(2);
    }
    mappings = JSON.parse(readFileSync(mapFile, 'utf8'));
  }
  const result = await runEvidenceMarkers({ issueNumber, mode, cfg: ctx.cfg, mappings, dryRun });
  if (result.audit) printAudit(result.audit);
  if (result.status === 'ambiguous') {
    for (const label of result.ambiguousLabels) console.error(`ambiguous-evidence: ${label}`);
    process.exit(3);
  }
  console.log(`evidence-markers: ${result.status}`);
}
