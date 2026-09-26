// @story #1826
// Typed one-issue local-trunk burn and receipt, plus a CAS-backed publication transaction.
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { validateWorkflowExceptionEnvelope } from './workflow-policy/exception-record.mjs';

const BURN_SCHEMA = 'aitm.local-trunk-close-burn/v1';
const ENTRY_SCHEMA = 'aitm.local-trunk-close-journal-entry/v1';
const BARRIER_SCHEMA = 'aitm.local-trunk-revision-barrier/v1';
const REVISION_POST_SCHEMA = 'aitm.local-trunk-revision-post/v1';
const RECEIPT_SCHEMA = 'aitm.local-trunk-close-receipt/v1';
const MARKER = '<!-- aitm-local-trunk-close-receipt ';
const SHA = new RegExp('^[0-9a-f]{40}$');
const HASH = new RegExp('^sha256:[0-9a-f]{64}$');
const OPERATION = new RegExp('^[0-7][0-9A-HJKMNP-TV-Z]{25}$');
const REPO = new RegExp('^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$');
const REF = new RegExp('^[A-Za-z0-9][A-Za-z0-9._/-]*$');
const BURN_KEYS = [
  'schema',
  'repository',
  'issue',
  'deliveryOperationId',
  'grantRecordId',
  'grantRevision',
  'scopeIdentity',
  'waiverScopeDigest',
  'waiverReasonDigest',
  'grantDigest',
  'acceptedHeadSha',
  'baseRef',
  'resolvedTrunkRef',
  'authorizedAt',
];
const ENTRY_KEYS = [
  'schema',
  'sequence',
  'predecessorOid',
  'repository',
  'issue',
  'deliveryOperationId',
  'state',
  'burn',
  'publication',
];
const BARRIER_KEYS = [
  'schema',
  'sequence',
  'predecessorOid',
  'repository',
  'issue',
  'deliveryOperationId',
  'state',
  'priorGrantRecordId',
  'revisionRecordId',
  'revisionGrantId',
  'revisionCreatedAt',
  'revisionOperationId',
  'action',
];
const REVISION_POST_KEYS = [
  'schema',
  'sequence',
  'predecessorOid',
  'repository',
  'issue',
  'deliveryOperationId',
  'state',
  'priorGrantRecordId',
  'revisionRecordId',
  'revisionOperationId',
  'runId',
];
const PUBLICATION_KEYS = ['receiptBody', 'receiptDigest', 'runId', 'commentNodeId', 'createdAt'];
const STATES = ['burned', 'receipt-requesting', 'completed'];
const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const exact = (value, keys) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const equal = (left, right) => canonicalRecordJson(left) === canonicalRecordJson(right);
const instant = (value) =>
  typeof value === 'string' &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value;
const validRef = (value) =>
  typeof value === 'string' &&
  REF.test(value) &&
  !value.includes('..') &&
  !value.includes('//') &&
  !value.endsWith('/');
const fail = (category) => {
  throw new TypeError(`local-trunk-close:${category}`);
};
const uncertain = (category) => fail(`indeterminate:${category}`);

export function validateLocalTrunkCloseBurn(burn) {
  if (
    !exact(burn, BURN_KEYS) ||
    burn.schema !== BURN_SCHEMA ||
    !REPO.test(burn.repository) ||
    !Number.isSafeInteger(burn.issue) ||
    burn.issue < 1 ||
    !OPERATION.test(burn.deliveryOperationId) ||
    !OPERATION.test(burn.grantRecordId) ||
    !Number.isSafeInteger(burn.grantRevision) ||
    burn.grantRevision < 1 ||
    ![burn.scopeIdentity, burn.waiverScopeDigest, burn.waiverReasonDigest, burn.grantDigest].every(
      (value) => HASH.test(value)
    ) ||
    !SHA.test(burn.acceptedHeadSha) ||
    !validRef(burn.baseRef) ||
    !validRef(burn.resolvedTrunkRef) ||
    !instant(burn.authorizedAt)
  )
    fail('burn');
  canonicalRecordJson(burn);
  return burn;
}

export function buildLocalTrunkCloseBurn({ grant, authorizedAt } = {}) {
  validateWorkflowExceptionEnvelope(grant, { repository: grant?.repository, issue: grant?.issue });
  const payload = grant.payload;
  const scope = payload.deliveryScope;
  if (
    payload.scopeKind !== 'delivery' ||
    payload.status !== 'active' ||
    scope?.exceptionKind !== 'delivery.local-trunk-close-authorization' ||
    scope.requirementId !== 'delivery.local-trunk-close-authorization' ||
    scope.pullRequest !== null ||
    scope.repository !== grant.repository ||
    scope.issue !== grant.issue ||
    !instant(authorizedAt) ||
    Date.parse(authorizedAt) < Date.parse(grant.createdAt) ||
    Date.parse(authorizedAt) >= Date.parse(payload.expiresAt)
  )
    fail('grant-not-live');
  const burn = {
    schema: BURN_SCHEMA,
    repository: grant.repository,
    issue: grant.issue,
    deliveryOperationId: scope.deliveryOperationId,
    grantRecordId: grant.recordId,
    grantRevision: payload.revision,
    scopeIdentity: payload.scopeIdentity,
    waiverScopeDigest: payload.waiverScopeDigest,
    waiverReasonDigest: digest(payload.reason),
    grantDigest: digest(canonicalRecordJson(grant)),
    acceptedHeadSha: scope.acceptedHeadSha,
    baseRef: scope.baseRef,
    resolvedTrunkRef: scope.resolvedTrunkRef,
    authorizedAt,
  };
  return Object.freeze(validateLocalTrunkCloseBurn(burn));
}

export function buildLocalTrunkCloseReceipt({ burn, burnOid } = {}) {
  validateLocalTrunkCloseBurn(burn);
  if (!SHA.test(burnOid ?? '')) fail('burn-oid');
  return Object.freeze({
    schema: RECEIPT_SCHEMA,
    result: 'authorized-local-trunk-close',
    repository: burn.repository,
    issue: burn.issue,
    deliveryOperationId: burn.deliveryOperationId,
    grantRecordId: burn.grantRecordId,
    grantRevision: burn.grantRevision,
    scopeIdentity: burn.scopeIdentity,
    waiverScopeDigest: burn.waiverScopeDigest,
    waiverReasonDigest: burn.waiverReasonDigest,
    grantDigest: burn.grantDigest,
    acceptedHeadSha: burn.acceptedHeadSha,
    baseRef: burn.baseRef,
    resolvedTrunkRef: burn.resolvedTrunkRef,
    authorizedAt: burn.authorizedAt,
    burnOid,
  });
}

export function renderLocalTrunkCloseReceipt(receipt) {
  if (
    !exact(receipt, [
      ...BURN_KEYS.filter((key) => key !== 'schema'),
      'schema',
      'result',
      'burnOid',
    ]) ||
    receipt.schema !== RECEIPT_SCHEMA ||
    receipt.result !== 'authorized-local-trunk-close'
  )
    fail('receipt');
  const burnOid = receipt.burnOid;
  const rest = { ...receipt };
  delete rest.result;
  delete rest.burnOid;
  validateLocalTrunkCloseBurn({ ...rest, schema: BURN_SCHEMA });
  if (!SHA.test(burnOid)) fail('burn-oid');
  const bytes = canonicalRecordJson(receipt).replaceAll('--', '-\\u002d');
  return (
    `${MARKER}${bytes} -->\n` +
    `Code for #${receipt.issue} was already on trunk at ${receipt.acceptedHeadSha}; ` +
    `the operator authorized this one-issue local close. ` +
    `Result: authorized-local-trunk-close. Operation: ${receipt.deliveryOperationId}. ` +
    `Grant: ${receipt.grantRecordId} revision ${receipt.grantRevision}. Burn: ${burnOid}.`
  );
}

export function parseLocalTrunkCloseReceipt(body) {
  if (typeof body !== 'string' || !body.startsWith(MARKER)) fail('receipt-marker');
  const end = body.indexOf(' -->\n', MARKER.length);
  if (end < 0) fail('receipt-marker');
  let receipt;
  try {
    receipt = JSON.parse(body.slice(MARKER.length, end));
  } catch {
    fail('receipt-json');
  }
  if (renderLocalTrunkCloseReceipt(receipt) !== body) fail('receipt-bytes');
  return receipt;
}

export function validateLocalTrunkRevisionBarrier(entry) {
  if (
    !exact(entry, BARRIER_KEYS) ||
    entry.schema !== BARRIER_SCHEMA ||
    !Number.isSafeInteger(entry.sequence) ||
    entry.sequence < 1 ||
    !(entry.predecessorOid === null || SHA.test(entry.predecessorOid)) ||
    !REPO.test(entry.repository) ||
    !Number.isSafeInteger(entry.issue) ||
    entry.issue < 1 ||
    !OPERATION.test(entry.deliveryOperationId) ||
    !OPERATION.test(entry.priorGrantRecordId) ||
    !OPERATION.test(entry.revisionRecordId) ||
    !OPERATION.test(entry.revisionGrantId) ||
    !instant(entry.revisionCreatedAt) ||
    !HASH.test(entry.revisionOperationId) ||
    !['revise', 'revoke'].includes(entry.action) ||
    entry.state !== 'revision-barrier'
  )
    fail('revision-barrier');
  return canonicalRecordJson(entry);
}

export function validateLocalTrunkRevisionPost(entry) {
  if (
    !exact(entry, REVISION_POST_KEYS) ||
    entry.schema !== REVISION_POST_SCHEMA ||
    !Number.isSafeInteger(entry.sequence) ||
    entry.sequence < 1 ||
    !(entry.predecessorOid === null || SHA.test(entry.predecessorOid)) ||
    !REPO.test(entry.repository) ||
    !Number.isSafeInteger(entry.issue) ||
    entry.issue < 1 ||
    !OPERATION.test(entry.deliveryOperationId) ||
    !OPERATION.test(entry.priorGrantRecordId) ||
    !OPERATION.test(entry.revisionRecordId) ||
    !HASH.test(entry.revisionOperationId) ||
    typeof entry.runId !== 'string' ||
    !entry.runId ||
    entry.state !== 'revision-post-requesting'
  )
    fail('revision-post');
  return canonicalRecordJson(entry);
}

export function validateLocalTrunkCloseJournalEntry(entry) {
  if (entry?.schema === REVISION_POST_SCHEMA) return validateLocalTrunkRevisionPost(entry);
  if (entry?.schema === BARRIER_SCHEMA) return validateLocalTrunkRevisionBarrier(entry);
  if (
    !exact(entry, ENTRY_KEYS) ||
    entry.schema !== ENTRY_SCHEMA ||
    !Number.isSafeInteger(entry.sequence) ||
    entry.sequence < 1 ||
    !(entry.predecessorOid === null || SHA.test(entry.predecessorOid)) ||
    !REPO.test(entry.repository) ||
    !Number.isSafeInteger(entry.issue) ||
    entry.issue < 1 ||
    !OPERATION.test(entry.deliveryOperationId) ||
    !STATES.includes(entry.state)
  )
    fail('entry');
  validateLocalTrunkCloseBurn(entry.burn);
  if (
    entry.repository !== entry.burn.repository ||
    entry.issue !== entry.burn.issue ||
    entry.deliveryOperationId !== entry.burn.deliveryOperationId
  )
    fail('entry-burn');
  if (entry.state === 'burned') {
    if (entry.publication !== null) fail('publication-state');
  } else {
    const p = entry.publication;
    if (
      !exact(p, PUBLICATION_KEYS) ||
      typeof p.receiptBody !== 'string' ||
      p.receiptDigest !== digest(p.receiptBody) ||
      typeof p.runId !== 'string' ||
      !p.runId ||
      !(
        p.commentNodeId === null ||
        (typeof p.commentNodeId === 'string' && p.commentNodeId.length > 0)
      ) ||
      !(p.createdAt === null || instant(p.createdAt)) ||
      (p.commentNodeId === null) !== (p.createdAt === null) ||
      (entry.state === 'receipt-requesting' && p.commentNodeId !== null) ||
      (entry.state === 'completed' && p.commentNodeId === null)
    )
      fail('publication');
    parseLocalTrunkCloseReceipt(p.receiptBody);
  }
  return canonicalRecordJson(entry);
}

export function projectLocalTrunkCloseJournal(events, { repository, issue } = {}) {
  if (
    !Array.isArray(events) ||
    events.length > 10000 ||
    !REPO.test(repository ?? '') ||
    !Number.isSafeInteger(issue) ||
    issue < 1
  )
    fail('history-input');
  const operations = new Map();
  const grantOwners = new Map();
  const barriers = new Map();
  let previous = null;
  for (const { oid, entry } of events) {
    if (!SHA.test(oid ?? '')) fail('history-oid');
    validateLocalTrunkCloseJournalEntry(entry);
    if (
      entry.repository !== repository ||
      entry.issue !== issue ||
      entry.sequence !== (previous?.entry.sequence ?? 0) + 1 ||
      entry.predecessorOid !== (previous?.oid ?? null)
    )
      fail('history-chain');
    if (entry.schema === BARRIER_SCHEMA) {
      if (barriers.has(entry.priorGrantRecordId)) fail('revision-barrier-replay');
      barriers.set(entry.priorGrantRecordId, {
        entry,
        oid,
        afterBurn: grantOwners.has(entry.priorGrantRecordId),
      });
      previous = { oid, entry };
      continue;
    }
    if (entry.schema === REVISION_POST_SCHEMA) {
      const barrier = barriers.get(entry.priorGrantRecordId);
      if (
        !barrier ||
        barrier.post ||
        barrier.entry.revisionRecordId !== entry.revisionRecordId ||
        barrier.entry.revisionOperationId !== entry.revisionOperationId ||
        barrier.entry.deliveryOperationId !== entry.deliveryOperationId
      )
        fail('revision-post-chain');
      barriers.set(entry.priorGrantRecordId, { ...barrier, post: { entry, oid } });
      previous = { oid, entry };
      continue;
    }
    if (barriers.has(entry.burn.grantRecordId) && !grantOwners.has(entry.burn.grantRecordId))
      fail('revision-before-burn');
    const prior = operations.get(entry.deliveryOperationId);
    if (prior) {
      if (
        STATES.indexOf(entry.state) !== STATES.indexOf(prior.state) + 1 ||
        !equal(entry.burn, prior.burn) ||
        (prior.publication &&
          (entry.publication?.receiptBody !== prior.publication.receiptBody ||
            entry.publication?.receiptDigest !== prior.publication.receiptDigest ||
            entry.publication?.runId !== prior.publication.runId))
      )
        fail('history-transition');
    } else if (entry.state !== 'burned') fail('history-root');
    const owner = grantOwners.get(entry.burn.grantRecordId);
    if (owner && owner !== entry.deliveryOperationId) fail('grant-replay');
    grantOwners.set(entry.burn.grantRecordId, entry.deliveryOperationId);
    const burnOid = prior?.burnOid ?? oid;
    if (entry.publication) {
      const expected = renderLocalTrunkCloseReceipt(
        buildLocalTrunkCloseReceipt({ burn: entry.burn, burnOid })
      );
      if (entry.publication.receiptBody !== expected) fail('publication-burn');
    }
    operations.set(entry.deliveryOperationId, {
      state: entry.state,
      burn: entry.burn,
      burnOid,
      burnSequence: prior?.burnSequence ?? entry.sequence,
      publication: entry.publication,
      entry,
    });
    previous = { oid, entry };
  }
  return {
    oid: previous?.oid ?? null,
    sequence: previous?.entry.sequence ?? 0,
    operations,
    grantOwners,
    barriers,
  };
}

function nextEntry(snapshot, candidate, state, publication = null) {
  return {
    schema: ENTRY_SCHEMA,
    sequence: snapshot.sequence + 1,
    predecessorOid: snapshot.oid,
    repository: candidate.repository,
    issue: candidate.issue,
    deliveryOperationId: candidate.deliveryOperationId,
    state,
    burn: candidate,
    publication,
  };
}

async function exactReadback(comments, receiptBody, candidate) {
  let values;
  try {
    values = await comments.list();
  } catch {
    uncertain('comment-list');
  }
  if (!Array.isArray(values)) uncertain('comment-list');
  const matches = [];
  for (const comment of values) {
    if (typeof comment?.body !== 'string' || !comment.body.startsWith(MARKER)) continue;
    let parsed;
    try {
      parsed = parseLocalTrunkCloseReceipt(comment.body);
    } catch {
      uncertain('comment-malformed');
    }
    if (
      parsed.deliveryOperationId !== candidate.deliveryOperationId &&
      parsed.grantRecordId !== candidate.grantRecordId
    )
      continue;
    if (
      comment.body !== receiptBody ||
      parsed.issue !== candidate.issue ||
      parsed.repository !== candidate.repository
    )
      uncertain('comment-conflict');
    matches.push(comment);
  }
  if (matches.length > 1) uncertain('comment-duplicate');
  if (matches.length === 0) return null;
  const found = matches[0];
  const id = found.nodeId ?? found.id;
  if (typeof id !== 'string' || !id || !instant(found.createdAt)) uncertain('comment-identity');
  return { id, createdAt: found.createdAt, body: found.body };
}

/** Serialize a local grant revision against the same CAS ref as its burn. */
export async function reserveLocalTrunkRevision({ candidate, journal } = {}) {
  const fields = [
    'repository',
    'issue',
    'deliveryOperationId',
    'priorGrantRecordId',
    'revisionRecordId',
    'revisionGrantId',
    'revisionCreatedAt',
    'revisionOperationId',
    'action',
  ];
  if (!exact(candidate, fields) || !journal) fail('revision-input');
  const stable = [
    'repository',
    'issue',
    'deliveryOperationId',
    'priorGrantRecordId',
    'revisionOperationId',
    'action',
  ];
  for (let attempt = 0; attempt < 16; attempt += 1) {
    let snapshot;
    try {
      snapshot = await journal.read();
    } catch {
      uncertain('revision-journal-read');
    }
    if (!(snapshot?.barriers instanceof Map) || !(snapshot.grantOwners instanceof Map))
      uncertain('revision-journal-snapshot');
    const prior = snapshot.barriers.get(candidate.priorGrantRecordId);
    if (prior) {
      if (stable.some((field) => prior.entry[field] !== candidate[field])) fail('revision-replay');
      return { status: 'existing', barrier: prior };
    }
    const entry = {
      schema: BARRIER_SCHEMA,
      sequence: snapshot.sequence + 1,
      predecessorOid: snapshot.oid,
      state: 'revision-barrier',
      ...candidate,
    };
    validateLocalTrunkRevisionBarrier(entry);
    let appended;
    try {
      appended = await journal.compareAndAppend({ expectedOid: snapshot.oid, entry });
    } catch {
      uncertain('revision-outcome');
    }
    if (appended.status === 'stale') continue;
    if (!['appended', 'confirmed'].includes(appended.status)) uncertain('revision-outcome');
    const barrier = appended.snapshot?.barriers?.get(candidate.priorGrantRecordId);
    if (!barrier || fields.some((field) => barrier.entry[field] !== candidate[field]))
      uncertain('revision-readback');
    return { status: 'reserved', barrier };
  }
  uncertain('revision-cas-retries');
}

/** Claim the only allowed POST for a reserved revision. Missing readback later is indeterminate. */
export async function reserveLocalTrunkRevisionPost({ candidate, journal } = {}) {
  const fields = [
    'repository',
    'issue',
    'deliveryOperationId',
    'priorGrantRecordId',
    'revisionRecordId',
    'revisionOperationId',
    'runId',
  ];
  if (!exact(candidate, fields) || !journal) fail('revision-post-input');
  for (let attempt = 0; attempt < 16; attempt += 1) {
    let snapshot;
    try {
      snapshot = await journal.read();
    } catch {
      uncertain('revision-post-journal-read');
    }
    const barrier = snapshot?.barriers?.get(candidate.priorGrantRecordId);
    if (
      !barrier ||
      barrier.entry.revisionRecordId !== candidate.revisionRecordId ||
      barrier.entry.revisionOperationId !== candidate.revisionOperationId
    )
      fail('revision-post-barrier');
    if (barrier.post) return { status: 'existing', post: barrier.post };
    const entry = {
      schema: REVISION_POST_SCHEMA,
      sequence: snapshot.sequence + 1,
      predecessorOid: snapshot.oid,
      state: 'revision-post-requesting',
      ...candidate,
    };
    validateLocalTrunkRevisionPost(entry);
    let appended;
    try {
      appended = await journal.compareAndAppend({ expectedOid: snapshot.oid, entry });
    } catch {
      uncertain('revision-post-outcome');
    }
    if (appended.status === 'stale') continue;
    if (!['appended', 'confirmed'].includes(appended.status)) uncertain('revision-post-outcome');
    const post = appended.snapshot?.barriers?.get(candidate.priorGrantRecordId)?.post;
    if (!post || !equal(post.entry, entry)) uncertain('revision-post-readback');
    return { status: 'reserved', post };
  }
  uncertain('revision-post-cas-retries');
}

/** Burn first, then reserve and read back the exact receipt before any Done transition. */
export async function completeLocalTrunkClose({
  candidate,
  journal,
  comments,
  runId,
  verifyInitialBurn,
  verifyHistoricalBurn,
  verifyPendingBurn,
} = {}) {
  validateLocalTrunkCloseBurn(candidate);
  if (!journal || !comments || typeof runId !== 'string' || !runId) fail('input');
  for (let attempt = 0; attempt < 16; attempt += 1) {
    let snapshot;
    try {
      snapshot = await journal.read();
    } catch {
      uncertain('journal-read');
    }
    if (
      !(snapshot?.operations instanceof Map) ||
      !(snapshot.grantOwners instanceof Map) ||
      !(snapshot.barriers instanceof Map) ||
      !Number.isSafeInteger(snapshot.sequence)
    )
      uncertain('journal-snapshot');
    if (
      snapshot.grantOwners.get(candidate.grantRecordId) &&
      snapshot.grantOwners.get(candidate.grantRecordId) !== candidate.deliveryOperationId
    )
      fail('grant-replay');
    let operation = snapshot.operations.get(candidate.deliveryOperationId);
    if (!operation && snapshot.barriers.has(candidate.grantRecordId)) fail('revision-before-burn');
    if (!operation) {
      if (typeof verifyInitialBurn !== 'function') fail('initial-verifier');
      const live = await verifyInitialBurn({ candidate, journalOid: snapshot.oid });
      if (!equal(live, candidate)) fail('live-burn-mismatch');
      const entry = nextEntry(snapshot, candidate, 'burned');
      let appended;
      try {
        appended = await journal.compareAndAppend({ expectedOid: snapshot.oid, entry });
      } catch {
        uncertain('burn-outcome');
      }
      if (appended.status === 'stale') continue;
      if (!['appended', 'confirmed'].includes(appended.status)) uncertain('burn-outcome');
      snapshot = appended.snapshot;
      operation = snapshot.operations.get(candidate.deliveryOperationId);
      if (!operation?.burnOid || !equal(operation.burn, candidate)) uncertain('burn-readback');
    } else {
      if (!equal(operation.burn, candidate)) fail('operation-replay');
      if (
        typeof verifyHistoricalBurn !== 'function' ||
        (await verifyHistoricalBurn({
          confirmedBurn: operation.burn,
          burnOid: operation.burnOid,
        })) !== true
      )
        fail('historical-authority');
    }
    const receipt = buildLocalTrunkCloseReceipt({
      burn: operation.burn,
      burnOid: operation.burnOid,
    });
    const receiptBody = renderLocalTrunkCloseReceipt(receipt);
    if (operation.state === 'completed') {
      const found = await exactReadback(comments, receiptBody, candidate);
      if (
        !found ||
        found.id !== operation.publication?.commentNodeId ||
        found.createdAt !== operation.publication?.createdAt
      )
        uncertain('completed-readback');
      return {
        status: 'existing',
        outcome: 'authorized-local-trunk-close',
        receipt,
        comment: found,
      };
    }
    // The grant source and Git journal are separate authorities. Re-read the
    // grant chain after CAS, before any publication, so a revoke racing the
    // first burn cannot turn an earlier proof into a completed close.
    if (
      typeof verifyPendingBurn !== 'function' ||
      (await verifyPendingBurn({ confirmedBurn: operation.burn, burnOid: operation.burnOid })) !==
        true
    )
      fail('pending-authority');
    let reservedHere = false;
    if (operation.state === 'burned') {
      const publication = {
        receiptBody,
        receiptDigest: digest(receiptBody),
        runId,
        commentNodeId: null,
        createdAt: null,
      };
      const entry = nextEntry(snapshot, candidate, 'receipt-requesting', publication);
      let appended;
      try {
        appended = await journal.compareAndAppend({ expectedOid: snapshot.oid, entry });
      } catch {
        uncertain('publication-reserve');
      }
      if (appended.status === 'stale') continue;
      if (!['appended', 'confirmed'].includes(appended.status)) uncertain('publication-reserve');
      snapshot = appended.snapshot;
      operation = snapshot.operations.get(candidate.deliveryOperationId);
      reservedHere = operation?.publication?.runId === runId;
    }
    if (
      operation?.state !== 'receipt-requesting' ||
      operation.publication?.receiptBody !== receiptBody
    )
      uncertain('publication-state');
    let found = await exactReadback(comments, receiptBody, candidate);
    if (!found) {
      if (!reservedHere || operation.publication.runId !== runId) uncertain('publication-owner');
      try {
        await comments.post({ body: receiptBody });
      } catch {
        /* Readback decides whether the POST took effect. */
      }
      found = await exactReadback(comments, receiptBody, candidate);
      if (!found) uncertain('publication-unknown');
    }
    // A revoke arriving while the comment POST was pending must also block
    // the completed journal state and the subsequent Done transition.
    if (
      (await verifyPendingBurn({ confirmedBurn: operation.burn, burnOid: operation.burnOid })) !==
      true
    )
      fail('pending-authority');
    const publication = {
      ...operation.publication,
      commentNodeId: found.id,
      createdAt: found.createdAt,
    };
    const entry = nextEntry(snapshot, candidate, 'completed', publication);
    let appended;
    try {
      appended = await journal.compareAndAppend({ expectedOid: snapshot.oid, entry });
    } catch {
      uncertain('completion-outcome');
    }
    if (appended.status === 'stale') continue;
    if (!['appended', 'confirmed'].includes(appended.status)) uncertain('completion-outcome');
    const completed = appended.snapshot.operations.get(candidate.deliveryOperationId);
    if (completed?.state !== 'completed' || completed.publication?.commentNodeId !== found.id)
      uncertain('completion-readback');
    return { status: 'created', outcome: 'authorized-local-trunk-close', receipt, comment: found };
  }
  uncertain('cas-retries');
}
