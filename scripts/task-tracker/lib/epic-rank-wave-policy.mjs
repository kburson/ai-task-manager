// @story #1872
// Pure admission consumes verified authority observations; execution collects
// those observations again under the clone-wide parent admission lock.
import { createHash } from 'node:crypto';
import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { normalizeStateId } from './lifecycle-policy/index.mjs';

const ACTIVE = new Set(['plan', 'develop', 'test', 'review']);
const STATES = new Set(['backlog', 'refine', 'ready-for-plan', ...ACTIVE, 'done']);
const HASH = /^[a-f0-9]{64}$/;
export function rankWaveDigest(value) {
  return createHash('sha256').update(canonicalRecordJson(value)).digest('hex');
}

export function freezeRankGraph(children) {
  if (!Array.isArray(children) || !children.length) throw new Error('graph unreadable');
  const seen = new Set();
  return children
    .map((child) => {
      const number = child?.number;
      const rank = child?.rank;
      if (
        !Number.isSafeInteger(number) ||
        number <= 0 ||
        seen.has(number) ||
        typeof rank !== 'number' ||
        !Number.isFinite(rank) ||
        rank < 0 ||
        !Array.isArray(child.blockedBy) ||
        !HASH.test(child.refinementDigest ?? '')
      ) {
        throw new Error('graph identity incomplete or duplicated');
      }
      seen.add(number);
      const blockers = child.blockedBy;
      if (
        blockers.some((n) => !Number.isSafeInteger(n) || n <= 0 || n === number) ||
        new Set(blockers).size !== blockers.length
      )
        throw new Error('dependencies unreadable');
      return {
        number,
        rank,
        blockedBy: [...blockers].sort((a, b) => a - b),
        refinementDigest: child.refinementDigest,
      };
    })
    .sort((a, b) => a.number - b.number);
}

export function isStrictCompletedDone(child) {
  return (
    !child?.childEvidenceError &&
    normalizeStateId(child?.boardState) === 'done' &&
    String(child?.issueState).toLowerCase() === 'closed' &&
    String(child?.closeReason).toLowerCase() === 'completed' &&
    (child.recoveryPhase === null || child.recoveryPhase === 'complete')
  );
}

function refuse(code, children = [], detail = '') {
  const blockingChildren = [...new Set(children.map((c) => c.number))].sort((a, b) => a - b);
  return {
    ok: false,
    code: `rank-wave-${code}`,
    blockingChildren,
    advancing: blockingChildren,
    reason: `rank-wave-${code}${detail ? `: ${detail}` : ''}`,
    blockers: [
      `rank-wave-${code}${blockingChildren.length ? `: ${blockingChildren.map((n) => `#${n}`).join(', ')}` : ''}`,
    ],
    remediation:
      'Re-read current wave authority and repair the named obligation through its registered action.',
  };
}

export function evaluateRankWaveAdmission({ promotingNumber, children, rankWave } = {}) {
  if (!rankWave || rankWave.execution !== 'rank-level') return refuse('authority-invalid');
  if (!['ready', 'ungranted'].includes(rankWave.status))
    return refuse(rankWave.status || 'authority-unreadable');
  let graph;
  try {
    graph = freezeRankGraph(children);
  } catch (error) {
    return refuse('graph-unreadable', [], error.message);
  }
  if (rankWaveDigest(graph) !== rankWaveDigest(rankWave.graph ?? null))
    return refuse('graph-stale');
  const target = children.find((c) => c.number === Number(promotingNumber));
  if (!target) return refuse('target-missing');
  const lower = children.filter((c) => c.rank < target.rank && !isStrictCompletedDone(c));
  if (lower.length) return refuse('lower-not-done', lower);
  if (
    children.some(
      (c) =>
        c.childEvidenceError ||
        !STATES.has(normalizeStateId(c.boardState)) ||
        !['open', 'closed'].includes(String(c.issueState).toLowerCase()) ||
        !Object.hasOwn(c, 'recoveryPhase')
    )
  )
    return refuse('observations-unreadable');
  if (target.hasCurrentRefinement !== true || target.dependencyReadiness !== 'ready') {
    return refuse('target-not-ready', [target]);
  }
  const active = children.filter(
    (c) => c.number !== target.number && ACTIVE.has(normalizeStateId(c.boardState))
  );
  const otherRank = active.filter((c) => c.rank !== target.rank);
  if (otherRank.length) return refuse('other-rank-active', otherRank);
  if (rankWave.status === 'ungranted') {
    if (active.length) return refuse('sequential-budget', active);
  } else {
    const expected = graph.filter((c) => c.rank === target.rank).map((c) => c.number);
    if (
      rankWave.rank !== target.rank ||
      !Array.isArray(rankWave.members) ||
      canonicalRecordJson([...rankWave.members].sort((a, b) => a - b)) !==
        canonicalRecordJson(expected)
    ) {
      return refuse('membership-mismatch');
    }
    if (rankWave.bindings?.ok !== true) return refuse('bindings-invalid');
  }
  return {
    ok: true,
    code: 'rank-wave-ready',
    reason: 'rank-wave-ready',
    blockers: [],
    blockingChildren: [],
    advancing: [],
  };
}

export function selectRankWaveCandidate(children, rankWave) {
  const candidates = children
    .filter((c) => normalizeStateId(c.boardState) === 'ready-for-plan')
    .sort((a, b) => a.rank - b.rank || a.number - b.number);
  let refusal = null;
  for (const candidate of candidates) {
    const decision = evaluateRankWaveAdmission({
      promotingNumber: candidate.number,
      children,
      rankWave,
    });
    if (decision.ok) return { child: candidate, decision };
    refusal ??= decision;
  }
  return { child: null, decision: refusal ?? refuse('no-candidate') };
}
