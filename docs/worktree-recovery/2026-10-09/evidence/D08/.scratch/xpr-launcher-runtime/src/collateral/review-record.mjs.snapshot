import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { AprError } from '../errors.mjs';
import { createGitTransactionRepository } from '../git/transaction.mjs';
import { canonicalProjection, inspectReviewAuthority } from '../protocol/service.mjs';
import { parseResponse } from './responses.mjs';
import { resolveContainedPath, resolveReviewPaths } from './paths.mjs';

const ACCEPTED_STATES = new Set([
  'accepted',
  'accepted-uncommitted',
  'accepted-over-objections',
  'accepted-over-objections-uncommitted',
]);
const TERMINAL_STATES = new Set([...ACCEPTED_STATES, 'superseded', 'abandoned']);

function fail(code, message, recovery, details = {}, cause = null) {
  const error = new AprError(code, message, { recovery, details });
  if (cause) error.cause = cause;
  throw error;
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function canonicalTime(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    fail(
      'APR_REVIEW_RECORD_INVALID',
      `${label} is invalid.`,
      'Use a valid instant for deterministic review-record planning.'
    );
  }
  return date.toISOString();
}

function regularFiles(directory) {
  let root;
  try {
    const status = lstatSync(directory);
    if (!status.isDirectory() || status.isSymbolicLink()) throw new Error('not a directory');
    root = realpathSync(directory);
  } catch (cause) {
    fail(
      'APR_REVIEW_RECORD_SOURCE',
      'A review collateral directory is unavailable or unsafe.',
      'Restore the exact regular collateral directory and retry.',
      { directory },
      cause
    );
  }
  const visit = (current) =>
    readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(current, entry.name);
      let status;
      try {
        status = lstatSync(absolute);
      } catch (cause) {
        fail(
          'APR_REVIEW_RECORD_SOURCE',
          'Review collateral changed while it was inspected.',
          'Restore the exact collateral bytes and retry planning.',
          { path: absolute },
          cause
        );
      }
      if (status.isSymbolicLink()) {
        fail(
          'APR_REVIEW_RECORD_SOURCE',
          'Review collateral contains a symbolic link.',
          'Replace the link with the exact regular-file evidence before consolidation.',
          { path: absolute }
        );
      }
      if (status.isDirectory()) return visit(absolute);
      if (!status.isFile()) {
        fail(
          'APR_REVIEW_RECORD_SOURCE',
          'Review collateral contains a non-regular file.',
          'Preserve only regular-file evidence in the review record.',
          { path: absolute }
        );
      }
      return [absolute];
    });
  return visit(root).sort();
}

function resolvedAttempt(workspace) {
  const { events, state } = inspectReviewAuthority(workspace);
  const protocol = state.protocol;
  const startup = protocol.startup;
  const context = startup?.context;
  if (!context || digest(Buffer.from(canonicalProjection(context))) !== startup.context_digest) {
    fail(
      'APR_REVIEW_RECORD_AUTHORITY',
      'Review startup routing authority is invalid.',
      'Restore the intact startup context and retry consolidation.',
      { workspace }
    );
  }
  const recordId = context.record_id ?? context.review_id;
  const paths = resolveReviewPaths({
    root: context.repository_root,
    reviewsRoot: context.reviews_root,
    reviewPathTemplate: context.review_path_template,
    issue: context.issue,
    kind: context.artifact_kind,
    name: context.artifact_name,
    date: context.review_date,
    reviewId: context.review_id,
    recordId,
  });
  if (paths.destination.relative !== startup.destination) {
    fail(
      'APR_REVIEW_RECORD_AUTHORITY',
      'Review destination differs from sealed startup authority.',
      'Restore the original review routing authority and retry.',
      { workspace }
    );
  }
  try {
    if (realpathSync(workspace) !== realpathSync(paths.scratch.absolute)) {
      fail(
        'APR_REVIEW_RECORD_AUTHORITY',
        'Review workspace differs from sealed attempt identity.',
        'Pass the event-authorized scratch workspace for this attempt.',
        { workspace, expected: paths.scratch.absolute }
      );
    }
  } catch (cause) {
    if (cause instanceof AprError) throw cause;
    fail(
      'APR_REVIEW_RECORD_SOURCE',
      'Review workspace cannot be resolved.',
      'Restore the exact review workspace and retry.',
      { workspace },
      cause
    );
  }
  if (!TERMINAL_STATES.has(protocol.state)) {
    fail(
      'APR_REVIEW_RECORD_NONTERMINAL',
      'Every review attempt must have an explicit terminal disposition.',
      'Accept, supersede, or abandon each attempt before consolidation.',
      { review_id: protocol.review_id, state: protocol.state }
    );
  }
  return {
    context,
    events,
    paths,
    protocol,
    recordId,
    workspace: realpathSync(workspace),
  };
}

function responseKind(file) {
  const name = path.basename(file);
  if (/(?:^|-)reviewer-response-[1-9][0-9]*\.md$/.test(name)) return 'reviewer-response';
  if (/(?:^|-)author-response-[1-9][0-9]*\.md$/.test(name)) return 'author-response';
  return null;
}

function responseClassification(parsed, source, events) {
  const submitted = events.some((event) => {
    const response = event.payload?.response;
    return response?.path === source.relative && response.digest === source.digest;
  });
  if (submitted && parsed.metadata.submitted_at !== null) return 'submitted';
  const untouched = parsed.sections.every(({ content }) =>
    /^<!-- [\s\S]* -->$/.test(content.trim())
  );
  return untouched ? 'incomplete' : 'not-submitted';
}

function eventKind(type) {
  if (type === 'review-created') return 'request';
  if (type.startsWith('author-revision') || type.startsWith('author-closing-round')) {
    return 'artifact-revision';
  }
  if (type === 'superseded' || type === 'abandoned') return 'disposition';
  if (type.includes('acceptance') || type.startsWith('override-')) return 'terminal-authority';
  if (type.includes('delivery') || type.includes('supplement')) return 'delivery';
  return 'protocol-event';
}

function compareTimeline(left, right) {
  return (
    left.at.localeCompare(right.at) ||
    left.review_id.localeCompare(right.review_id) ||
    left.sequence - right.sequence ||
    left.kind.localeCompare(right.kind)
  );
}

export function planReviewRecord({ workspaces, destination, now = new Date() } = {}) {
  if (
    !Array.isArray(workspaces) ||
    workspaces.length < 2 ||
    workspaces.some((workspace) => typeof workspace !== 'string' || !workspace) ||
    new Set(workspaces.map((workspace) => path.resolve(workspace))).size !== workspaces.length
  ) {
    fail(
      'APR_REVIEW_RECORD_INVALID',
      'Consolidation requires at least two unique review workspaces.',
      'Pass each immutable attempt workspace exactly once.'
    );
  }
  const attempts = workspaces.map(resolvedAttempt);
  const first = attempts[0];
  const root = first.paths.root;
  const recordDestination = resolveContainedPath(root, destination, 'review record');
  const recordId = first.recordId;
  const artifactIdentity = `${first.context.artifact_kind}\0${first.context.artifact_name}\0${first.protocol.artifact.path}`;
  for (const attempt of attempts.slice(1)) {
    const identity = `${attempt.context.artifact_kind}\0${attempt.context.artifact_name}\0${attempt.protocol.artifact.path}`;
    if (
      attempt.paths.root !== root ||
      attempt.recordId !== recordId ||
      identity !== artifactIdentity
    ) {
      fail(
        'APR_REVIEW_RECORD_MISMATCH',
        'Review attempts do not belong to one record and artifact.',
        'Select only attempts with the same sealed record and artifact identity.'
      );
    }
  }
  const accepted = attempts.filter(({ protocol }) => ACCEPTED_STATES.has(protocol.state));
  if (accepted.length > 1) {
    fail(
      'APR_REVIEW_RECORD_AUTHORITY',
      'A review record cannot contain more than one accepted terminal authority.',
      'Resolve the contradictory accepted attempts before consolidation.',
      { review_ids: accepted.map(({ protocol }) => protocol.review_id) }
    );
  }

  const mappings = [];
  const entries = [];
  for (const attempt of attempts) {
    const sourceDirectory = attempt.paths.destination;
    if (
      recordDestination.relative === sourceDirectory.relative ||
      recordDestination.relative.startsWith(`${sourceDirectory.relative}/`)
    ) {
      fail(
        'APR_REVIEW_RECORD_INVALID',
        'Review record destination overlaps an attempt source.',
        'Choose a separate contained destination for consolidation.'
      );
    }
    for (const event of attempt.events) {
      entries.push({
        at: event.at,
        sequence: event.sequence,
        review_id: event.review_id,
        kind: eventKind(event.type),
        type: event.type,
        classification: event.type,
      });
    }
    for (const absolute of regularFiles(sourceDirectory.absolute)) {
      const relativeWithinAttempt = path
        .relative(sourceDirectory.absolute, absolute)
        .split(path.sep)
        .join('/');
      const source = resolveContainedPath(root, absolute, 'review record source');
      const bytes = readFileSync(source.absolute);
      const sourceDigest = digest(bytes);
      const qualified = relativeWithinAttempt.startsWith(`${attempt.protocol.review_id}-`)
        ? relativeWithinAttempt
        : `${attempt.protocol.review_id}-${relativeWithinAttempt}`;
      const target = resolveContainedPath(
        root,
        path.join(recordDestination.relative, qualified),
        'review record destination'
      );
      let collision = 'none';
      if (existsSync(target.absolute)) {
        const status = lstatSync(target.absolute);
        if (!status.isFile() || status.isSymbolicLink()) collision = 'conflict';
        else
          collision =
            digest(readFileSync(target.absolute)) === sourceDigest ? 'identical' : 'conflict';
      }
      const sourceEntry = {
        absolute: source.absolute,
        relative: source.relative,
        digest: sourceDigest,
      };
      const destinationEntry = { absolute: target.absolute, relative: target.relative };
      mappings.push({
        review_id: attempt.protocol.review_id,
        source: sourceEntry,
        destination: destinationEntry,
        collision,
      });
      const kind = responseKind(source.relative);
      if (kind) {
        let parsed;
        try {
          parsed = parseResponse(bytes);
        } catch (cause) {
          fail(
            'APR_REVIEW_RECORD_SOURCE',
            'A response collateral file is not valid review evidence.',
            'Restore the generated response structure and retry consolidation.',
            { path: source.relative },
            cause
          );
        }
        entries.push({
          at: parsed.metadata.started_at,
          sequence: parsed.metadata.turn,
          review_id: attempt.protocol.review_id,
          kind,
          type: kind,
          classification: responseClassification(parsed, sourceEntry, attempt.events),
          path: source.relative,
          digest: sourceDigest,
        });
      }
    }
  }

  mappings.sort(
    (left, right) =>
      left.review_id.localeCompare(right.review_id) ||
      left.source.relative.localeCompare(right.source.relative)
  );
  entries.sort(compareTimeline);
  const plannedAttempts = attempts
    .map(({ events, protocol }) => ({
      review_id: protocol.review_id,
      state: protocol.state,
      commit_mode: protocol.commit_mode,
      started_at: events[0].at,
      ended_at: events.at(-1).at,
    }))
    .sort(
      (left, right) =>
        left.started_at.localeCompare(right.started_at) ||
        left.review_id.localeCompare(right.review_id)
    );
  return deepFreeze({
    schema: 'ai-peer-review.relocation-plan/v1',
    record_id: recordId,
    repository_root: root,
    destination: recordDestination,
    planned_at: canonicalTime(now, 'Plan time'),
    attempts: plannedAttempts,
    entries,
    mappings,
    history: resolveContainedPath(
      root,
      path.join(recordDestination.relative, 'review-history.md'),
      'review history'
    ),
    receipt: resolveContainedPath(
      root,
      path.join(recordDestination.relative, 'relocation-receipt.json'),
      'relocation receipt'
    ),
  });
}

export function renderReviewHistory(plan) {
  if (plan?.schema !== 'ai-peer-review.relocation-plan/v1') {
    fail(
      'APR_REVIEW_RECORD_INVALID',
      'Review history requires a canonical relocation plan.',
      'Build the plan through planReviewRecord and retry.'
    );
  }
  const lines = [`# Review record ${plan.record_id}`, '', '## Attempts', ''];
  for (const attempt of plan.attempts) {
    lines.push(`- \`${attempt.review_id}\`: \`${attempt.state}\``);
  }
  lines.push('', '## Ordered history', '');
  for (const entry of plan.entries) {
    const pathText = entry.path ? ` at \`${entry.path}\`` : '';
    lines.push(
      `- ${entry.at} — \`${entry.review_id}\` — ${entry.kind}: \`${entry.classification}\`${pathText}`
    );
  }
  return `${lines.join('\n')}\n`;
}

function relocationReceipt(plan, historyBytes) {
  const operation = {
    schema: plan.schema,
    record_id: plan.record_id,
    repository_root: plan.repository_root,
    destination: plan.destination.relative,
    planned_at: plan.planned_at,
    attempts: plan.attempts,
    mappings: plan.mappings.map((mapping) => ({
      review_id: mapping.review_id,
      source: mapping.source.relative,
      destination: mapping.destination.relative,
      digest: mapping.source.digest,
    })),
  };
  return {
    schema: 'ai-peer-review.relocation-receipt/v1',
    record_id: plan.record_id,
    applied_at: plan.planned_at,
    destination: plan.destination.relative,
    operation_digest: digest(Buffer.from(canonicalProjection(operation))),
    history: plan.history.relative,
    history_digest: digest(historyBytes),
    attempts: plan.attempts.map(({ review_id, state, commit_mode, started_at, ended_at }) => ({
      review_id,
      state,
      commit_mode,
      started_at,
      ended_at,
    })),
    mappings: operation.mappings,
  };
}

function removeIfPresent(file) {
  try {
    unlinkSync(file);
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
  }
}

function publishExclusive(file, bytes) {
  const directory = path.dirname(file);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor = null;
  try {
    mkdirSync(directory, { recursive: true });
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    try {
      linkSync(temporary, file);
    } catch (cause) {
      if (cause?.code !== 'EEXIST') throw cause;
      const status = lstatSync(file);
      if (
        !status.isFile() ||
        status.isSymbolicLink() ||
        digest(readFileSync(file)) !== digest(bytes)
      ) {
        fail(
          'APR_REVIEW_RECORD_COLLISION',
          'Review record destination is occupied by conflicting content.',
          'Preserve both records, resolve the collision, and retry the exact plan.',
          { path: file }
        );
      }
      return false;
    }
    return true;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    removeIfPresent(temporary);
  }
}

function assertRegularDigest(file, expected, code = 'APR_REVIEW_RECORD_DIGEST') {
  let status;
  let bytes;
  try {
    status = lstatSync(file);
    bytes = readFileSync(file);
  } catch (cause) {
    fail(
      code,
      'Review record bytes cannot be verified.',
      'Restore the expected regular file and retry the exact consolidation.',
      { path: file, expected },
      cause
    );
  }
  const actual = digest(bytes);
  if (!status.isFile() || status.isSymbolicLink() || actual !== expected) {
    fail(
      code,
      'Review record destination digest differs from the planned source.',
      'Preserve the source and inspect the conflicting destination before retrying.',
      { path: file, expected, actual }
    );
  }
  return bytes;
}

function pruneEmpty(directory, stop) {
  let current = directory;
  while (current !== stop && current.startsWith(`${stop}${path.sep}`)) {
    try {
      rmdirSync(current);
    } catch (cause) {
      if (cause?.code === 'ENOTEMPTY' || cause?.code === 'EEXIST' || cause?.code === 'ENOENT') {
        return;
      }
      throw cause;
    }
    current = path.dirname(current);
  }
}

export function applyReviewRecord(plan, { mode = 'no-commit', checkpoint = () => {} } = {}) {
  if (plan?.schema !== 'ai-peer-review.relocation-plan/v1' || !Object.isFrozen(plan)) {
    fail(
      'APR_REVIEW_RECORD_INVALID',
      'Consolidation apply requires a frozen canonical relocation plan.',
      'Recompute the plan from current event authority and retry.'
    );
  }
  if (!['no-commit', 'normal'].includes(mode)) {
    fail(
      'APR_REVIEW_RECORD_INVALID',
      'Review record commit mode is invalid.',
      'Use no-commit or normal mode.'
    );
  }
  const conflict = plan.mappings.find(({ collision }) => collision === 'conflict');
  if (conflict) {
    fail(
      'APR_REVIEW_RECORD_COLLISION',
      'Review record destination is occupied by conflicting content.',
      'Preserve both records, resolve the collision, and recompute the plan.',
      { path: conflict.destination.relative }
    );
  }

  const historyBytes = Buffer.from(renderReviewHistory(plan));
  const receipt = relocationReceipt(plan, historyBytes);
  const receiptBytes = Buffer.from(canonicalProjection(receipt));
  const receiptDigest = digest(receiptBytes);
  const ownedPaths = [
    ...plan.mappings.flatMap(({ source, destination: target }) => [
      source.relative,
      target.relative,
    ]),
    plan.history.relative,
    plan.receipt.relative,
  ];
  const uniqueOwnedPaths = [...new Set(ownedPaths)];
  const transaction =
    mode === 'normal' ? createGitTransactionRepository(plan.repository_root) : null;
  const outsideIndex = transaction?.snapshotIndexOutside(uniqueOwnedPaths) ?? null;
  transaction?.assertNoOwnedOverlap(uniqueOwnedPaths);
  const trackedOwnedPaths = transaction?.trackedPaths(uniqueOwnedPaths) ?? [];
  const expectedHead = transaction?.head() ?? null;
  function commitVerifiedRelocation({ allowNoDelta = false } = {}) {
    if (!transaction) return null;
    if (transaction.head() !== expectedHead) {
      fail(
        'APR_GIT_HEAD_CHANGED',
        'Repository HEAD changed during review-record consolidation.',
        'Preserve the verified relocation receipt and reconcile the exact repository head.'
      );
    }
    const addablePaths = [
      ...new Set([
        ...trackedOwnedPaths,
        ...plan.mappings.map(({ destination: target }) => target.relative),
        plan.history.relative,
        plan.receipt.relative,
      ]),
    ];
    transaction.addPaths(addablePaths);
    transaction.assertOutsideIndex(outsideIndex, uniqueOwnedPaths);
    const trackedSourcePaths = new Set(
      trackedOwnedPaths.filter((relative) =>
        plan.mappings.some(({ source }) => source.relative === relative)
      )
    );
    const commitPaths = [
      ...new Set([...transaction.changedOwnedPaths(uniqueOwnedPaths), ...trackedSourcePaths]),
    ].sort();
    if (commitPaths.length === 0) {
      if (allowNoDelta) return null;
      fail(
        'APR_GIT_TRANSACTION_INVALID',
        'Review-record relocation produced no exact Git delta.',
        'Inspect the receipt and repository before retrying the relocation.'
      );
    }
    const commit = transaction.commitOnly(
      commitPaths,
      `Consolidate review record ${plan.record_id}`,
      { 'Peer-Review-Record-ID': plan.record_id }
    );
    transaction.assertCommitPaths(commit, commitPaths);
    transaction.assertOutsideIndex(outsideIndex, uniqueOwnedPaths);
    return commit;
  }
  const allSourcesMissing = plan.mappings.every(({ source }) => !existsSync(source.absolute));
  if (existsSync(plan.receipt.absolute) && allSourcesMissing) {
    assertRegularDigest(plan.receipt.absolute, receiptDigest);
    assertRegularDigest(plan.history.absolute, receipt.history_digest);
    for (const mapping of plan.mappings) {
      assertRegularDigest(mapping.destination.absolute, mapping.source.digest);
    }
    const commit = commitVerifiedRelocation({ allowNoDelta: true });
    return deepFreeze({
      schema: 'ai-peer-review.relocation-result/v1',
      record_id: plan.record_id,
      recovered: true,
      commit,
      receipt: plan.receipt.relative,
      receipt_digest: receiptDigest,
      history: plan.history.relative,
      mappings: plan.mappings,
    });
  }

  const publications = plan.mappings.map((mapping) => ({
    file: mapping.destination.absolute,
    bytes: assertRegularDigest(
      mapping.source.absolute,
      mapping.source.digest,
      'APR_REVIEW_RECORD_SOURCE'
    ),
    digest: mapping.source.digest,
    mapping,
  }));
  const created = [];
  try {
    for (const publication of publications) {
      if (publishExclusive(publication.file, publication.bytes)) created.push(publication.file);
      checkpoint('destination-published', publication.mapping);
    }
    checkpoint('all-destinations-published', { mappings: plan.mappings });
    for (const publication of publications) {
      assertRegularDigest(publication.file, publication.digest);
    }
    if (publishExclusive(plan.history.absolute, historyBytes)) created.push(plan.history.absolute);
    if (publishExclusive(plan.receipt.absolute, receiptBytes)) created.push(plan.receipt.absolute);
    assertRegularDigest(plan.history.absolute, receipt.history_digest);
    assertRegularDigest(plan.receipt.absolute, receiptDigest);
  } catch (cause) {
    for (const file of created.reverse()) removeIfPresent(file);
    if (cause instanceof AprError) throw cause;
    fail(
      'APR_REVIEW_RECORD_APPLY',
      'Review record destinations could not be published atomically.',
      'Sources were retained; inspect the destination and retry a fresh plan.',
      {},
      cause
    );
  }

  try {
    for (const mapping of plan.mappings) removeIfPresent(mapping.source.absolute);
    const sourceDirectories = [
      ...new Set(plan.mappings.map(({ source }) => path.dirname(source.absolute))),
    ].sort((left, right) => right.length - left.length);
    for (const directory of sourceDirectories) pruneEmpty(directory, plan.repository_root);
    checkpoint('sources-removed', { mappings: plan.mappings });
  } catch (cause) {
    fail(
      'APR_REVIEW_RECORD_APPLY',
      'Review record destinations verified but source cleanup was incomplete.',
      'Use the verified relocation receipt to reconcile remaining source paths.',
      { receipt: plan.receipt.relative },
      cause
    );
  }

  let commit = null;
  if (transaction) {
    commit = commitVerifiedRelocation();
  }

  return deepFreeze({
    schema: 'ai-peer-review.relocation-result/v1',
    record_id: plan.record_id,
    recovered: false,
    commit,
    receipt: plan.receipt.relative,
    receipt_digest: receiptDigest,
    history: plan.history.relative,
    mappings: plan.mappings,
  });
}
