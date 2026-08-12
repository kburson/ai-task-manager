// Recoverable Shelve transaction (#1215).

import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import { runMoveStateHost } from '../../gh/move-state.mjs';
import { clearProjectFieldValue, gql, splitRepo } from '../../gh/lib/github-projects.mjs';
import { readLastKnownState } from '../gh-timing-comment.mjs';
import { ensureIssueFieldDb, parseIssueFieldDb } from '../issue-field-db.mjs';
import { fieldIdFor, loadProjectFieldDefs } from '../project-fields.mjs';
import { runUnassign } from '../verbs/unassign.mjs';
import { defaultResolveLogin } from '../verbs/assign.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';
import { stripBodyVersion } from './versioned-issue-write.mjs';
import { actionPolicyFor, normalizeStateId } from './lifecycle-policy/index.mjs';
import { parseMarker, serializeMarker } from './marker-grammar.mjs';
import { canonicalLogins, ownershipDecision } from './ownership-policy.mjs';
import { hasExecutionProof, stripExecutionProof } from './proof-marker.mjs';
import { verifyRefinementSnapshot } from './refinement-snapshot.mjs';
import {
  appendRefinementHistory,
  buildRefinementHistoryRecord,
  parseRefinementHistory,
  refinementBodyFingerprints,
  refinementHistoryMatchesSource,
} from './refinement-history.mjs';

const pexec = promisify(execFile);

export const SHELVE_PHASES = Object.freeze([
  'snapshot-recorded',
  'active-evidence-cleared',
  'fields-cleared',
  'status-backlog',
  'owner-updated',
  'verified',
]);
export const SHELVE_JOURNAL_MARKER_RE = /<!--\s*aitm-shelve-transaction\s+[^>]*?-->/g;
const ACTIVE_FIELD_KEYS = Object.freeze(['priority', 'size', 'estimate', 'rank']);
const ACTIVE_MARKERS = Object.freeze([
  /<!--\s*aitm-refine-complete(?::[^>]*|\s+[^>]*?)\s*-->\s*\n?/gi,
  /<!--\s*aitm-refinement-rationale:\s*[^>]*?-->\s*\n?/gi,
  /<!--\s*aitm-ready-for-plan[^>]*?-->\s*\n?/gi,
  /<!--\s*aitm-refinement-snapshot\s+[^>]*?-->\s*\n?/gi,
  /<!--\s*aitm-plan-approved(?::[^>]*|\s+[^>]*?)\s*-->\s*\n?/gi,
  /<!--\s*aitm-estimation-forecast(?:-ready)?\s+[^>]*?-->\s*\n?/gi,
  /<!--\s*aitm-deep-dive-posted(?::[^>]*|\s+[^>]*?)\s*-->\s*\n?/gi,
  /<!--\s*aitm-deep-dive-complete(?::[^>]*|\s+[^>]*?)\s*-->\s*\n?/gi,
  /<!--\s*aitm-test-started(?::[^>]*|\s+[^>]*?)\s*-->\s*\n?/gi,
  /<!--\s*aitm-dod-verified(?::[^>]*|\s+[^>]*?)\s*-->\s*\n?/gi,
  /<!--\s*aitm-plan-cancelled\s+[^>]*?-->\s*\n?/gi,
]);

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function intentDigest(reason, removeOwner) {
  return sha256(
    JSON.stringify({ reason: String(reason).trim(), removeOwner: Boolean(removeOwner) })
  );
}

function fieldValue(node) {
  if (node?.number !== undefined && node?.number !== null) return node.number;
  if (node?.name !== undefined && node?.name !== null) return node.name;
  return null;
}

function exactProjectItem(issue, cfg) {
  const items = issue?.projectItems?.nodes;
  if (!Array.isArray(items) || issue.projectItems?.pageInfo?.hasNextPage) {
    throw new Error('shelve: configured project membership is unreadable');
  }
  const matches = items.filter((item) => item?.project?.id === cfg.projectId);
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? 'shelve: configured project membership is missing'
        : 'shelve: configured project membership is ambiguous'
    );
  }
  return matches[0];
}

async function defaultFetchSnapshot({ issueNumber, cfg }) {
  const { owner, repoName } = splitRepo(cfg.repo);
  const data = await gql(
    `query($owner:String!,$repo:String!,$issue:Int!){
      repository(owner:$owner,name:$repo){issue(number:$issue){
        title body state
        labels(first:100){nodes{name} pageInfo{hasNextPage}}
        assignees(first:100){nodes{login} pageInfo{hasNextPage}}
        projectItems(first:100){nodes{
          id project{id}
          fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}
          fieldValues(first:100){nodes{
            ... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2FieldCommon{id}}}
            ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2FieldCommon{id}}}
          } pageInfo{hasNextPage}}
        } pageInfo{hasNextPage}}
      }}
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const issue = data?.repository?.issue;
  if (!issue) throw new Error(`shelve: issue #${issueNumber} is missing`);
  if (issue.labels?.pageInfo?.hasNextPage || issue.assignees?.pageInfo?.hasNextPage) {
    throw new Error('shelve: labels or assignees exceed the bounded snapshot query');
  }
  const item = exactProjectItem(issue, cfg);
  if (item.fieldValues?.pageInfo?.hasNextPage) {
    throw new Error('shelve: configured project fields exceed the bounded snapshot query');
  }
  const state = normalizeStateId(item.fieldValueByName?.name);
  if (!state) throw new Error('shelve: configured project Status is unreadable');
  const nodes = item.fieldValues?.nodes;
  if (!Array.isArray(nodes)) throw new Error('shelve: configured project fields are unreadable');
  const fields = {};
  for (const key of ACTIVE_FIELD_KEYS) {
    const fieldId = fieldIdFor(cfg, key);
    if (!fieldId) throw new Error(`shelve: configured project field id is missing for ${key}`);
    fields[key] = fieldValue(nodes.find((node) => node?.field?.id === fieldId));
  }
  return {
    itemId: item.id,
    issueState: issue.state,
    title: issue.title || '',
    body: issue.body || '',
    labels: (issue.labels?.nodes || []).map((label) => label?.name).filter(Boolean),
    assignees: canonicalLogins(issue.assignees?.nodes || []),
    state,
    fields,
  };
}

async function defaultClearBoardFields({ cfg, snapshot }) {
  if (!snapshot?.itemId) throw new Error('shelve: configured project item id is missing');
  for (const key of ACTIVE_FIELD_KEYS) {
    const fieldId = fieldIdFor(cfg, key);
    if (!fieldId) throw new Error(`shelve: configured project field id is missing for ${key}`);
    await clearProjectFieldValue({
      projectId: cfg.projectId,
      itemId: snapshot.itemId,
      fieldId,
    });
  }
}

export function defaultRunMoveState({ issueNumber, reason }) {
  return runMoveStateHost({
    argv: [
      process.execPath,
      'move-state.mjs',
      String(issueNumber),
      'backlog',
      '--demote',
      '--demote-reason',
      String(reason),
    ],
    env: { ...process.env, AITM_INTERNAL: '1', AITM_VERB_CONTEXT: 'shelve' },
  });
}

async function defaultRemoveOwner({ issueNumber, cfg, previousOwner }) {
  const currentUser = await defaultResolveLogin('@me');
  if (String(currentUser || '').toLowerCase() !== String(previousOwner || '').toLowerCase()) {
    return { status: 'foreign-owner-refused' };
  }
  return runUnassign({
    issueNumber,
    cfg,
    currentUser,
    deps: { withIssueLock: async (_opts, fn) => fn() },
  });
}

async function defaultGetBaseSha() {
  const { stdout } = await pexec('git', ['rev-parse', 'HEAD']);
  return stdout.trim();
}

function clearProofInSections(body) {
  return String(body || '').replace(
    /(^##\s+(?:Acceptance Criteria|Verification Commands|Test|Testing|Definition of Done)\s*$[\s\S]*?)(?=^##\s+|(?![\s\S]))/gim,
    (section) =>
      section.replace(/^(\s*- \[)x(\]\s+)(.+)$/gm, (line, pre, post, rest) => {
        const clean = hasExecutionProof(rest) ? stripExecutionProof(rest) : rest;
        return `${pre} ${post}${clean}`;
      })
  );
}

export function invalidateShelveEvidence(body) {
  let next = String(body || '');
  for (const pattern of ACTIVE_MARKERS) next = next.replace(pattern, '');
  return clearProofInSections(next);
}

export function clearShelveBodyFields(body, { fieldDefs = loadProjectFieldDefs() } = {}) {
  const parsed = parseIssueFieldDb(body);
  if (!parsed.ok) throw new Error(`shelve: body fields are ${parsed.reason}`);
  const cleared = Object.fromEntries(ACTIVE_FIELD_KEYS.map((key) => [key, null]));
  return ensureIssueFieldDb(body, fieldDefs, cleared, { overrideKeys: ACTIVE_FIELD_KEYS }).body;
}

export function invalidateShelveBody(body, options = {}) {
  return clearShelveBodyFields(invalidateShelveEvidence(body), options);
}

export function activeFieldsAfterShelve(body) {
  const parsed = parseIssueFieldDb(body);
  if (!parsed.ok) return null;
  return Object.fromEntries(ACTIVE_FIELD_KEYS.map((key) => [key, parsed.values[key] ?? null]));
}

function fieldsCleared(fields) {
  return ACTIVE_FIELD_KEYS.every((key) => fields?.[key] === null || fields?.[key] === undefined);
}

export function shelveBodyIsInvalidated(body) {
  const active = activeFieldsAfterShelve(body);
  if (!active || !fieldsCleared(active)) return false;
  return shelveEvidenceIsInvalidated(body);
}

export function shelveEvidenceIsInvalidated(body) {
  if (ACTIVE_MARKERS.some((pattern) => new RegExp(pattern.source, pattern.flags).test(body))) {
    return false;
  }
  return !/(?:^##\s+(?:Acceptance Criteria|Verification Commands|Test|Testing|Definition of Done)\s*$[\s\S]*?)^\s*- \[x\]/gim.test(
    String(body || '')
  );
}

function serializeJournal(journal) {
  return serializeMarker('shelve-transaction', {
    schema: '1',
    tx: journal.tx,
    issue: journal.issueNumber,
    from: journal.from,
    phase: journal.phase,
    'intent-digest': journal.intentDigest,
    'history-digest': journal.historyDigest,
    'remove-owner': String(journal.removeOwner),
    'previous-owner': journal.previousOwner || '',
  });
}

export function parseShelveJournal(body) {
  const journals = parseShelveJournals(body);
  return journals.at(-1) || null;
}

export function parseShelveJournals(body) {
  const markers = [...String(body || '').matchAll(SHELVE_JOURNAL_MARKER_RE)];
  const journals = [];
  const seen = new Set();
  for (const match of markers) {
    const marker = parseMarker(match[0]);
    const props = marker?.props || {};
    if (
      marker?.name !== 'shelve-transaction' ||
      props.schema !== '1' ||
      !props.tx ||
      !SHELVE_PHASES.includes(props.phase) ||
      !/^[0-9a-f]{64}$/.test(props['intent-digest'] || '') ||
      !/^[0-9a-f]{64}$/.test(props['history-digest'] || '')
    ) {
      throw new Error('shelve: malformed transaction journal');
    }
    if (seen.has(props.tx)) throw new Error(`shelve: duplicate transaction journal ${props.tx}`);
    seen.add(props.tx);
    journals.push({
      tx: props.tx,
      issueNumber: Number(props.issue),
      from: props.from,
      phase: props.phase,
      intentDigest: props['intent-digest'],
      historyDigest: props['history-digest'],
      removeOwner: props['remove-owner'] === 'true',
      previousOwner: props['previous-owner'] || null,
    });
  }
  return journals;
}

function writeJournal(body, journal) {
  const marker = serializeJournal(journal);
  let found = false;
  const source = String(body || '');
  const updated = source.replace(SHELVE_JOURNAL_MARKER_RE, (candidate) => {
    const parsed = parseMarker(candidate);
    if (parsed?.props?.tx !== journal.tx) return candidate;
    found = true;
    return marker;
  });
  return found ? updated : `${source.trimEnd()}\n${marker}\n`;
}

function sameValue(left, right) {
  if (left == null && right == null) return true;
  if (typeof left === 'number' || typeof right === 'number') return Number(left) === Number(right);
  return String(left).toLowerCase() === String(right).toLowerCase();
}

function sameFields(left, right) {
  return ACTIVE_FIELD_KEYS.every((key) => sameValue(left?.[key], right?.[key]));
}

function sameLabels(left, right) {
  const a = [...(left || [])].map(String).sort();
  const b = [...(right || [])].map(String).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function mutateAndFetch({ mutateBodyFn, fetchSnapshot, issueNumber, cfg, mutate }) {
  await mutateBodyFn({
    issueNumber,
    repo: cfg.repo,
    mutate,
    allowMarkerLoss: true,
  });
  return fetchSnapshot({ issueNumber, cfg });
}

async function advanceJournal(context, phase) {
  const { journal } = context;
  if (SHELVE_PHASES.indexOf(journal.phase) >= SHELVE_PHASES.indexOf(phase)) return;
  const snapshot = await mutateAndFetch({
    ...context,
    mutate: (base) => {
      const live = parseShelveJournal(base);
      if (!live || live.tx !== journal.tx) throw new Error('shelve: transaction journal changed');
      return writeJournal(base, { ...live, phase });
    },
  });
  const updated = parseShelveJournal(snapshot.body);
  if (updated?.tx !== journal.tx || updated.phase !== phase) {
    throw new Error(`shelve: ${phase} journal read-back failed`);
  }
  Object.assign(journal, updated);
}

function currentHistory(body, journal) {
  const record = parseRefinementHistory(body).find((candidate) => candidate.tx === journal.tx);
  if (!record || record.digest !== journal.historyDigest) {
    throw new Error('shelve: immutable history read-back failed');
  }
  return record;
}

function verifyPreserved(snapshot, record) {
  const fingerprints = refinementBodyFingerprints(snapshot.body);
  return (
    snapshot.title === record.title &&
    sameLabels(snapshot.labels, record.labels) &&
    fingerprints.narrativeFingerprint === record.narrativeFingerprint &&
    fingerprints.scopeFingerprint === record.scopeFingerprint &&
    fingerprints.acceptanceCriteriaFingerprint === record.acceptanceCriteriaFingerprint &&
    fingerprints.storyOriginFingerprint === record.storyOriginFingerprint &&
    fingerprints.discussionFingerprint === record.discussionFingerprint &&
    fingerprints.planMetadataFingerprint === record.planMetadataFingerprint &&
    fingerprints.verificationCommandsFingerprint === record.verificationCommandsFingerprint &&
    fingerprints.testingFingerprint === record.testingFingerprint &&
    fingerprints.definitionOfDoneFingerprint === record.definitionOfDoneFingerprint
  );
}

function defaultAssertIssueLockHeld() {
  if (process.env.AITM_ISSUE_LOCK_HELD !== '1') {
    throw new Error('shelve: transaction authority requires the issue lock');
  }
}

function sourceMatchArgs(snapshot) {
  const owners = canonicalLogins(snapshot.assignees);
  return {
    title: snapshot.title,
    body: snapshot.body,
    fields: snapshot.fields,
    labels: snapshot.labels,
    previousOwner: owners.length === 1 ? owners[0] : null,
    sourceState: snapshot.state,
  };
}

function ownershipRefusal(snapshot, { gateAssignee, currentUser } = {}) {
  if (gateAssignee) {
    const ownership = ownershipDecision({
      state: snapshot.state,
      assignees: snapshot.assignees,
      currentUser,
      mode: 'interactive',
    });
    if (!ownership.ok) {
      const status =
        ownership.kind === 'foreign-owner'
          ? 'foreign-owner-refused'
          : ownership.kind === 'multiple-owners'
            ? 'multiple-owners-refused'
            : 'ownership-unverifiable-refused';
      return { status, assignees: ownership.owners, currentUser: ownership.currentUser };
    }
  }
  return null;
}

function sourceRefusal(snapshot, { gateAssignee, currentUser } = {}) {
  const recorded = readLastKnownState(snapshot.body).state;
  if (!recorded || recorded !== snapshot.state) {
    return { status: 'drift-refused', recorded, live: snapshot.state };
  }
  const policy = actionPolicyFor('shelve', snapshot.state);
  if (!policy.ok) return { status: 'invalid-source-refused', from: snapshot.state };
  const ownerRefusal = ownershipRefusal(snapshot, { gateAssignee, currentUser });
  if (ownerRefusal) return ownerRefusal;
  const parsedFields = parseIssueFieldDb(snapshot.body);
  if (!parsedFields.ok || !sameFields(parsedFields.values, snapshot.fields)) {
    return { status: 'fields-refused' };
  }
  const currentSnapshot = verifyRefinementSnapshot(snapshot.body, { labels: snapshot.labels });
  if (!currentSnapshot.ok) {
    return { status: 'snapshot-refused', reason: currentSnapshot.reason };
  }
  return null;
}

export async function runShelveTransaction({
  issueNumber,
  reason,
  removeOwner = false,
  cfg,
  deps = {},
} = {}) {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('shelve: issueNumber must be a positive integer');
  }
  if (!cfg?.repo || !cfg?.projectId) throw new Error('shelve: cfg is required');
  const why = String(reason || '').trim();
  if (!why) return { status: 'reason-required' };

  (deps.assertIssueLockHeld || defaultAssertIssueLockHeld)();

  const fetchSnapshot = deps.fetchSnapshot || defaultFetchSnapshot;
  const mutateBodyFn = deps.mutateBody || mutateIssueBody;
  const clearBoardFields = deps.clearBoardFields || defaultClearBoardFields;
  const runMoveState = deps.runMoveState || defaultRunMoveState;
  const removeOwnerFn = deps.removeOwner || defaultRemoveOwner;
  const getBaseSha = deps.getBaseSha || defaultGetBaseSha;
  const fieldDefs = deps.loadProjectFieldDefs
    ? deps.loadProjectFieldDefs()
    : loadProjectFieldDefs();
  const now = deps.now || (() => new Date().toISOString());
  const makeTx = deps.makeTx || randomUUID;
  const resolveLogin = deps.resolveLogin || defaultResolveLogin;
  const requestedIntent = intentDigest(why, removeOwner);

  let snapshot = await fetchSnapshot({ issueNumber, cfg });
  if (snapshot.issueState !== 'OPEN') {
    return {
      status: snapshot.issueState === 'CLOSED' ? 'closed-issue-refused' : 'issue-state-refused',
    };
  }
  const gateAssignee = cfg.preferences?.gateAssigneeMatch ?? true;
  let currentUser = null;
  if (gateAssignee) {
    try {
      currentUser = await resolveLogin('@me');
    } catch (error) {
      return { status: 'ownership-unverifiable-refused', error: error.message };
    }
  }
  const ownerRefusal = ownershipRefusal(snapshot, { gateAssignee, currentUser });
  if (ownerRefusal) return ownerRefusal;
  let journal = parseShelveJournal(snapshot.body);
  if (journal?.phase === 'verified' && actionPolicyFor('shelve', snapshot.state).ok) {
    currentHistory(snapshot.body, journal);
    journal = null;
  }
  if (journal) {
    if (
      journal.issueNumber !== issueNumber ||
      journal.intentDigest !== requestedIntent ||
      journal.removeOwner !== Boolean(removeOwner)
    ) {
      return { status: 'retry-intent-refused', phase: journal.phase };
    }
    currentHistory(snapshot.body, journal);
  } else {
    let refusal = sourceRefusal(snapshot, { gateAssignee, currentUser });
    if (refusal) return refusal;

    // Re-fetch the complete source immediately before building durable history.
    // The body write below also compares its fresh mutation base byte-for-byte,
    // while the post-write source digest covers the non-body surfaces.
    snapshot = await fetchSnapshot({ issueNumber, cfg });
    if (snapshot.issueState !== 'OPEN') {
      return {
        status: snapshot.issueState === 'CLOSED' ? 'closed-issue-refused' : 'issue-state-refused',
      };
    }
    refusal = sourceRefusal(snapshot, { gateAssignee, currentUser });
    if (refusal) return refusal;

    const owners = canonicalLogins(snapshot.assignees);
    const sourceBody = stripBodyVersion(snapshot.body);
    const tx = String(makeTx());
    const record = buildRefinementHistoryRecord({
      tx,
      issueNumber,
      title: snapshot.title,
      body: snapshot.body,
      fields: snapshot.fields,
      labels: snapshot.labels,
      reason: why,
      previousOwner: owners[0] || null,
      sourceState: snapshot.state,
      baseSha: await getBaseSha(),
      createdAt: now(),
    });
    journal = {
      tx,
      issueNumber,
      from: snapshot.state,
      phase: 'snapshot-recorded',
      intentDigest: requestedIntent,
      historyDigest: record.digest,
      removeOwner: Boolean(removeOwner),
      previousOwner: owners[0] || null,
    };
    try {
      snapshot = await mutateAndFetch({
        mutateBodyFn,
        fetchSnapshot,
        issueNumber,
        cfg,
        mutate: (base) => {
          if (sha256(base) !== sha256(sourceBody)) {
            throw new Error('shelve: source body changed before snapshot append');
          }
          return writeJournal(appendRefinementHistory(base, record), journal);
        },
      });
    } catch (error) {
      try {
        const observed = await fetchSnapshot({ issueNumber, cfg });
        const observedJournal = parseShelveJournal(observed.body);
        if (observedJournal?.tx === tx) {
          currentHistory(observed.body, observedJournal);
          return {
            status: 'recovery-pending',
            phase: observedJournal.phase,
            error: error.message,
          };
        }
      } catch {
        // The first write outcome cannot be proven; fail closed and let an
        // identical retry reconcile from the durable body if it landed.
      }
      return { status: 'snapshot-outcome-ambiguous', phase: null, error: error.message };
    }
    const readBack = parseShelveJournal(snapshot.body);
    if (readBack?.tx !== tx || readBack.phase !== 'snapshot-recorded') {
      throw new Error('shelve: snapshot-recorded journal read-back failed');
    }
    Object.assign(journal, readBack);
    const readBackRecord = currentHistory(snapshot.body, journal);
    if (!refinementHistoryMatchesSource(readBackRecord, sourceMatchArgs(snapshot))) {
      return {
        status: 'recovery-pending',
        phase: journal.phase,
        error: 'shelve: source changed before snapshot verification',
      };
    }
  }

  const context = { journal, mutateBodyFn, fetchSnapshot, issueNumber, cfg };
  try {
    if (SHELVE_PHASES.indexOf(journal.phase) < SHELVE_PHASES.indexOf('active-evidence-cleared')) {
      snapshot = await fetchSnapshot({ issueNumber, cfg });
      const record = currentHistory(snapshot.body, journal);
      if (!refinementHistoryMatchesSource(record, sourceMatchArgs(snapshot))) {
        throw new Error('shelve: source changed before destructive phases');
      }
      const sourceBody = stripBodyVersion(snapshot.body);
      snapshot = await mutateAndFetch({
        ...context,
        mutate: (base) => {
          if (sha256(base) !== sha256(sourceBody)) {
            throw new Error('shelve: source body changed before evidence invalidation');
          }
          return invalidateShelveEvidence(base);
        },
      });
      if (!shelveEvidenceIsInvalidated(snapshot.body)) {
        throw new Error('shelve: active evidence read-back failed');
      }
      await advanceJournal(context, 'active-evidence-cleared');
    }

    if (SHELVE_PHASES.indexOf(journal.phase) < SHELVE_PHASES.indexOf('fields-cleared')) {
      snapshot = await fetchSnapshot({ issueNumber, cfg });
      await clearBoardFields({ issueNumber, cfg, snapshot });
      snapshot = await mutateAndFetch({
        ...context,
        mutate: (base) => clearShelveBodyFields(base, { fieldDefs }),
      });
      if (
        !fieldsCleared(snapshot.fields) ||
        !fieldsCleared(activeFieldsAfterShelve(snapshot.body))
      ) {
        throw new Error('shelve: active field clear read-back failed');
      }
      await advanceJournal(context, 'fields-cleared');
    }

    if (SHELVE_PHASES.indexOf(journal.phase) < SHELVE_PHASES.indexOf('status-backlog')) {
      let moveError = null;
      try {
        const exitCode = await runMoveState({ issueNumber, reason: why, cfg });
        if (exitCode !== 0) moveError = new Error(`move delegate exited ${exitCode}`);
      } catch (error) {
        moveError = error;
      }
      snapshot = await fetchSnapshot({ issueNumber, cfg });
      if (snapshot.state !== 'backlog') {
        throw moveError || new Error(`shelve: Status read-back is ${snapshot.state}`);
      }
      await advanceJournal(context, 'status-backlog');
    }

    if (SHELVE_PHASES.indexOf(journal.phase) < SHELVE_PHASES.indexOf('owner-updated')) {
      if (removeOwner && journal.previousOwner) {
        const result = await removeOwnerFn({
          issueNumber,
          cfg,
          previousOwner: journal.previousOwner,
        });
        if (!['unassigned', 'already-unassigned'].includes(result?.status)) {
          throw new Error(`shelve: owner removal refused (${result?.status || 'unknown'})`);
        }
      }
      snapshot = await fetchSnapshot({ issueNumber, cfg });
      const expected = removeOwner || !journal.previousOwner ? [] : [journal.previousOwner];
      if (!sameLabels(canonicalLogins(snapshot.assignees), expected)) {
        throw new Error('shelve: owner read-back failed');
      }
      await advanceJournal(context, 'owner-updated');
    }

    snapshot = await fetchSnapshot({ issueNumber, cfg });
    const record = currentHistory(snapshot.body, journal);
    const expectedOwners = removeOwner || !journal.previousOwner ? [] : [journal.previousOwner];
    if (
      snapshot.issueState !== 'OPEN' ||
      snapshot.state !== 'backlog' ||
      !fieldsCleared(snapshot.fields) ||
      !shelveBodyIsInvalidated(snapshot.body) ||
      !sameLabels(canonicalLogins(snapshot.assignees), expectedOwners) ||
      !verifyPreserved(snapshot, record)
    ) {
      throw new Error('shelve: final exact read-back failed');
    }
    if (SHELVE_PHASES.indexOf(journal.phase) < SHELVE_PHASES.indexOf('verified')) {
      await advanceJournal(context, 'verified');
    }
  } catch (error) {
    return { status: 'recovery-pending', phase: journal.phase, error: error.message };
  }

  return { status: 'shelved', from: journal.from, to: 'backlog', tx: journal.tx };
}
