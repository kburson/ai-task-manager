// @story #1787 #1796
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { parseAitmRecord } from './github-records/record-envelope.mjs';
import { createDeliveryWaiverJournal } from './delivery-waiver-journal.mjs';
import { buildLocalTrunkCloseBurn, completeLocalTrunkClose } from './local-trunk-close-receipt.mjs';
import { verifyStoredDeliveryWaiverAuthority } from './workflow-policy/delivery-waiver-authority.mjs';
import { jsonlPath } from '../word-counter.mjs';
import {
  validateDeliveryWaiverBurn,
  validateDeliveryWaiverJournalEntry,
} from './delivery-waiver-journal.mjs';
import { validateWorkflowExceptionEnvelope } from './workflow-policy/exception-record.mjs';

const SCHEMA = 'aitm.delivery-waiver-journal-entry/v1';
const INTENT_KEYS = [
  'originalIntentId',
  'originalIntentDigest',
  'intentId',
  'intentBody',
  'intentDigest',
];
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const equal = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const COMMENT_MARKER = /^<!-- aitm-delivery-(intent|receipt) ([^\r\n]+) -->\n/;

function publicationIdentity(body) {
  if (typeof body !== 'string') return null;
  const match = COMMENT_MARKER.exec(body);
  if (!match) {
    if (body.includes('aitm-delivery-intent') || body.includes('aitm-delivery-receipt')) {
      throw new TypeError('delivery-waiver-consumption:publication-marker');
    }
    return null;
  }
  let record;
  try {
    record = JSON.parse(match[2]);
    if (canonicalRecordJson(record).replaceAll('--', '-\\u002d') !== match[2]) {
      throw new TypeError('noncanonical');
    }
  } catch {
    throw new TypeError('delivery-waiver-consumption:publication-record');
  }
  const expectedSchema =
    match[1] === 'intent' ? 'aitm.delivery-intent/v3' : 'aitm.delivery-receipt/v4';
  if (record.schema !== expectedSchema) {
    const legacy =
      match[1] === 'intent'
        ? ['aitm.delivery-intent/v1', 'aitm.delivery-intent/v2']
        : ['aitm.delivery-receipt/v1', 'aitm.delivery-receipt/v2', 'aitm.delivery-receipt/v3'];
    if (legacy.includes(record.schema)) return null;
    throw new TypeError('delivery-waiver-consumption:publication-schema');
  }
  if (
    typeof record.intentId !== 'string' ||
    !record.intentId ||
    typeof record.deliveryOperationId !== 'string' ||
    !record.deliveryOperationId ||
    !Number.isSafeInteger(record.issueNumber) ||
    record.issueNumber < 1 ||
    (match[1] === 'intent' &&
      (typeof record.repository !== 'string' ||
        !record.repository ||
        typeof record.originalIntentId !== 'string' ||
        !record.originalIntentId))
  ) {
    throw new TypeError('delivery-waiver-consumption:publication-identity');
  }
  return { ...record, kind: match[1] };
}

export class DeliveryWaiverConsumptionError extends Error {
  constructor(
    category,
    { operationId, pendingStage = null, approvalBurned = false, outcome = null } = {}
  ) {
    super(`delivery-waiver-consumption:${category}`);
    this.name = 'DeliveryWaiverConsumptionError';
    this.category = category;
    this.outcome =
      outcome ?? (category === 'delivery-waiver-ambiguity' ? 'indeterminate' : 'missing');
    this.operationId = operationId;
    this.pendingStage = pendingStage;
    this.approvalBurned = approvalBurned;
    this.requirementId = 'delivery.verification.waiver-authority';
    this.remediation =
      category === 'delivery-waiver-ambiguity'
        ? 'Preserve journal and comment evidence; stop delivery and close mutation retries; escalate through the supported defect or incident workflow to a repository administrator. Do not post again, replace the operation, or edit the journal manually.'
        : 'Reconcile the pinned delivery waiver transaction before retrying.';
  }
}
const fail = (category, detail) => {
  throw new DeliveryWaiverConsumptionError(category, detail);
};
const ambiguity = (operationId, pendingStage, approvalBurned) =>
  fail('delivery-waiver-ambiguity', { operationId, pendingStage, approvalBurned });

function keyOf(candidate) {
  const id = candidate?.deliveryOperationId;
  if (typeof id !== 'string' || id.length === 0 || id.length > 1024)
    fail('delivery-waiver-authority');
  return id;
}
function assertIntentCandidate(candidate) {
  keyOf(candidate);
  let published;
  try {
    published = publicationIdentity(candidate.intentBody);
  } catch {
    /* refused below */
  }
  if (
    typeof candidate.repository !== 'string' ||
    !Number.isSafeInteger(candidate.issue) ||
    INTENT_KEYS.some((key) => typeof candidate[key] !== 'string' || candidate[key].length === 0) ||
    !DIGEST.test(candidate.originalIntentDigest) ||
    candidate.intentDigest !== digest(candidate.intentBody) ||
    published?.kind !== 'intent' ||
    published.intentId !== candidate.intentId ||
    published.deliveryOperationId !== candidate.deliveryOperationId ||
    published.repository !== candidate.repository ||
    published.issueNumber !== candidate.issue
  ) {
    fail('delivery-waiver-authority', { operationId: candidate.deliveryOperationId });
  }
}
function matchesIntent(operation, candidate) {
  return INTENT_KEYS.every((key) => operation.intentPublication[key] === candidate[key]);
}
function entryFrom(snapshot, candidate, state, intentPublication, burn = null, publication = null) {
  const entry = {
    schema: SCHEMA,
    sequence: snapshot.sequence + 1,
    predecessorOid: snapshot.oid,
    repository: candidate.repository,
    issue: candidate.issue,
    deliveryOperationId: candidate.deliveryOperationId,
    state,
    intentPublication,
    burn,
    publication,
  };
  validateDeliveryWaiverJournalEntry(entry);
  return entry;
}
async function exactReadback(
  comments,
  body,
  operationId,
  stage,
  approvalBurned,
  intentId,
  issue,
  repository,
  originalIntentId = null,
  allowCompanionReceipt = false
) {
  let listing;
  try {
    listing = await comments.list();
  } catch {
    ambiguity(operationId, stage, approvalBurned);
  }
  if (!Array.isArray(listing)) ambiguity(operationId, stage, approvalBurned);
  const expected = publicationIdentity(body);
  const matches = [];
  for (const item of listing) {
    let identity;
    try {
      identity = publicationIdentity(item?.body);
    } catch {
      ambiguity(operationId, stage, approvalBurned);
    }
    if (!identity) continue;
    const sameTransaction =
      identity.deliveryOperationId === operationId ||
      identity.intentId === intentId ||
      (originalIntentId !== null &&
        identity.kind === 'intent' &&
        identity.originalIntentId === originalIntentId);
    if (!sameTransaction) continue;
    if (
      identity.issueNumber !== issue ||
      (identity.kind === 'intent' && identity.repository !== repository)
    ) {
      ambiguity(operationId, stage, approvalBurned);
    }
    if (identity.kind !== expected.kind) {
      if (expected.kind === 'intent' && !allowCompanionReceipt) {
        ambiguity(operationId, stage, approvalBurned);
      }
      continue;
    }
    if (
      item.body !== body ||
      identity.intentId !== intentId ||
      identity.deliveryOperationId !== operationId
    )
      ambiguity(operationId, stage, approvalBurned);
    matches.push(item);
  }
  if (matches.length > 1) ambiguity(operationId, stage, approvalBurned);
  if (matches.length === 0) return null;
  const match = matches[0];
  const id = match.nodeId ?? match.id;
  if (
    typeof id !== 'string' ||
    !id ||
    typeof match.createdAt !== 'string' ||
    Number.isNaN(Date.parse(match.createdAt)) ||
    new Date(match.createdAt).toISOString() !== match.createdAt
  ) {
    ambiguity(operationId, stage, approvalBurned);
  }
  return { id, createdAt: match.createdAt, body: match.body };
}
function assertJournalSnapshot(snapshot, candidate) {
  if (
    !snapshot ||
    !(snapshot.operations instanceof Map) ||
    !(snapshot.originalIntentOwners instanceof Map) ||
    !Number.isSafeInteger(snapshot.sequence)
  )
    ambiguity(keyOf(candidate), null, false);
}

/** Reserve and publish an exact intent once. Pending requests can only reconcile by readback. */
export async function ensureWaiverIntent({ candidate, journal, comments, runId } = {}) {
  assertIntentCandidate(candidate);
  const operationId = candidate.deliveryOperationId;
  if (typeof runId !== 'string' || !runId) fail('delivery-waiver-authority', { operationId });
  for (let attempt = 0; attempt < 16; attempt++) {
    let snapshot;
    try {
      snapshot = await journal.read();
    } catch {
      ambiguity(operationId, null, false);
    }
    assertJournalSnapshot(snapshot, candidate);
    const owner = snapshot.originalIntentOwners.get(candidate.originalIntentId);
    if (owner && owner !== operationId) fail('delivery-waiver-replay', { operationId });
    let operation = snapshot.operations.get(operationId);
    let reservedHere = false;
    if (operation) {
      if (!matchesIntent(operation, candidate)) fail('delivery-waiver-replay', { operationId });
    } else {
      const previouslyPublished = await exactReadback(
        comments,
        candidate.intentBody,
        operationId,
        'intent-requesting',
        false,
        candidate.intentId,
        candidate.issue,
        candidate.repository,
        candidate.originalIntentId
      );
      if (previouslyPublished) ambiguity(operationId, 'intent-requesting', false);
      const publication = {
        originalIntentId: candidate.originalIntentId,
        originalIntentDigest: candidate.originalIntentDigest,
        intentId: candidate.intentId,
        intentBody: candidate.intentBody,
        intentDigest: candidate.intentDigest,
        runId,
        commentNodeId: null,
        createdAt: null,
      };
      const entry = entryFrom(snapshot, candidate, 'intent-requesting', publication);
      let result;
      try {
        result = await journal.compareAndAppend({ expectedOid: snapshot.oid, entry });
      } catch {
        ambiguity(operationId, 'intent-requesting', false);
      }
      if (result.status === 'stale') continue;
      if (!['appended', 'confirmed'].includes(result.status))
        ambiguity(operationId, 'intent-requesting', false);
      operation = result.snapshot.operations.get(operationId);
      snapshot = result.snapshot;
      reservedHere =
        operation?.intentPublication.runId === runId && operation?.state === 'intent-requesting';
      if (!reservedHere) continue;
    }
    if (operation.state !== 'intent-requesting') {
      const found = await exactReadback(
        comments,
        candidate.intentBody,
        operationId,
        'intent-confirmed',
        operation.burn !== null,
        candidate.intentId,
        candidate.issue,
        candidate.repository,
        candidate.originalIntentId,
        ['receipt-requesting', 'completed'].includes(operation.state)
      );
      if (
        !found ||
        found.id !== operation.intentPublication.commentNodeId ||
        found.createdAt !== operation.intentPublication.createdAt
      ) {
        ambiguity(operationId, 'intent-confirmed', operation.burn !== null);
      }
      return {
        status: 'existing',
        comment: found,
        journalOid: snapshot.oid,
      };
    }
    let found = await exactReadback(
      comments,
      candidate.intentBody,
      operationId,
      'intent-requesting',
      false,
      candidate.intentId,
      candidate.issue,
      candidate.repository,
      candidate.originalIntentId
    );
    if (!found && reservedHere) {
      try {
        await comments.post(candidate.intentBody);
      } catch {
        /* exact readback decides */
      }
      found = await exactReadback(
        comments,
        candidate.intentBody,
        operationId,
        'intent-requesting',
        false,
        candidate.intentId,
        candidate.issue,
        candidate.repository,
        candidate.originalIntentId
      );
    }
    if (!found) ambiguity(operationId, 'intent-requesting', false);
    const confirmed = entryFrom(snapshot, candidate, 'intent-confirmed', {
      ...operation.intentPublication,
      commentNodeId: found.id,
      createdAt: found.createdAt,
    });
    let result;
    try {
      result = await journal.compareAndAppend({ expectedOid: snapshot.oid, entry: confirmed });
    } catch {
      ambiguity(operationId, 'intent-requesting', false);
    }
    if (result.status === 'stale') continue;
    if (!['appended', 'confirmed'].includes(result.status))
      ambiguity(operationId, 'intent-requesting', false);
    return {
      status: reservedHere ? 'created' : 'existing',
      comment: found,
      journalOid: result.snapshot.oid,
    };
  }
  ambiguity(operationId, 'intent-requesting', false);
}

function assertInitialBurnEvidence({ candidate, operation, evidence }) {
  const waiver = evidence?.waiver;
  const verification = evidence?.verification;
  const grant = waiver?.grant;
  try {
    validateWorkflowExceptionEnvelope(grant, {
      repository: candidate.repository,
      issue: candidate.issue,
    });
  } catch {
    fail('delivery-waiver-authority', { operationId: candidate.deliveryOperationId });
  }
  const scope = grant.payload.deliveryScope;
  const facts = verification?.verifiedFacts;
  const base = facts?.baseReceiptInput;
  if (
    waiver.outcome !== 'waived' ||
    grant.payload.status !== 'active' ||
    evidence.authorizedAt !== candidate.authorizedAt ||
    grant.recordId !== candidate.waiverRecordId ||
    grant.payload.revision !== candidate.waiverRevision ||
    grant.payload.waiverScopeDigest !== candidate.waiverScopeDigest ||
    waiver.waiverScopeDigest !== candidate.waiverScopeDigest ||
    waiver.waiverReasonDigest !== candidate.waiverReasonDigest ||
    digest(grant.payload.reason) !== candidate.waiverReasonDigest ||
    digest(canonicalRecordJson(grant)) !== candidate.grantDigest ||
    scope.deliveryOperationId !== candidate.deliveryOperationId ||
    scope.acceptedHeadSha !== candidate.acceptedHeadSha ||
    Date.parse(candidate.authorizedAt) < Date.parse(grant.createdAt) ||
    Date.parse(candidate.authorizedAt) >= Date.parse(grant.payload.expiresAt) ||
    operation.intentPublication.intentId !== candidate.intentId ||
    verification?.deliveryDisposition !== 'waived' ||
    verification.receiptInput !== null ||
    facts?.waivedRequirementId !== scope.requirementId ||
    typeof facts.observedFailureCategory !== 'string' ||
    !facts.observedFailureCategory ||
    base?.issueNumber !== candidate.issue ||
    base.expectedHeadSha !== candidate.acceptedHeadSha ||
    base.mergeCommitSha !== candidate.mergeCommitSha ||
    base.intentId !== candidate.intentId
  ) {
    fail('delivery-waiver-authority', { operationId: candidate.deliveryOperationId });
  }
}

/**
 * The first burned-event commit OID is immutable; the moving tip is separate.
 * On a first burn, verifyInitialBurn must resolve the current Task 5 waiver and
 * run the complete fresh non-waived verifier immediately before this CAS. It
 * returns { authorizedAt, waiver, verification }; a confirmed historical burn
 * skips this live port and uses only its pinned evidence.
 */
export async function ensureDeliveryWaiverBurn({
  candidate,
  journal,
  verifyInitialBurn,
  expectedBurnOid = null,
} = {}) {
  validateDeliveryWaiverBurn(candidate);
  const operationId = candidate.deliveryOperationId;
  for (let attempt = 0; attempt < 16; attempt++) {
    let snapshot;
    try {
      snapshot = await journal.read();
    } catch {
      ambiguity(operationId, null, false);
    }
    assertJournalSnapshot(snapshot, candidate);
    const operation = snapshot.operations.get(operationId);
    if (!operation || operation.state === 'intent-requesting') {
      if (expectedBurnOid) ambiguity(operationId, 'burned', true);
      fail('delivery-waiver-authority', { operationId });
    }
    if (
      operation.intentPublication.intentId !== candidate.intentId ||
      operation.entry.repository !== candidate.repository ||
      operation.entry.issue !== candidate.issue
    ) {
      fail('delivery-waiver-replay', { operationId });
    }
    if (operation.burn) {
      if (!equal(operation.burn, candidate)) fail('delivery-waiver-burn-mismatch', { operationId });
      if (!operation.burnOid) ambiguity(operationId, 'burned', true);
      if (expectedBurnOid && operation.burnOid !== expectedBurnOid)
        ambiguity(operationId, 'burned', true);
      return {
        burn: operation.burn,
        burnOid: operation.burnOid,
        journalOid: snapshot.oid,
        status: 'existing',
      };
    }
    if (operation.state !== 'intent-confirmed')
      fail('delivery-waiver-burn-mismatch', { operationId });
    if (expectedBurnOid) ambiguity(operationId, 'burned', true);
    if (typeof verifyInitialBurn !== 'function') fail('delivery-waiver-authority', { operationId });
    let evidence;
    try {
      evidence = await verifyInitialBurn({
        candidate,
        intentPublication: operation.intentPublication,
        journalOid: snapshot.oid,
      });
    } catch (error) {
      if (error?.category && error?.outcome) throw error;
      ambiguity(operationId, 'burned', false);
    }
    assertInitialBurnEvidence({ candidate, operation, evidence });
    const entry = entryFrom(snapshot, candidate, 'burned', operation.intentPublication, candidate);
    let result;
    try {
      result = await journal.compareAndAppend({ expectedOid: snapshot.oid, entry });
    } catch {
      ambiguity(operationId, 'burned', false);
    }
    if (result.status === 'stale') continue;
    if (!['appended', 'confirmed'].includes(result.status)) ambiguity(operationId, 'burned', false);
    const consumed = result.snapshot.operations.get(operationId);
    if (!consumed?.burnOid || !equal(consumed.burn, candidate))
      ambiguity(operationId, 'burned', true);
    return {
      burn: consumed.burn,
      burnOid: consumed.burnOid,
      journalOid: result.snapshot.oid,
      status: 'created',
    };
  }
  ambiguity(operationId, 'burned', false);
}

/** A receipt POST is allowed only by the invocation that just won requesting CAS. */
export async function publishWaivedReceipt({
  burn,
  burnOid,
  receiptBody,
  receiptDigest,
  journal,
  comments,
  runId,
} = {}) {
  validateDeliveryWaiverBurn(burn);
  const operationId = burn.deliveryOperationId;
  if (
    typeof receiptBody !== 'string' ||
    receiptDigest !== digest(receiptBody) ||
    typeof runId !== 'string' ||
    !runId
  )
    fail('delivery-waiver-authority', { operationId });
  let receiptIdentity;
  try {
    receiptIdentity = publicationIdentity(receiptBody);
  } catch {
    /* refused below */
  }
  if (
    receiptIdentity?.kind !== 'receipt' ||
    receiptIdentity.intentId !== burn.intentId ||
    receiptIdentity.deliveryOperationId !== operationId ||
    receiptIdentity.issueNumber !== burn.issue
  ) {
    fail('delivery-waiver-authority', { operationId });
  }
  for (let attempt = 0; attempt < 16; attempt++) {
    let snapshot;
    try {
      snapshot = await journal.read();
    } catch {
      ambiguity(operationId, null, true);
    }
    assertJournalSnapshot(snapshot, burn);
    const operation = snapshot.operations.get(operationId);
    if (
      !operation?.burn ||
      !operation.burnOid ||
      operation.burnOid !== burnOid ||
      !equal(operation.burn, burn)
    )
      fail('delivery-waiver-burn-mismatch', { operationId });
    let reservedHere = false;
    if (operation.state === 'burned') {
      const publication = { receiptBody, receiptDigest, runId, commentNodeId: null };
      const entry = entryFrom(
        snapshot,
        burn,
        'receipt-requesting',
        operation.intentPublication,
        burn,
        publication
      );
      let result;
      try {
        result = await journal.compareAndAppend({ expectedOid: snapshot.oid, entry });
      } catch {
        ambiguity(operationId, 'receipt-requesting', true);
      }
      if (result.status === 'stale') continue;
      if (!['appended', 'confirmed'].includes(result.status))
        ambiguity(operationId, 'receipt-requesting', true);
      snapshot = result.snapshot;
      reservedHere = snapshot.operations.get(operationId)?.publication.runId === runId;
    }
    const pending = snapshot.operations.get(operationId);
    if (
      !pending?.publication ||
      pending.publication.receiptBody !== receiptBody ||
      pending.publication.receiptDigest !== receiptDigest
    )
      fail('delivery-waiver-replay', { operationId });
    if (pending.state === 'completed') {
      const found = await exactReadback(
        comments,
        receiptBody,
        operationId,
        'completed',
        true,
        burn.intentId,
        burn.issue,
        burn.repository
      );
      if (!found || found.id !== pending.publication.commentNodeId) {
        ambiguity(operationId, 'completed', true);
      }
      return {
        status: 'existing',
        comment: found,
        journalOid: snapshot.oid,
      };
    }
    if (pending.state !== 'receipt-requesting')
      fail('delivery-waiver-burn-mismatch', { operationId });
    let found = await exactReadback(
      comments,
      receiptBody,
      operationId,
      'receipt-requesting',
      true,
      burn.intentId,
      burn.issue,
      burn.repository
    );
    if (!found && reservedHere) {
      try {
        await comments.post(receiptBody);
      } catch {
        /* exact readback decides */
      }
      found = await exactReadback(
        comments,
        receiptBody,
        operationId,
        'receipt-requesting',
        true,
        burn.intentId,
        burn.issue,
        burn.repository
      );
    }
    if (!found) ambiguity(operationId, 'receipt-requesting', true);
    const completed = entryFrom(snapshot, burn, 'completed', pending.intentPublication, burn, {
      ...pending.publication,
      commentNodeId: found.id,
    });
    let result;
    try {
      result = await journal.compareAndAppend({ expectedOid: snapshot.oid, entry: completed });
    } catch {
      ambiguity(operationId, 'receipt-requesting', true);
    }
    if (result.status === 'stale') continue;
    if (!['appended', 'confirmed'].includes(result.status))
      ambiguity(operationId, 'receipt-requesting', true);
    return {
      status: reservedHere ? 'created' : 'existing',
      comment: found,
      journalOid: result.snapshot.oid,
    };
  }
  ambiguity(operationId, 'receipt-requesting', true);
}

/** The local-trunk lane uses the same remote Git CAS/readback journal primitive with typed local entries. */
export async function consumeLocalTrunkClose({
  gateInput,
  cfg,
  projectDir,
  pexec,
  readProof,
  journal = null,
  comments = null,
  runId,
  now = () => new Date().toISOString(),
  verifyStoredAuthority = verifyStoredDeliveryWaiverAuthority,
  resolveTranscriptPath = jsonlPath,
} = {}) {
  if (
    !gateInput ||
    !cfg?.repo ||
    !projectDir ||
    typeof pexec !== 'function' ||
    typeof readProof !== 'function' ||
    typeof runId !== 'string' ||
    !runId
  )
    throw new TypeError('local-trunk-close:input');
  const activeJournal =
    journal ??
    createDeliveryWaiverJournal({
      cwd: projectDir,
      repository: cfg.repo,
      issue: gateInput.issueNumber,
      mode: 'local-trunk',
    });
  const listComments = async () => {
    const { stdout } = await pexec('gh', [
      'api',
      '--paginate',
      '--slurp',
      `repos/${cfg.repo}/issues/${gateInput.issueNumber}/comments?per_page=100`,
    ]);
    const pages = JSON.parse(String(stdout ?? ''));
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page)))
      throw new TypeError('local-trunk-close:comment-pages');
    return pages.flat();
  };
  const commentPort = comments ?? {
    async list() {
      return (await listComments()).map((item) => ({
        id: item.node_id ?? item.id,
        body: item.body,
        createdAt: item.created_at,
      }));
    },
    async post({ body }) {
      const { stdout } = await pexec('gh', [
        'api',
        '--method',
        'POST',
        `repos/${cfg.repo}/issues/${gateInput.issueNumber}/comments`,
        '-f',
        `body=${body}`,
      ]);
      const item = JSON.parse(String(stdout ?? ''));
      return { id: item.node_id ?? item.id, body: item.body, createdAt: item.created_at };
    },
  };
  const loadGrant = async (recordId) => {
    const values = await listComments();
    const records = values
      .filter((item) => typeof item?.body === 'string' && item.body.includes('aitm-record'))
      .map(
        (item) =>
          parseAitmRecord({
            commentNodeId: String(item.node_id ?? item.id),
            body: item.body,
            expectedRepository: cfg.repo,
            expectedIssue: gateInput.issueNumber,
          }).envelope
      );
    const matches = records.filter((record) => record.recordId === recordId);
    if (matches.length !== 1) throw new TypeError('local-trunk-close:grant-ambiguous');
    return { grant: matches[0], records };
  };
  const verifyRecordedBurn = async ({ confirmedBurn }) => {
    const { grant, records } = await loadGrant(confirmedBurn.grantRecordId);
    await verifyStoredAuthority(grant, { resolveTranscriptPath });
    const rebuilt = buildLocalTrunkCloseBurn({
      grant,
      authorizedAt: confirmedBurn.authorizedAt,
    });
    if (!equal(rebuilt, confirmedBurn)) throw new TypeError('local-trunk-close:historical-burn');
    // A local revision comment is authoritative only with a matching barrier
    // in the same CAS history as the burn. Its journal sequence, not a local
    // timestamp, determines whether it preceded the one-use burn.
    const journalSnapshot = await activeJournal.read();
    const operation = journalSnapshot.operations.get(confirmedBurn.deliveryOperationId);
    if (!operation || !equal(operation.burn, confirmedBurn))
      throw new TypeError('local-trunk-close:historical-journal');
    for (const record of records) {
      if (
        record.recordType !== 'workflow-exception' ||
        record.payload?.exceptionId !== grant.payload.exceptionId ||
        record.payload.revision <= grant.payload.revision
      )
        continue;
      const barrier = journalSnapshot.barriers?.get(record.predecessor);
      if (
        !barrier ||
        barrier.entry.revisionRecordId !== record.recordId ||
        barrier.entry.revisionOperationId !== record.payload.operationId ||
        barrier.entry.revisionGrantId !== record.authority.grantId ||
        barrier.entry.revisionCreatedAt !== record.createdAt ||
        barrier.entry.deliveryOperationId !== confirmedBurn.deliveryOperationId ||
        barrier.entry.action !== (record.payload.status === 'revoked' ? 'revoke' : 'revise')
      )
        throw new TypeError('local-trunk-close:without-barrier-revision');
      if (barrier.entry.sequence < operation.burnSequence)
        throw new TypeError('local-trunk-close:pre-burn-supersession');
    }
    const scope = grant.payload.deliveryScope;
    const proof = await readProof({
      active: true,
      scope,
      scopeIdentity: grant.payload.scopeIdentity,
      deliveryOperationId: scope.deliveryOperationId,
      waiverScopeDigest: grant.payload.waiverScopeDigest,
    });
    if (proof?.outcome !== 'authorized-local-trunk-close')
      throw new TypeError(`local-trunk-close:historical-proof:${proof?.reasonId}`);
    return true;
  };
  const verifyHistoricalBurn = (input) => verifyRecordedBurn(input);
  const verifyPendingBurn = (input) => verifyRecordedBurn(input);
  let snapshot;
  try {
    snapshot = await activeJournal.read();
  } catch {
    throw new TypeError('local-trunk-close:indeterminate:journal-read');
  }
  if (!(snapshot?.operations instanceof Map))
    throw new TypeError('local-trunk-close:indeterminate:journal-snapshot');
  const existing = [...snapshot.operations.values()].filter(
    (operation) =>
      operation.burn?.repository === cfg.repo &&
      operation.burn?.issue === gateInput.issueNumber &&
      operation.burn?.acceptedHeadSha === gateInput.acceptedSha
  );
  if (existing.length > 1) throw new TypeError('local-trunk-close:indeterminate:operations');
  let candidate;
  if (existing.length === 1) {
    candidate = existing[0].burn;
    await verifyHistoricalBurn({ confirmedBurn: candidate });
  } else {
    const proof = await readProof();
    if (proof?.outcome !== 'authorized-local-trunk-close' || !proof.grantEnvelope)
      throw new TypeError(
        `local-trunk-close:initial-proof:${proof?.reasonId ?? 'grant-unavailable'}`
      );
    candidate = buildLocalTrunkCloseBurn({ grant: proof.grantEnvelope, authorizedAt: now() });
  }
  return completeLocalTrunkClose({
    candidate,
    journal: activeJournal,
    comments: commentPort,
    runId,
    verifyInitialBurn: async () => {
      const proof = await readProof();
      if (proof?.outcome !== 'authorized-local-trunk-close' || !proof.grantEnvelope)
        throw new TypeError(
          `local-trunk-close:initial-proof:${proof?.reasonId ?? 'grant-unavailable'}`
        );
      const live = buildLocalTrunkCloseBurn({ grant: proof.grantEnvelope, authorizedAt: now() });
      if (!equal({ ...live, authorizedAt: candidate.authorizedAt }, candidate))
        throw new TypeError('local-trunk-close:initial-grant-drift');
      return candidate;
    },
    verifyHistoricalBurn,
    verifyPendingBurn,
  });
}
