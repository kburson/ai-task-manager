// Pure review-epoch authority projection. Writers retain every audit marker;
// this reducer selects only the authority that is current for the latest Review
// visit. It deliberately has no clock or I/O dependency.

import { parseMarker, serializeMarker } from './marker-grammar.mjs';
import { parseDodVerifiedMarker, stripFencedCodeBlocks } from './markers.mjs';
import { parseEntryMarkers } from './stage-entry-markers.mjs';
import { findReviewFailureBlockSpan } from './review-failure-block.mjs';

const SCHEMA = '1';
const PROOF_NAME = 'agent-review-proof';
const APPROVAL_NAME = 'review-approved';
const INVALIDATION_NAME = 'review-invalidated';
const PROOF_KEYS = ['schema', 'epoch', 'sha', 'ts', 'validators', 'result'];
const APPROVAL_KEYS = ['schema', 'epoch', 'proof-sha', 'ts', 'provenance', 'signals'];
const INVALIDATION_KEYS = ['schema', 'epoch', 'ts', 'reason'];

function exactKeys(props, keys) {
  const actual = Object.keys(props).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, i) => key === expected[i]);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isEpoch(value) {
  const match = /^review:([1-9]\d*):(.+)$/.exec(String(value || ''));
  return Boolean(match && hasText(match[2]));
}

function markerLines(body) {
  const src = stripFencedCodeBlocks(body);
  const lines = [];
  const re = /<!--[\s\S]*?-->/g;
  let match;
  while ((match = re.exec(src)) !== null) lines.push({ raw: match[0], index: match.index });
  return lines;
}

function malformedMarker(raw, name) {
  return new RegExp(`<!--\\s*aitm-${name}\\b`, 'i').test(raw) && !parseMarker(raw);
}

function parseLegacyApproval(raw, parsed, index) {
  if (parsed && parsed.name === APPROVAL_NAME) {
    const props = parsed.props || {};
    if ('schema' in props || 'epoch' in props || 'proof-sha' in props || 'provenance' in props) {
      return { malformed: true };
    }
    if (
      !exactKeys(props, props['full-auto'] ? ['ts', 'full-auto', 'signals'] : ['ts']) ||
      !hasText(props.ts)
    ) {
      return { malformed: true };
    }
    const fullAuto = props['full-auto'] === 'yes' || props['full-auto'] === 'true';
    if (props['full-auto'] && !fullAuto) return { malformed: true };
    return {
      approval: {
        legacy: true,
        ts: props.ts,
        provenance: fullAuto ? 'full-auto' : 'human',
        signals: props.signals || '',
        index,
      },
    };
  }
  const legacy = raw.match(/^<!--\s*aitm-review-approved:\s*([^>\s]+)\s*-->$/i);
  if (!legacy) return null;
  return {
    approval: {
      legacy: true,
      ts: legacy[1],
      provenance: 'human',
      signals: '',
      index,
    },
  };
}

function parseVersionedProof(props, index) {
  if (
    !exactKeys(props, PROOF_KEYS) ||
    props.schema !== SCHEMA ||
    !isEpoch(props.epoch) ||
    !hasText(props.sha) ||
    !hasText(props.ts) ||
    !hasText(props.validators) ||
    !['pass', 'fail'].includes(props.result)
  ) {
    return { malformed: true };
  }
  return { proof: { ...props, index } };
}

function parseVersionedApproval(props, index) {
  const required =
    props.provenance === 'full-auto' ? APPROVAL_KEYS : APPROVAL_KEYS.filter((k) => k !== 'signals');
  if (
    !exactKeys(props, required) ||
    props.schema !== SCHEMA ||
    !isEpoch(props.epoch) ||
    !hasText(props['proof-sha']) ||
    !hasText(props.ts) ||
    !['human', 'full-auto'].includes(props.provenance) ||
    (props.provenance === 'full-auto' && !hasText(props.signals))
  ) {
    return { malformed: true };
  }
  return {
    approval: {
      epoch: props.epoch,
      proofSha: props['proof-sha'],
      ts: props.ts,
      provenance: props.provenance,
      signals: props.signals || '',
      legacy: false,
      index,
    },
  };
}

function parseVersionedInvalidation(props, index) {
  if (
    !exactKeys(props, INVALIDATION_KEYS) ||
    props.schema !== SCHEMA ||
    !isEpoch(props.epoch) ||
    !hasText(props.ts) ||
    !hasText(props.reason)
  ) {
    return { malformed: true };
  }
  return { invalidation: { ...props, index } };
}

export function reviewEpochId({ visit, enteredReviewAt }) {
  const numericVisit = Number(visit);
  if (!Number.isSafeInteger(numericVisit) || numericVisit < 1 || !hasText(enteredReviewAt)) {
    throw new Error('reviewEpochId requires a positive integer visit and enteredReviewAt');
  }
  return `review:${numericVisit}:${enteredReviewAt}`;
}

export function serializeAgentReviewProof({ epoch, sha, ts, validators, result }) {
  return serializeMarker(PROOF_NAME, { schema: SCHEMA, epoch, sha, ts, validators, result });
}

export function serializeReviewApproval({ epoch, proofSha, ts, provenance, signals = '' }) {
  const props = { schema: SCHEMA, epoch, 'proof-sha': proofSha, ts, provenance };
  if (provenance === 'full-auto') props.signals = signals;
  return serializeMarker(APPROVAL_NAME, props);
}

export function serializeReviewInvalidation({ epoch, ts, reason }) {
  return serializeMarker(INVALIDATION_NAME, { schema: SCHEMA, epoch, ts, reason });
}

export function parseReviewAuthority(body) {
  const source = stripFencedCodeBlocks(body);
  const markers = markerLines(source);
  const epochs = [];
  const malformed = [];
  for (const { raw, index } of markers) {
    if (!/^<!--\s*aitm-entered-review(?:-\d+)?(?:\s|:|-->)/i.test(raw)) continue;
    const entries = parseEntryMarkers(raw).filter((entry) => entry.stage === 'review');
    if (entries.length !== 1) {
      malformed.push({ raw, index, reason: 'invalid-review-entry-marker' });
      continue;
    }
    const [entry] = entries;
    epochs.push({
      visit: entry.visit,
      enteredReviewAt: entry.ts,
      epoch: reviewEpochId({ visit: entry.visit, enteredReviewAt: entry.ts }),
      index,
    });
  }
  const proofs = [];
  const approvals = [];
  const invalidations = [];

  for (const { raw, index } of markers) {
    const parsed = parseMarker(raw);
    if (
      malformedMarker(raw, PROOF_NAME) ||
      malformedMarker(raw, APPROVAL_NAME) ||
      malformedMarker(raw, INVALIDATION_NAME)
    ) {
      malformed.push({ raw, index, reason: 'invalid-marker-grammar' });
      continue;
    }
    if (!parsed) continue;
    let result = null;
    if (parsed.name === PROOF_NAME) result = parseVersionedProof(parsed.props || {}, index);
    if (parsed.name === APPROVAL_NAME) {
      result =
        'schema' in (parsed.props || {})
          ? parseVersionedApproval(parsed.props || {}, index)
          : parseLegacyApproval(raw, parsed, index);
    }
    if (parsed.name === INVALIDATION_NAME)
      result = parseVersionedInvalidation(parsed.props || {}, index);
    if (!result) continue;
    if (result.malformed) malformed.push({ raw, index, reason: 'invalid-attributes' });
    else if (result.proof) proofs.push(result.proof);
    else if (result.approval) approvals.push(result.approval);
    else if (result.invalidation) invalidations.push(result.invalidation);
  }

  return { epochs, proofs, approvals, invalidations, malformed };
}

function latestEpoch(epochs) {
  if (epochs.length === 0) return null;
  return [...epochs].sort((a, b) => a.visit - b.visit).at(-1);
}

export function deriveReviewAuthority(body, { verifiedSha = '' } = {}) {
  const parsed = parseReviewAuthority(body);
  const latest = latestEpoch(parsed.epochs);
  const epoch = latest?.epoch || null;
  const reasons = [];
  const historicalApproval = parsed.approvals.at(-1) || null;

  if (parsed.malformed.length > 0) {
    return {
      epoch,
      proof: null,
      approval: historicalApproval,
      status: 'malformed',
      reasons: ['malformed-review-authority-marker'],
    };
  }
  if (new Set(parsed.epochs.map((item) => item.visit)).size !== parsed.epochs.length) {
    return {
      epoch,
      proof: null,
      approval: historicalApproval,
      status: 'ambiguous',
      reasons: ['duplicate-review-visit'],
    };
  }
  if (!hasText(verifiedSha)) {
    return {
      epoch,
      proof: null,
      approval: historicalApproval,
      status: 'missing',
      reasons: ['verified-sha-missing'],
    };
  }

  const legacyApprovals = parsed.approvals.filter((item) => item.legacy);
  if (legacyApprovals.length > 1) {
    return {
      epoch,
      proof: null,
      approval: legacyApprovals.at(-1),
      status: 'ambiguous',
      reasons: ['multiple-legacy-approvals'],
    };
  }
  if (legacyApprovals.length === 1) {
    if (
      parsed.epochs.length > 1 ||
      parsed.invalidations.length > 0 ||
      parsed.epochs.some((item) => item.index > legacyApprovals[0].index)
    ) {
      return {
        epoch,
        proof: null,
        approval: legacyApprovals[0],
        status: 'stale',
        reasons: ['legacy-authority-superseded'],
      };
    }
    return {
      epoch,
      proof: null,
      approval: legacyApprovals[0],
      status: 'current',
      reasons: ['legacy-authority'],
    };
  }

  if (!latest) {
    return {
      epoch: null,
      proof: null,
      approval: null,
      status: 'missing',
      reasons: ['review-epoch-missing'],
    };
  }

  const currentProofs = parsed.proofs.filter((item) => item.epoch === epoch);
  const currentApprovals = parsed.approvals.filter((item) => !item.legacy && item.epoch === epoch);
  const proof = currentProofs.at(-1) || null;
  const approval = currentApprovals.at(-1) || historicalApproval;
  if (!proof || !approval || approval.epoch !== epoch) {
    const stale = Boolean(historicalApproval && historicalApproval.epoch !== epoch);
    return {
      epoch,
      proof,
      approval,
      status: stale ? 'stale' : 'missing',
      reasons: [stale ? 'approval-for-prior-epoch' : 'current-proof-or-approval-missing'],
    };
  }
  if (proof.result !== 'pass') reasons.push('agent-review-did-not-pass');
  if (verifiedSha && proof.sha !== verifiedSha) reasons.push('verified-sha-mismatch');
  if (approval.proofSha !== proof.sha) reasons.push('approval-proof-sha-mismatch');
  const laterInvalidation = parsed.invalidations.some(
    // An invalidation revokes approval authority, not only a particular proof.
    // A later retry can add a fresh passing proof, but a human must approve that
    // renewed proof after the invalidation before authority becomes current.
    (item) => item.epoch === epoch && item.index > approval.index
  );
  if (laterInvalidation) reasons.push('authority-invalidated');
  return { epoch, proof, approval, status: reasons.length ? 'stale' : 'current', reasons };
}

// The durable Test/DoD marker is the only persisted SHA authority for review
// proof. Keep this body-only projection at the boundary so mutation writers do
// not accidentally substitute an ambient checkout SHA.
export function derivePersistedReviewAuthority(body) {
  const verifiedSha = parseDodVerifiedMarker(stripFencedCodeBlocks(body))?.sha || '';
  const authority = deriveReviewAuthority(body, { verifiedSha });
  if (findReviewFailureBlockSpan(stripFencedCodeBlocks(body).split('\n'))) {
    return {
      ...authority,
      status: 'stale',
      reasons: [...authority.reasons, 'review-failed'],
      verifiedSha,
    };
  }
  return { ...authority, verifiedSha };
}
