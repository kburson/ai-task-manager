// @story #1675
import {
  EXPLANATION_SCHEMA,
  presentActionDecision,
  validateExplanationEnvelope,
} from '../scripts/task-tracker/lib/action-decision/presentation.mjs';

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const KNOWN = /^([a-z0-9][a-z0-9._-]*)@(sha256:[a-f0-9]{64})$/;
const SOURCE_PREFIX = 'aitm-guidance-source:project-owned-diverged:';

export function parseKnownGuidanceReceipts(values = []) {
  if (!Array.isArray(values)) throw new TypeError('guidance-receipts:known-array');
  const seen = new Set();
  const parsed = [];
  for (const raw of values) {
    const match = KNOWN.exec(String(raw));
    if (!match) continue;
    const key = `${match[1]}@${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push({ id: match[1], digest: match[2] });
  }
  return parsed;
}

function validateAgentIndex(agentIndex) {
  if (
    agentIndex?.schema !== 'aitm.guidance-agent-index/v1' ||
    typeof agentIndex.byId !== 'object' ||
    agentIndex.byId === null ||
    Array.isArray(agentIndex.byId)
  ) {
    throw new TypeError('guidance-receipts:agent-index');
  }
}

export function projectGuidance({ guidanceIds, agentIndex, known = [] } = {}) {
  validateAgentIndex(agentIndex);
  if (!Array.isArray(guidanceIds) || guidanceIds.length !== 1) {
    throw new TypeError('guidance-receipts:guidance-ids');
  }
  const knownReceipts = parseKnownGuidanceReceipts(known);
  return guidanceIds.map((id) => {
    const entry = agentIndex.byId[id];
    if (
      entry?.id !== id ||
      !DIGEST.test(entry.agentDigest ?? '') ||
      !Array.isArray(entry.instruction) ||
      entry.instruction.length === 0
    ) {
      throw new TypeError(`guidance-receipts:entry:${id}`);
    }
    const base = { id, digest: entry.agentDigest };
    const matched = knownReceipts.some(
      (receipt) => receipt.id === id && receipt.digest === entry.agentDigest
    );
    return matched
      ? { ...base, status: 'not-modified' }
      : {
          ...base,
          status: 'expanded',
          agent: { instruction: structuredClone(entry.instruction) },
        };
  });
}

function sourceWarning(admissionWarnings) {
  return admissionWarnings.find(({ code }) => code === 'guidance-source-diverged') ?? null;
}

export function buildExplanationEnvelope({
  decision,
  agentIndex,
  known = [],
  knownSource = null,
  admissionWarnings = [],
  diagnostic = false,
  diagnosticMessages = [],
} = {}) {
  if (!Array.isArray(admissionWarnings)) {
    throw new TypeError('guidance-receipts:admission-warnings');
  }
  if (typeof diagnostic !== 'boolean') throw new TypeError('guidance-receipts:diagnostic');
  const warning = sourceWarning(admissionWarnings);
  const receipt = warning ? `${SOURCE_PREFIX}${warning.args?.digest ?? ''}` : null;
  const suppressSourceWarning = receipt !== null && knownSource === receipt;
  const result = presentActionDecision({
    decision,
    admissionWarnings,
    suppressSourceWarning,
  });
  const envelope = {
    schema: EXPLANATION_SCHEMA,
    result,
    guidance: projectGuidance({ guidanceIds: decision?.guidanceIds, agentIndex, known }),
    ...(receipt && !suppressSourceWarning ? { sourceReceipt: receipt } : {}),
    ...(diagnostic
      ? { fullDecision: decision, diagnosticMessages: structuredClone(diagnosticMessages) }
      : {}),
  };
  return validateExplanationEnvelope(envelope, { diagnostic });
}

export const GUIDANCE_SOURCE_RECEIPT_PREFIX = SOURCE_PREFIX;
