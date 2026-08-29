import { readFileSync } from 'node:fs';
import { pexec } from '../../gh/lib/gh-client.mjs';
import { auditEvidenceMarkers, buildEvidenceBackfill } from '../lib/evidence-markers.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { readDirectoryContract } from '../lib/github-records/contract-write.mjs';

async function defaultFetchIssueBody({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return stdout || '';
}

// #295 — body writes go through `mutateIssueBody({ mutate })`.
async function defaultMutateIssueBody({ issueNumber, repo, mutate }) {
  return mutateIssueBody({ issueNumber, repo, mutate, deps: { pexec } });
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
  const mutateBody = deps.mutateIssueBody || defaultMutateIssueBody;
  const body = await fetchIssueBody({ issueNumber, repo: cfg.repo });
  const directory = await readDirectoryContract({
    repository: cfg.repo,
    issue: Number(issueNumber),
    issueBody: body,
    readContractRecord: deps.contractWrite?.readContractRecord,
  });

  if (directory) {
    return {
      status: mode === 'audit' || dryRun ? 'clean' : 'directory-managed',
      audit: {
        ok: true,
        missingEvidence: [],
        missingVerificationCommands: [],
        staleVerificationCommands: [],
      },
      contract: directory.contract,
    };
  }

  if (mode === 'audit') {
    const audit = auditEvidenceMarkers(body);
    return { status: audit.ok ? 'clean' : 'issues-found', audit };
  }

  if (mode !== 'backfill') throw new Error(`evidence-markers: unknown mode ${mode}`);
  const result = buildEvidenceBackfill(body, { mappings });
  if (!result.ok) return { status: 'ambiguous', ...result };
  if (!dryRun && result.body !== body) {
    // #295 — closure recomputes the backfill against the FRESH base. If the
    // live body has drifted, we rebuild rather than overwriting blindly.
    await mutateBody({
      issueNumber,
      repo: cfg.repo,
      mutate: (base) => {
        const r = buildEvidenceBackfill(base, { mappings });
        return r.ok ? r.body : base;
      },
    });
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
