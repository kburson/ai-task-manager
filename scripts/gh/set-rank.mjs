#!/usr/bin/env node
import { enforceDirectGuidance } from '../task-tracker/lib/direct-guidance-admission.mjs';
enforceDirectGuidance(import.meta.url, 'set-rank');
// @story #2092 #2104
// Independently verify configured board Rank and synchronize only its body cache.
// Pending Refine recovery retains the exact original sealed key and operation.
// Usage: set-rank <issue#> <n> [--refine-key-file <path>]

import { loadConfig } from '../task-tracker/config.mjs';
import { tetherIssueToProject } from './lib/project-tether.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
import { readFileSync } from 'node:fs';
import { pexec } from './lib/gh-client.mjs';
import { fetchIssueProjectMembership } from './lib/project-membership.mjs';
import { GH_API_TIMEOUT_MS } from '../task-tracker/lib/process-timeouts.mjs';
import { mutateIssueBody } from '../task-tracker/lib/issue-body-mutate.mjs';
import { parseIssueFieldDb, formatIssueFieldDb } from '../task-tracker/issue-field-db.mjs';
import { readDecompositionRecords } from '../task-tracker/lib/decomposition-records.mjs';
import { canonicalDecompositionJson as canonical } from '../task-tracker/lib/decomposition-assessment.mjs';
import { estimateEffectDigest } from '../task-tracker/lib/decomposition-publication.mjs';
import {
  estimateOperationId,
  resolveEstimateOperationId,
  readEstimateBeforeRecord,
} from '../task-tracker/lib/estimate-writer-publication.mjs';

function refuse(reason) {
  throw new Error(`set-rank:${reason}`);
}
function readRefineKey(file) {
  if (!file) return null;
  let key;
  try {
    const raw = readFileSync(file, 'utf8');
    if (Buffer.byteLength(raw) > 8192) refuse('refine-key-limit');
    key = JSON.parse(raw);
  } catch {
    refuse('refine-key-unreadable');
  }
  if (
    !key ||
    Array.isArray(key) ||
    JSON.stringify(Object.keys(key).sort()) !== '["estimate","priority","rank","reason","size"]' ||
    !['XS', 'S', 'M', 'L', 'XL'].includes(key.size) ||
    typeof key.estimate !== 'number' ||
    !Number.isFinite(key.estimate) ||
    key.estimate < 0 ||
    !['p0', 'p1', 'p2'].includes(key.priority) ||
    !(key.rank === null || (typeof key.rank === 'number' && Number.isFinite(key.rank))) ||
    typeof key.reason !== 'string' ||
    !key.reason.trim()
  )
    refuse('refine-key-invalid');
  return key;
}
// Compatibility is evidence about the existing intent, never permission to replace it.
function compatibility(body, cfg, issue, rank, key, itemId) {
  const publication = readDecompositionRecords(body).publication;
  if (publication?.status !== 'pending') {
    if (key) refuse('refine-key-without-pending-intent');
    return null;
  }
  if (!key) refuse('pending-refine-key-required');
  const before = readEstimateBeforeRecord(body);
  const sealed = publication.effects.find((effect) => effect.id === 'writer-before-values');
  const prefix = `${cfg.repo}#${issue}:estimate-before`;
  const context = publication.effects.find((effect) => effect.id === 'authority-context');
  const intent = estimateOperationId('refine', key);
  if (
    publication.writerId !== 'refine' ||
    publication.subject.repository !== cfg.repo ||
    publication.subject.issue !== Number(issue) ||
    publication.subject.projectId !== cfg.projectId ||
    publication.subject.projectItemId !== itemId ||
    !before ||
    before.writerId !== 'refine' ||
    before.operationId !== publication.operationId ||
    canonical(before.subject) !== canonical(publication.subject) ||
    before.beforeInputDigest !== publication.beforeInputDigest ||
    before.intendedInputDigest !== publication.intendedInputDigest ||
    sealed?.resource !== 'assessment' ||
    sealed.intendedDigest !== estimateEffectDigest(before) ||
    ![`${prefix}:${intent}`, ...(publication.operationId === intent ? [prefix] : [])].includes(
      sealed.targetIdentity
    ) ||
    resolveEstimateOperationId('refine', key, publication) !== publication.operationId ||
    publication.proposal.size !== key.size ||
    publication.proposal.estimate.hours !== key.estimate ||
    (key.rank !== null && key.rank !== rank) ||
    (context &&
      (context.resource !== 'assessment' ||
        context.targetIdentity !== `${cfg.repo}#${issue}:authority-context`)) ||
    publication.effects.filter((effect) => effect.id !== 'authority-context').length !==
      before.effects.length + 1 ||
    before.effects.some((effect) => {
      const actual = publication.effects.find((candidate) => candidate.id === effect.id);
      return (
        !actual ||
        ['resource', 'targetIdentity', 'intendedDigest'].some(
          (field) => actual[field] !== effect[field]
        )
      );
    })
  )
    refuse('pending-refine-intent-incompatible');
  return canonical({ publication, before });
}
function fieldCache(body) {
  const parsed = parseIssueFieldDb(body);
  if (!parsed.ok || [...body.matchAll(/<!--\s*aitm-fields:/g)].length !== 1)
    refuse('field-cache-unavailable');
  return parsed;
}
async function fetchBody({ repo, issueNumber }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return String(stdout || '');
}
// One complete provider observation binds rank to the current configured item.
async function readRank({ cfg, issueNumber }) {
  const { item } = await fetchIssueProjectMembership({
    repo: cfg.repo,
    projectId: cfg.projectId,
    issueNumber,
    itemFields: `fieldValues(first: 100) {
      nodes { ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { id } } } }
      pageInfo { hasNextPage }
    }`,
  });
  if (
    !item?.id ||
    !Array.isArray(item.fieldValues?.nodes) ||
    item.fieldValues.pageInfo?.hasNextPage !== false
  )
    refuse('rank-observation-incomplete');
  const values = item.fieldValues.nodes.filter(
    (value) => value.field?.id === resolveRankFieldId(cfg)
  );
  if (values.length > 1) refuse('rank-observation-ambiguous');
  return { itemId: item.id, rank: values[0]?.number ?? null };
}

// Same precedence writeFields() in project-tether.mjs uses to resolve the Rank
// field id. Detecting it up front lets the CLI warn+exit-0 (instead of throwing)
// on a board that never configured a Rank field — matching project-tether's
// graceful WARN-and-skip behavior.
export function resolveRankFieldId(cfg = {}) {
  return (
    cfg.fieldRank ||
    cfg.rankFieldId ||
    cfg.fieldIds?.rank ||
    cfg.fieldSequence ||
    cfg.sequenceFieldId ||
    cfg.fieldIds?.sequence ||
    ''
  );
}

export async function main(argv, deps = {}) {
  const load = deps.loadConfig || loadConfig;
  const tether = deps.tetherIssueToProject || tetherIssueToProject;
  const log = deps.log || ((s) => console.log(s));
  const err = deps.err || ((s) => process.stderr.write(s));
  const exit = deps.exit || ((c) => process.exit(c));
  const skipNetwork =
    deps.skipNetwork !== undefined ? deps.skipNetwork : process.env.TT_SKIP_NETWORK === '1';

  const cliArgs = argv.slice(2);
  if (wantsHelp(cliArgs)) {
    emitSelfDoc('set-rank');
    return exit(0);
  }
  const issueArg = cliArgs[0];
  const rankArg = cliArgs[1];
  const rest = cliArgs.slice(2);
  const keyFile = rest[0] === '--refine-key-file' && rest.length === 2 ? rest[1] : null;

  const usage = () => {
    err(
      'Usage: node scripts/gh/set-rank.mjs <issue#> <n> [--refine-key-file <path>]\n' +
        '  <n>: integer Rank (wave order)\n'
    );
    return exit(1);
  };
  if (!issueArg || !rankArg) return usage();
  if (!/^\d+$/.test(issueArg)) return usage();
  if (!/^\d+$/.test(rankArg) || (rest.length && !keyFile)) return usage();

  const rank = Number(rankArg);
  if (!Number.isSafeInteger(rank)) return usage();
  const loaded = load();
  // Match resolveEstimateWriterSubject, including its sealed target prefixes.
  const cfg = {
    ...loaded,
    repo: typeof loaded.repo === 'string' ? loaded.repo.toLowerCase() : loaded.repo,
  };

  // Unconfigured Rank field: warn and exit 0 without a write, matching
  // project-tether.mjs (which WARNs and skips rather than throwing).
  if (!resolveRankFieldId(cfg)) {
    err(
      `[set-rank] WARN: rank=${rank} supplied but no Rank field id configured ` +
        `(checked cfg.fieldRank, cfg.rankFieldId, cfg.fieldIds.rank). Skipping write.\n`
    );
    return exit(0);
  }

  if (skipNetwork) refuse('network-suppressed-unverified');
  if (!cfg.repo || !cfg.projectId) refuse('configured-project-required');
  const key = readRefineKey(keyFile);
  const getBody = deps.fetchBody || fetchBody;
  const observeRank = deps.readRank || readRank;
  const mutateBody = deps.mutateBody || mutateIssueBody;
  const initial = await getBody({ repo: cfg.repo, issueNumber: issueArg });
  fieldCache(initial);
  const observedInitial = await observeRank({ cfg, issueNumber: issueArg });
  const itemId = observedInitial?.itemId;
  if (typeof itemId !== 'string' || !itemId) refuse('project-item-unavailable');
  const expected = compatibility(initial, cfg, issueArg, rank, key, itemId);
  const written = await tether({ cfg, issueNumber: issueArg, rank });
  if (written?.itemId && written.itemId !== itemId) refuse('project-item-write-drift');
  const verifyBoard = async () => {
    const observed = await observeRank({ cfg, issueNumber: issueArg });
    if (observed?.itemId !== itemId) refuse('project-item-readback-drift');
    if (
      typeof observed.rank !== 'number' ||
      !Number.isFinite(observed.rank) ||
      observed.rank !== rank
    )
      refuse('rank-readback-unverified');
  };
  await verifyBoard();
  const validateFresh = async (base) => {
    if (compatibility(base, cfg, issueArg, rank, key, itemId) !== expected)
      refuse('pending-refine-intent-drift');
    fieldCache(base);
    await verifyBoard();
  };
  const result = await mutateBody({
    repo: cfg.repo,
    issueNumber: issueArg,
    mutate: async (base) => {
      await validateFresh(base);
      const parsed = fieldCache(base);
      if (parsed.values.rank === rank) return base;
      return (
        base.slice(0, parsed.start) +
        formatIssueFieldDb({ ...parsed.values, rank }) +
        base.slice(parsed.end)
      );
    },
    validateFreshBaseAsync: validateFresh,
  });
  if (!['ok', 'no-op'].includes(result?.status) || fieldCache(result.body).values.rank !== rank)
    refuse('body-readback-unverified');
  await validateFresh(result.body);
  log(`✓ #${issueArg} → rank ${rank} (board and body verified)`);
  return undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch((e) => {
    process.stderr.write(`fatal: ${e.message}\n`);
    process.exit(1);
  });
}
