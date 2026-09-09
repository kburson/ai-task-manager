// @story #1557
// Explicit, interruption-safe migration from legacy blocker carriers to
// GitHub's native issue dependency graph.

import { pexec } from '../../gh/lib/gh-client.mjs';
import {
  clearProjectFieldValue,
  gql,
  projectItemForIssue,
  splitRepo,
} from '../../gh/lib/github-projects.mjs';
import {
  deriveDependencyProjection,
  reconcileDependencyDisposition,
} from '../lib/dependency-disposition.mjs';
import { fetchAssignmentSnapshot } from '../lib/assignment-snapshot.mjs';
import {
  blockedLabelRemoveArgs,
  parseBlockedByStrict,
  removeBlockedBy,
} from '../lib/blocked-marker.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { maskFencedCodeBlocksPreservingOffsets, stripFencedCodeBlocks } from '../lib/markers.mjs';
import { convergeBlockedBySet, readNativeDependencies } from '../lib/native-dependencies.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';
import { fieldIdFor } from '../project-fields.mjs';

function canonicalRefs(refs) {
  if (!Array.isArray(refs)) throw new Error('migrate-dependencies: invalid dependency refs');
  const values = refs.map(Number);
  if (values.some((ref) => !Number.isSafeInteger(ref) || ref <= 0)) {
    throw new Error('migrate-dependencies: invalid dependency refs');
  }
  return [...new Set(values)].sort((left, right) => left - right);
}

function labelNames(labels) {
  return (Array.isArray(labels) ? labels : [])
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter((label) => typeof label === 'string');
}

function hasLegacyFieldValue(issue) {
  return String(issue?.legacyBlockedBy || '').trim().length > 0;
}

export function classifyLegacyDependencyIssue(issue = {}) {
  const issueNumber = Number(issue.number);
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('migrate-dependencies: issue number is invalid');
  }
  const closed = String(issue.state || '').toUpperCase() === 'CLOSED';
  const body = String(issue.body || '');
  const visibleBody = stripFencedCodeBlocks(body);
  const labels = labelNames(issue.labels);
  const legacyLabel = labels.includes('BLOCKED');
  const legacyField = hasLegacyFieldValue(issue);
  let refs;
  try {
    refs = parseBlockedByStrict(visibleBody);
  } catch (error) {
    return {
      issue: issueNumber,
      kind: closed ? 'closed-history' : 'malformed',
      refs: [],
      reason: error.message,
    };
  }
  if (closed && (refs.length || legacyLabel || legacyField)) {
    return { issue: issueNumber, kind: 'closed-history', refs };
  }
  if (refs.length) return { issue: issueNumber, kind: 'strict-open', refs };
  if (legacyLabel && !legacyField) {
    return { issue: issueNumber, kind: 'ambiguous-label-only', refs: [] };
  }
  if (legacyField && !legacyLabel) {
    return { issue: issueNumber, kind: 'ambiguous-field-only', refs: [] };
  }
  if (legacyLabel && legacyField) {
    return { issue: issueNumber, kind: 'ambiguous-carriers', refs: [] };
  }
  return { issue: issueNumber, kind: 'none', refs: [] };
}

export function parseMigrationArgs(args = []) {
  const tokens = [...args];
  const dryRun = tokens.filter((token) => token === '--dry-run').length;
  const apply = tokens.filter((token) => token === '--apply').length;
  if (
    tokens.some((token) => !['--dry-run', '--apply'].includes(token)) ||
    dryRun + apply !== 1 ||
    dryRun > 1 ||
    apply > 1
  ) {
    throw new TypeError('migrate-dependencies: exactly one of --dry-run or --apply is required');
  }
  return { apply: apply === 1, dryRun: dryRun === 1 };
}

function sameRefs(left, right) {
  return JSON.stringify(canonicalRefs(left)) === JSON.stringify(canonicalRefs(right));
}

function migrationActions(candidate) {
  const before = new Set(canonicalRefs(candidate.nativeBefore || []));
  const added = canonicalRefs(candidate.refs).filter((ref) => !before.has(ref));
  return [
    ...added.map((ref) => `add-native:#${ref}`),
    `project:${candidate.projectionTarget === '' ? 'EMPTY' : candidate.projectionTarget || 'BLOCKED'}`,
    fieldIdFor(candidate.cfg || {}, 'blockedBy') || candidate.fieldConfigured
      ? 'clear-field'
      : 'field-not-configured',
    'remove-label',
    'remove-marker',
  ];
}

async function defaultClearLegacyField({ candidate, cfg }) {
  const fieldId = fieldIdFor(cfg, 'blockedBy');
  if (!fieldId) return { status: 'field-not-configured' };
  let itemId = candidate.itemId;
  if (!itemId) {
    const item = await projectItemForIssue({
      repo: cfg.repo,
      projectId: cfg.projectId,
      issueNumber: candidate.issue,
    });
    itemId = item?.itemId;
  }
  if (!itemId) return { status: 'item-not-found' };
  await clearProjectFieldValue({ projectId: cfg.projectId, itemId, fieldId });
  return { status: 'cleared' };
}

async function defaultRemoveLegacyLabel({ candidate, cfg }) {
  if (!labelNames(candidate.labels).includes('BLOCKED')) return { status: 'absent' };
  await pexec('gh', [...blockedLabelRemoveArgs(candidate.issue), '-R', cfg.repo], {
    timeout: GH_API_TIMEOUT_MS,
  });
  return { status: 'removed' };
}

export function removeStrictVisibleMarker(body, expectedRefs) {
  const visible = stripFencedCodeBlocks(body);
  const liveRefs = parseBlockedByStrict(visible);
  if (!sameRefs(liveRefs, expectedRefs)) {
    throw new Error('migrate-dependencies: live legacy marker changed during migration');
  }
  const masked = maskFencedCodeBlocksPreservingOffsets(body);
  const nextMasked = removeBlockedBy(masked, expectedRefs);
  if (nextMasked === masked) return body;
  const removedLength = masked.length - nextMasked.length;
  if (removedLength <= 0) {
    throw new Error('migrate-dependencies: legacy marker removal was not bounded');
  }
  let prefix = 0;
  while (prefix < nextMasked.length && masked[prefix] === nextMasked[prefix]) prefix += 1;
  return body.slice(0, prefix) + body.slice(prefix + removedLength);
}

async function defaultRemoveLegacyMarker({ candidate, cfg }) {
  return mutateIssueBody({
    issueNumber: candidate.issue,
    repo: cfg.repo,
    allowMarkerLoss: true,
    mutate: (body) => removeStrictVisibleMarker(body, candidate.refs),
  });
}

export async function migrateLegacyDependencyIssue({ candidate, cfg, apply, deps = {} } = {}) {
  if (candidate?.kind !== 'strict-open') {
    throw new Error('migrate-dependencies: only strict-open candidates may be migrated');
  }
  if (!cfg?.repo || !cfg?.projectId) throw new Error('migrate-dependencies: cfg is required');
  const refs = canonicalRefs(candidate.refs);
  const nativeBefore = canonicalRefs(candidate.nativeBefore || []);
  const desired = canonicalRefs([...nativeBefore, ...refs]);
  const prepared = {
    ...candidate,
    refs,
    nativeBefore,
    cfg,
    projectionTarget: candidate.projectionTarget ?? 'BLOCKED',
  };
  const actions = migrationActions(prepared);
  if (!apply) {
    return {
      issue: prepared.issue,
      kind: prepared.kind,
      refs,
      nativeBefore,
      nativeAfter: desired,
      actions,
      status: 'dry-run',
    };
  }

  const converge = deps.convergeBlockedBySet || convergeBlockedBySet;
  await converge({ issueNumber: prepared.issue, repo: cfg.repo, desired, deps });
  const readDependencies = deps.readNativeDependencies || readNativeDependencies;
  const graph = await readDependencies({ issueNumber: prepared.issue, repo: cfg.repo, deps });
  if (!sameRefs(graph?.blockedBy || [], desired)) {
    throw new Error('migrate-dependencies: native dependency readback mismatch');
  }
  const reconcile = deps.reconcileDependencyDisposition || reconcileDependencyDisposition;
  const projection = await reconcile({ issueNumber: prepared.issue, cfg, deps });
  const clearLegacyField = deps.clearLegacyField || defaultClearLegacyField;
  const field = await clearLegacyField({ candidate: prepared, cfg });
  const removeLegacyLabel = deps.removeLegacyLabel || defaultRemoveLegacyLabel;
  const label = await removeLegacyLabel({ candidate: prepared, cfg });
  const removeLegacyMarker = deps.removeLegacyMarker || defaultRemoveLegacyMarker;
  const marker = await removeLegacyMarker({ candidate: prepared, cfg });

  return {
    issue: prepared.issue,
    kind: prepared.kind,
    refs,
    nativeBefore,
    nativeAfter: desired,
    actions,
    projection,
    cleanup: { field, label, marker },
    status: 'migrated',
  };
}

export async function listLegacyDependencyIssues({ cfg, deps = {} } = {}) {
  const query = deps.gql || gql;
  const { owner, repoName } = splitRepo(cfg.repo);
  const issues = [];
  let cursor = null;
  for (let page = 0; page < 1000; page += 1) {
    const data = await query(
      `query($owner:String!,$repo:String!,$cursor:String){
        repository(owner:$owner,name:$repo){
          issues(first:100,after:$cursor,states:[OPEN,CLOSED],orderBy:{field:CREATED_AT,direction:ASC}){
            nodes{
              number state body
              labels(first:100){nodes{name} pageInfo{hasNextPage}}
              projectItems(first:20){
                nodes{id project{id} fieldValues(first:50){
                  nodes{... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2FieldCommon{id}}}}
                  pageInfo{hasNextPage}
                }}
                pageInfo{hasNextPage}
              }
            }
            pageInfo{hasNextPage endCursor}
          }
        }
      }`,
      { owner, repo: repoName, cursor }
    );
    const connection = data?.repository?.issues;
    if (
      !Array.isArray(connection?.nodes) ||
      typeof connection?.pageInfo?.hasNextPage !== 'boolean'
    ) {
      throw new Error('migrate-dependencies: issue enumeration is incomplete');
    }
    for (const issue of connection.nodes) {
      if (
        issue.labels?.pageInfo?.hasNextPage ||
        issue.projectItems?.pageInfo?.hasNextPage ||
        !Array.isArray(issue.labels?.nodes) ||
        !Array.isArray(issue.projectItems?.nodes)
      ) {
        throw new Error(`migrate-dependencies: issue #${issue.number} carriers are incomplete`);
      }
      const projectItems = issue.projectItems.nodes.filter(
        (item) => item?.project?.id === cfg.projectId
      );
      if (projectItems.length > 1) {
        throw new Error(`migrate-dependencies: issue #${issue.number} project item is ambiguous`);
      }
      const item = projectItems[0] || null;
      if (
        item?.fieldValues?.pageInfo?.hasNextPage ||
        !Array.isArray(item?.fieldValues?.nodes || [])
      ) {
        throw new Error(
          `migrate-dependencies: issue #${issue.number} project fields are incomplete`
        );
      }
      const blockedByFieldId = fieldIdFor(cfg, 'blockedBy');
      const fieldNode = blockedByFieldId
        ? item?.fieldValues?.nodes?.find((node) => node?.field?.id === blockedByFieldId)
        : null;
      issues.push({
        number: issue.number,
        state: issue.state,
        body: issue.body || '',
        labels: labelNames(issue.labels.nodes),
        itemId: item?.id || null,
        legacyBlockedBy: fieldNode?.text || '',
      });
    }
    if (!connection.pageInfo.hasNextPage) return issues;
    if (!connection.pageInfo.endCursor) {
      throw new Error('migrate-dependencies: issue enumeration cursor is missing');
    }
    cursor = connection.pageInfo.endCursor;
  }
  throw new Error('migrate-dependencies: issue enumeration exceeded page limit');
}

async function projectionTargetForRefs(refs, cfg, deps) {
  const states = new Map();
  const fetchSnapshot = deps.fetchAssignmentSnapshot || fetchAssignmentSnapshot;
  for (const ref of refs) {
    try {
      const snapshot = await fetchSnapshot({ issueNumber: ref, cfg, deps });
      states.set(ref, snapshot?.state || null);
    } catch {
      states.set(ref, null);
    }
  }
  return deriveDependencyProjection({ blockedBy: refs, states }).status === 'ready'
    ? ''
    : 'BLOCKED';
}

export async function runDependencyMigration({ cfg, apply, deps = {} } = {}) {
  if (!cfg?.repo || !cfg?.projectId) throw new Error('migrate-dependencies: cfg is required');
  const listIssues = deps.listIssues || listLegacyDependencyIssues;
  const issues = await listIssues({ cfg, deps });
  const results = [];
  let partial = false;
  let ambiguous = false;
  for (const issue of issues) {
    const classification = classifyLegacyDependencyIssue(issue);
    if (classification.kind !== 'strict-open') {
      if (classification.kind.startsWith('ambiguous') || classification.kind === 'malformed') {
        ambiguous = true;
      }
      results.push({ ...classification, status: 'skipped' });
      continue;
    }
    try {
      const readDependencies = deps.readNativeDependencies || readNativeDependencies;
      const graph = await readDependencies({ issueNumber: issue.number, repo: cfg.repo, deps });
      const desired = canonicalRefs([...(graph?.blockedBy || []), ...classification.refs]);
      const projectionTarget = await projectionTargetForRefs(desired, cfg, deps);
      results.push(
        await migrateLegacyDependencyIssue({
          candidate: {
            ...issue,
            issue: issue.number,
            kind: classification.kind,
            refs: classification.refs,
            nativeBefore: graph?.blockedBy || [],
            projectionTarget,
          },
          cfg,
          apply,
          deps,
        })
      );
    } catch (error) {
      partial = true;
      results.push({
        ...classification,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    mode: apply ? 'apply' : 'dry-run',
    results,
    exitCode: partial ? 1 : apply && ambiguous ? 3 : 0,
  };
}

export async function verbMigrateDependencies(ctx) {
  let parsed;
  try {
    parsed = parseMigrationArgs(ctx.rest);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return null;
  }
  const result = await runDependencyMigration({
    cfg: ctx.cfg,
    apply: parsed.apply,
    deps: ctx.deps || {},
  });
  for (const row of result.results) console.log(JSON.stringify(row));
  console.log(
    `[task-tracker] dependency migration ${result.mode}: ${result.results.length} issue(s) inspected`
  );
  process.exitCode = result.exitCode;
  return result;
}
