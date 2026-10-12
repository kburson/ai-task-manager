import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import { verifyAndConsumeGrant } from '../authority/verify.mjs';
import { resolveReviewPaths } from '../collateral/paths.mjs';
import { nextActionCommand } from '../cli/help-data.mjs';
import { AprError } from '../errors.mjs';
import { validateEvent } from './events.mjs';
import { reduceEvents } from './reducer.mjs';
import { atomicCreate, atomicWrite, withReviewLock } from './store.mjs';

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, ordered(value[key])])
    );
  }
  return value;
}

export function canonicalProjection(value) {
  return `${JSON.stringify(ordered(value), null, 2)}\n`;
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function sealNoCommitHandoff({ review, artifactBytes, responses, store }) {
  const protocol = review?.protocol ?? review;
  if (protocol?.commit_mode !== 'no-commit' || !protocol.startup?.no_commit_baseline) {
    throw authorityError(
      'APR_INVALID_TRANSITION',
      'No-commit handoff sealing requires immutable no-commit review authority.',
      'Start a new review with --no-commit; an existing review mode cannot be converted.'
    );
  }
  if (!Buffer.isBuffer(artifactBytes) || !Array.isArray(responses) || responses.length === 0) {
    throw authorityError(
      'APR_RESPONSE_INVALID',
      'No-commit handoff sealing requires artifact bytes and sealed responses.',
      'Pass the exact event-authorized artifact bytes and response seals.'
    );
  }
  const responseDigests = responses.map((response) => response?.digest);
  if (responseDigests.some((digest) => !/^sha256:[0-9a-f]{64}$/.test(digest ?? ''))) {
    throw authorityError(
      'APR_RESPONSE_INVALID',
      'No-commit response seal digest is invalid.',
      'Pass only exact sealed response digests.'
    );
  }
  if (
    typeof store?.assertBaseline !== 'function' ||
    typeof store?.writeExclusiveSnapshot !== 'function'
  ) {
    throw authorityError(
      'APR_ATOMIC_WRITE_FAILED',
      'No-commit snapshot store is unavailable.',
      'Provide baseline validation and exclusive snapshot storage.'
    );
  }
  store.assertBaseline(review);
  const artifactDigest = sha256(artifactBytes);
  const snapshot = store.writeExclusiveSnapshot(
    protocol.review_id,
    protocol.sequence + 1,
    artifactBytes
  );
  if (
    typeof snapshot?.relative !== 'string' ||
    !snapshot.relative ||
    path.isAbsolute(snapshot.relative) ||
    snapshot.relative.split(/[\\/]/).includes('..') ||
    snapshot.digest !== artifactDigest
  ) {
    throw authorityError(
      'APR_ATOMIC_WRITE_FAILED',
      'No-commit snapshot store returned an invalid seal.',
      'Preserve the snapshot and retry only with its exact relative path and digest.'
    );
  }
  return Object.freeze({
    artifact_digest: artifactDigest,
    snapshot_path: snapshot.relative.split(path.sep).join('/'),
    snapshot_digest: snapshot.digest,
    response_digests: Object.freeze([...responseDigests]),
  });
}

function appendLockedEvent(file, priorBytes, event) {
  const record = Buffer.from(`${JSON.stringify(ordered(event))}\n`, 'utf8');
  atomicWrite(file, Buffer.concat([Buffer.from(priorBytes, 'utf8'), record]));
}

function authorityError(code, message, recovery, details = {}, cause = null) {
  const error = new AprError(code, message, { recovery, details });
  if (cause) error.cause = cause;
  return error;
}

function readAuthority(workspace) {
  const file = path.join(workspace, 'events.jsonl');
  let bytes;
  try {
    bytes = readFileSync(file, 'utf8');
  } catch (cause) {
    throw authorityError(
      'APR_EVENT_LOG_MISSING',
      'The authoritative event log cannot be read.',
      'Restore the review workspace events.jsonl file and retry recovery.',
      { file },
      cause
    );
  }
  if (!bytes || !bytes.endsWith('\n')) {
    throw authorityError(
      'APR_EVENT_LOG_CORRUPT',
      'The authoritative event log is empty or ends with a torn record.',
      'Restore events.jsonl from its last complete newline-terminated record.',
      { file }
    );
  }
  const records = bytes.slice(0, -1).split('\n');
  if (records.some((record) => !record)) {
    throw authorityError(
      'APR_EVENT_LOG_CORRUPT',
      'The authoritative event log contains a blank record.',
      'Remove only the invalid blank record after preserving and inspecting the original bytes.',
      { file }
    );
  }
  let events;
  try {
    events = records.map((record) => JSON.parse(record));
  } catch (cause) {
    throw authorityError(
      'APR_EVENT_LOG_CORRUPT',
      'The authoritative event log contains invalid JSON.',
      'Restore events.jsonl from its last complete valid record.',
      { file },
      cause
    );
  }
  try {
    return { events, state: reduceEvents(events), file, bytes };
  } catch (cause) {
    if (cause instanceof AprError) throw cause;
    throw authorityError(
      'APR_EVENT_LOG_CORRUPT',
      'The authoritative event log cannot be reduced.',
      'Inspect the event sequence and restore the last valid authority.',
      { file },
      cause
    );
  }
}

function ensureProjection(file, value) {
  const expected = canonicalProjection(value);
  let current = null;
  try {
    if (existsSync(file)) current = readFileSync(file, 'utf8');
  } catch {
    current = null;
  }
  if (current !== expected) atomicWrite(file, Buffer.from(expected));
}

function deliveryReceiptFile(workspace, delivery) {
  if (
    !delivery ||
    typeof delivery.delivery_id !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(delivery.delivery_id)
  ) {
    throw authorityError(
      'APR_DELIVERY_INVALID',
      'Delivery authority has an invalid delivery ID.',
      'Repair the delivery event through the documented recovery flow.'
    );
  }
  return path.join(workspace, 'deliveries', `${delivery.delivery_id}.json`);
}

export function writeDeliveryReceiptExclusive(file, delivery) {
  const expected = Buffer.from(
    canonicalProjection({
      delivery_id: delivery.delivery_id,
      recipient: delivery.recipient,
      digest: delivery.digest,
    })
  );
  const directory = path.dirname(file);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor = null;
  let phase = 'setup';
  try {
    mkdirSync(directory, { recursive: true });
    phase = 'temporary';
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, expected);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    phase = 'target';
    linkSync(temporary, file);
    phase = 'durability';
    unlinkSync(temporary);
    let directoryDescriptor = null;
    try {
      directoryDescriptor = openSync(directory, 'r');
      fsyncSync(directoryDescriptor);
    } catch (cause) {
      const unsupported = new Set(['EINVAL', 'EISDIR', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM']);
      if (!unsupported.has(cause?.code)) throw cause;
    } finally {
      if (directoryDescriptor !== null) closeSync(directoryDescriptor);
    }
  } catch (cause) {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {}
    }
    if (existsSync(temporary)) {
      try {
        unlinkSync(temporary);
      } catch {}
    }
    if (cause?.code === 'EEXIST' && phase === 'target') {
      throw authorityError(
        'APR_DELIVERY_CONFLICT',
        'A delivery receipt was created concurrently.',
        `Preserve ${file}, inspect the collision, and run explicit recovery.`,
        { file },
        cause
      );
    }
    throw authorityError(
      'APR_DELIVERY_WRITE_FAILED',
      'A delivery receipt could not be created durably.',
      `Inspect ${directory} and retry recovery after correcting the filesystem failure.`,
      { file },
      cause
    );
  }
}

function ensureDeliveryReceipts(workspace, state, { write = true } = {}) {
  for (const delivery of state.protocol.deliveries) {
    const file = deliveryReceiptFile(workspace, delivery);
    const expected = canonicalProjection({
      delivery_id: delivery.delivery_id,
      recipient: delivery.recipient,
      digest: delivery.digest,
    });
    if (existsSync(file)) {
      let current;
      try {
        current = readFileSync(file, 'utf8');
      } catch (cause) {
        throw authorityError(
          'APR_DELIVERY_CONFLICT',
          'A delivery receipt cannot be verified.',
          `Inspect ${file} and restore the event-derived receipt.`,
          { file },
          cause
        );
      }
      if (current !== expected) {
        throw authorityError(
          'APR_DELIVERY_CONFLICT',
          'A delivery receipt conflicts with event authority.',
          `Preserve ${file}, inspect the collision, and run explicit recovery.`,
          { file }
        );
      }
    } else if (write) {
      writeDeliveryReceiptExclusive(file, delivery);
    }
  }
}

function writeProjections(workspace, state) {
  ensureProjection(path.join(workspace, 'protocol.json'), state.protocol);
  ensureProjection(path.join(workspace, 'participants.json'), state.participants);
}

function assertExpected(state, expected) {
  if (!expected || typeof expected !== 'object') {
    throw authorityError(
      'APR_STALE_REVIEW',
      'Expected review authority is required.',
      'Read current status and retry with its exact review, revision, sequence, and actor.'
    );
  }
  const actual = {
    reviewId: state.protocol.review_id,
    revision: state.protocol.revision,
    sequence: state.protocol.sequence,
    actor: state.protocol.current_actor,
  };
  if (
    actual.reviewId !== expected.reviewId ||
    actual.revision !== expected.revision ||
    actual.sequence !== expected.sequence ||
    actual.actor !== expected.actor
  ) {
    throw authorityError(
      'APR_STALE_REVIEW',
      'Expected review authority no longer matches events.',
      'Read current status and retry from the exact reported authority.',
      { expected, actual }
    );
  }
}

export async function readReview(workspace) {
  return withReviewLock(workspace, async () => {
    const { state } = readAuthority(workspace);
    ensureDeliveryReceipts(workspace, state);
    writeProjections(workspace, state);
    return state;
  });
}

export async function repairReview(workspace, expected, operations = {}) {
  const preflight = readAuthority(workspace).state;
  assertExpected(preflight, expected);
  const validate = operations.preflight ?? (() => {});
  const repair = operations.repair ?? (() => {});
  if (typeof validate !== 'function' || typeof repair !== 'function') {
    throw authorityError(
      'APR_EVENT_INVALID',
      'Review repair requires preflight and repair functions.',
      'Provide the exact event-authorized preflight and repair operations.'
    );
  }
  return withReviewLock(workspace, async () => {
    const { state } = readAuthority(workspace);
    assertExpected(state, expected);
    ensureDeliveryReceipts(workspace, state, { write: false });
    await validate(state);
    writeProjections(workspace, state);
    ensureDeliveryReceipts(workspace, state);
    await repair(state);
    return state;
  });
}

export function inspectReview(workspace) {
  return readAuthority(workspace).state;
}

export function inspectReviewAuthority(workspace) {
  const { events, state } = readAuthority(workspace);
  return Object.freeze({ events: Object.freeze([...events]), state });
}

function statusPaths(state) {
  const startup = state.protocol.startup;
  const context = startup?.context;
  if (!context || sha256(Buffer.from(canonicalProjection(context))) !== startup.context_digest) {
    throw authorityError(
      'APR_INVITATION_INVALID',
      'Review startup routing authority is invalid.',
      'Recover the review from its intact event authority before continuing.'
    );
  }
  const paths = resolveReviewPaths({
    root: context.repository_root,
    reviewsRoot: context.reviews_root,
    reviewPathTemplate: context.review_path_template,
    issue: context.issue,
    kind: context.artifact_kind,
    name: context.artifact_name,
    date: context.review_date,
    reviewId: context.review_id,
    recordId: context.record_id ?? context.review_id,
  });
  if (paths.destination.relative !== startup.destination) {
    throw authorityError(
      'APR_INVITATION_INVALID',
      'Review destination differs from sealed startup authority.',
      'Recover the review from its intact event authority before continuing.'
    );
  }
  return paths;
}

function retainedStatusPaths(workspace, { includeReservation = false } = {}) {
  const visit = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(workspace, absolute).split(path.sep).join('/');
      if (
        (!includeReservation && relative === 'collateral-reservation.json') ||
        relative === 'locks/review.lock'
      )
        return [];
      return entry.isDirectory() ? visit(absolute) : [relative];
    });
  return visit(workspace).sort();
}

function statusResult(state, paths, review = {}) {
  const assurance = state.protocol.authority?.verifier?.signer_strength ?? 'unavailable';
  return Object.freeze({
    schema: 'ai-peer-review.cli-result/v1',
    command: 'status',
    review_id: state.protocol.review_id,
    record_id: state.protocol.startup?.context?.record_id ?? state.protocol.review_id,
    state: state.protocol.state,
    next_action: state.protocol.next_action,
    ...(state.protocol.phases ? { phases: state.protocol.phases } : {}),
    review: Object.freeze({
      commit_mode: state.protocol.commit_mode,
      authority_assurance: assurance,
      mode_notice:
        state.protocol.commit_mode === 'no-commit'
          ? `NO-COMMIT TEST MODE — authority assurance: ${assurance}`
          : 'NORMAL COMMIT MODE',
      ...review,
    }),
    paths: Object.freeze(paths),
  });
}

function statusInstant(value) {
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw authorityError(
      'APR_CLAIM_INVALID',
      'Status clock is invalid.',
      'Provide a valid clock instant and retry.'
    );
  }
  if (typeof value === 'string') {
    const canonical = date.toISOString();
    if (value !== canonical && value !== canonical.replace('.000Z', 'Z')) {
      throw authorityError(
        'APR_CLAIM_INVALID',
        'Status clock is invalid.',
        'Provide a calendar-valid RFC-3339 UTC instant.'
      );
    }
  }
  return date;
}

export function statusReview(workspace, { now = new Date() } = {}) {
  const absolute = path.resolve(workspace);
  const observedAt = statusInstant(now);
  const state = inspectReview(absolute);
  const resolved = statusPaths(state);
  const role = ['author', 'reviewer'].includes(state.protocol.current_actor)
    ? state.protocol.current_actor
    : null;
  const claim = role ? (state.protocol.claims?.[role] ?? null) : null;
  const claimStatus = claim
    ? observedAt.valueOf() >= Date.parse(claim.expires_at)
      ? 'stale'
      : 'active'
    : role
      ? 'unclaimed'
      : 'not-applicable';
  const effectiveState =
    claimStatus === 'stale'
      ? {
          ...state,
          protocol: {
            ...state.protocol,
            state: 'intervention-required',
            next_action: 'human-intervention',
            intervention: { ...(state.protocol.intervention ?? {}), reason: 'stale-claim' },
          },
        }
      : state;
  const response =
    state.protocol.state === 'reviewer-turn'
      ? resolved.reviewerResponse(state.protocol.turns_used + 1).absolute
      : state.protocol.state === 'author-revision'
        ? resolved.authorResponse(state.protocol.turns_used).absolute
        : null;
  const operationalPaths = Object.freeze({
    workspace: absolute,
    invitation: resolved.reviewerInvitation.absolute,
    ...(response ? { response } : {}),
  });
  const ownedPaths =
    state.protocol.commit_mode === 'no-commit'
      ? [
          ...retainedStatusPaths(absolute, { includeReservation: true }).map((relative) =>
            path
              .join(
                path.relative(state.protocol.startup.context.repository_root, absolute),
                relative
              )
              .split(path.sep)
              .join('/')
          ),
          ...retainedStatusPaths(resolved.destination.absolute).map((relative) =>
            path.join(resolved.destination.relative, relative).split(path.sep).join('/')
          ),
        ].sort()
      : [];
  return Object.freeze({
    ...statusResult(effectiveState, operationalPaths, {
      ...(ownedPaths.length ? { owned_paths: Object.freeze(ownedPaths) } : {}),
    }),
    next_action: Object.freeze({
      action: effectiveState.protocol.next_action,
      command: nextActionCommand(
        operationalPaths,
        effectiveState.protocol.next_action,
        effectiveState
      ),
    }),
    claim: Object.freeze({
      role,
      status: claimStatus,
      host: claim?.host ?? null,
      expires_at: claim?.expires_at ?? null,
    }),
  });
}

export async function initializeReview(workspace, event) {
  validateEvent(event);
  if (event.type !== 'review-created' || event.sequence !== 1 || event.revision !== 1) {
    throw authorityError(
      'APR_EVENT_INVALID',
      'Initial review authority must be one review-created event.',
      'Recreate startup from complete preflight authority.'
    );
  }
  return withReviewLock(workspace, async () => {
    const file = path.join(workspace, 'events.jsonl');
    if (existsSync(file)) {
      throw authorityError(
        'APR_OUTPUT_COLLISION',
        'A review event log already occupies the requested workspace.',
        `Preserve ${file}, inspect the existing review, and choose explicit recovery.`,
        { file }
      );
    }
    const state = reduceEvents([event]);
    atomicCreate(file, Buffer.from(`${JSON.stringify(ordered(event))}\n`, 'utf8'));
    writeProjections(workspace, state);
    return state;
  });
}

export async function mutateReview(workspace, expected, createEvent) {
  const preflight = readAuthority(workspace).state;
  assertExpected(preflight, expected);
  if (typeof createEvent !== 'function') {
    throw authorityError(
      'APR_EVENT_INVALID',
      'Review mutation requires an event factory.',
      'Provide a function that creates one event from the locked current state.'
    );
  }

  return withReviewLock(workspace, async () => {
    const { events, state: current, file, bytes } = readAuthority(workspace);
    assertExpected(current, expected);
    const nextEvent = await createEvent(current);
    validateEvent(nextEvent);
    const next = reduceEvents([...events, nextEvent]);
    ensureDeliveryReceipts(workspace, next, { write: false });
    appendLockedEvent(file, bytes, nextEvent);
    writeProjections(workspace, next);
    ensureDeliveryReceipts(workspace, next);
    return next;
  });
}

export async function mutateProtectedReview(
  workspace,
  expected,
  { action, parameters, grant, now = new Date(), hostVerifier, preflight, createEvent }
) {
  if (typeof createEvent !== 'function') {
    throw authorityError(
      'APR_EVENT_INVALID',
      'Protected review mutation requires an event factory.',
      'Provide a function that creates the authorized event.'
    );
  }
  return mutateReview(workspace, expected, (current) => {
    if (preflight !== undefined) {
      if (typeof preflight !== 'function') {
        throw authorityError(
          'APR_EVENT_INVALID',
          'Protected review mutation preflight must be a function.',
          'Provide a function that validates event-derived outputs under the review lock.'
        );
      }
      preflight(current);
    }
    const attestation = verifyAndConsumeGrant(current, grant, {
      action,
      parameters,
      now,
      hostVerifier,
    });
    return createEvent(current, attestation);
  });
}
