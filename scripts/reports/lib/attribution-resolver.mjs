// #782 — shared three-signal attribution resolver for the value/activity report
// and the `heal-backlog-attribution` maintenance script.
//
// Background: `generate-value-report.mjs` historically attributed an issue's
// delivered work only through the trunk commit-subject `[#N]` token. That token
// became mandatory recently, so 93 of 733 closed issues carry no token in any
// trunk commit subject and are invisible to the report even though most shipped
// real code. The audit in `output/closed-issues-healing-analysis.md` showed the
// fix is read-side: attribution must union THREE durable signals rather than the
// single subject-token signal.
//
// This module is pure and side-effect-free. All git/gh I/O lives in the callers
// (`heal-backlog-attribution.mjs`, `generate-value-report.mjs`); the resolver
// consumes already-materialized maps so it is trivially fixture-testable.

import { ISSUE_ID_GLOBAL_RE } from '../../task-tracker/lib/commit-attribution-format.mjs';
import { parseMarker } from '../../task-tracker/lib/commit-trail.mjs';
import { parseSupersededBy } from '../../task-tracker/lib/superseded-marker.mjs';
import { hasDeliverableMarker } from '../../task-tracker/lib/issue-kind.mjs';

// Field separator for `git log --format='%H<US>%s'`. ASCII Unit Separator never
// appears in a SHA or a commit subject, so it splits cleanly.
export const LOG_FIELD_SEP = '\x1f';

// Normalize an issue-number input (`782`, `'782'`, `'#782'`) to its digit string.
function normId(issueNumber) {
  return String(issueNumber ?? '')
    .trim()
    .replace(/^#/, '');
}

// Parse `git log <trunk> --format='%H<US>%s'` output into a
// `Map<issueNumberString, sha[]>` keyed by every `[#N]` token found in each
// subject. A commit may attribute to several issues (contiguous leading run).
export function buildTrunkTokenMap(logText) {
  const map = new Map();
  for (const line of String(logText || '').split('\n')) {
    if (!line) continue;
    const sep = line.indexOf(LOG_FIELD_SEP);
    if (sep === -1) continue;
    const sha = line.slice(0, sep).trim();
    const subject = line.slice(sep + 1);
    if (!sha) continue;
    for (const m of subject.matchAll(ISSUE_ID_GLOBAL_RE)) {
      const id = m[1];
      if (!map.has(id)) map.set(id, []);
      const arr = map.get(id);
      if (!arr.includes(sha)) arr.push(sha);
    }
  }
  return map;
}

// Parse whitespace-separated full trunk SHAs (`git log <trunk> --format=%H`)
// into a Set.
export function buildTrunkShaSet(shaText) {
  const set = new Set();
  for (const tok of String(shaText || '').split(/\s+/)) {
    const s = tok.trim();
    if (s) set.add(s);
  }
  return set;
}

// True when `sha` names a commit on trunk. Exact match first; falls back to a
// prefix comparison so a recorded short SHA still matches a full trunk SHA (and
// vice-versa).
export function shaOnTrunk(trunkShas, sha) {
  if (!sha || !trunkShas) return false;
  if (trunkShas.has(sha)) return true;
  for (const t of trunkShas) {
    if (t.startsWith(sha) || sha.startsWith(t)) return true;
  }
  return false;
}

// Union the three attribution signals for a single issue, in precedence order:
//   1. trunk commit-log `[#N]` token  → source 'token'
//   2. `aitm-commits` marker SHAs that are present on trunk → source 'commits'
//   3. `aitm-deliverable-posted` marker → source 'deliverable'
// Returns `{ attributed, shas, source }`; `{ attributed:false, shas:[], source:null }`
// when no signal fires.
export function resolveAttribution({ issueNumber, body = '', trunkTokens, trunkShas } = {}) {
  const id = normId(issueNumber);

  if (trunkTokens && id && trunkTokens.has(id)) {
    return { attributed: true, shas: [...trunkTokens.get(id)], source: 'token' };
  }

  const marker = parseMarker(body);
  if (marker.shas.size > 0 && trunkShas) {
    const onTrunk = [...marker.shas].filter((s) => shaOnTrunk(trunkShas, s));
    if (onTrunk.length > 0) {
      return { attributed: true, shas: onTrunk, source: 'commits' };
    }
  }

  if (hasDeliverableMarker(body)) {
    return { attributed: true, shas: [], source: 'deliverable' };
  }

  return { attributed: false, shas: [], source: null };
}

// Dead = GitHub `stateReason` NOT_PLANNED/DUPLICATE, or an `aitm-superseded-by`
// marker in the body. Dead issues are reported and excluded, never mutated.
export function isDead({ stateReason, body = '' } = {}) {
  const reason = String(stateReason || '').toUpperCase();
  if (reason === 'NOT_PLANNED' || reason === 'DUPLICATE') return true;
  if (parseSupersededBy(body)) return true;
  return false;
}

// Full closed-backlog classification for one issue. Precedence: DEAD wins over
// any attribution signal (a superseded/not-planned issue is excluded even if it
// once carried commits). Then attribution: token/commits → HEALABLE,
// deliverable → DELIVERABLE. An un-attributed, non-dead issue whose body still
// carries `aitm-commits` SHAs that are all absent from trunk → COMMITS_OFFTRUNK
// (a re-trace candidate). Otherwise UNKNOWN.
export function classifyIssue({ issueNumber, body = '', stateReason, trunkTokens, trunkShas } = {}) {
  if (isDead({ stateReason, body })) {
    return { klass: 'DEAD', shas: [], source: 'dead' };
  }

  const res = resolveAttribution({ issueNumber, body, trunkTokens, trunkShas });
  if (res.attributed) {
    if (res.source === 'deliverable') {
      return { klass: 'DELIVERABLE', shas: [], source: 'deliverable' };
    }
    return { klass: 'HEALABLE', shas: res.shas, source: res.source };
  }

  const marker = parseMarker(body);
  if (marker.shas.size > 0) {
    return { klass: 'COMMITS_OFFTRUNK', shas: [...marker.shas], source: 'offtrunk' };
  }

  return { klass: 'UNKNOWN', shas: [], source: null };
}

// The value/activity report's consume-point. Given a report item (carrying
// `number`, `body`, and `stateReason`) plus the trunk signal maps, returns the
// admit/drop decision the report applies on top of its board-data and
// date/state filters: admit an issue that is `attributed` even when it lacks
// board data fields, and drop one that is `dead`. Keeping this in one exported
// function means `generate-value-report.mjs` and its tests share the exact rule.
export function reportAttribution(item = {}, { trunkTokens, trunkShas } = {}) {
  const dead = isDead({ stateReason: item.stateReason, body: item.body });
  const res = resolveAttribution({
    issueNumber: item.number,
    body: item.body ?? '',
    trunkTokens,
    trunkShas,
  });
  return { attributed: res.attributed, dead, source: res.source, shas: res.shas };
}

// Re-trace one orphaned SHA (recorded in an `aitm-commits` marker but absent
// from trunk) to its current trunk commit. Primary match by patch-id, fallback
// to exact subject match. A patch-id/subject that maps to more than one trunk
// commit is reported `ambiguous` and left unmapped rather than guessed.
//
// Pure: the caller supplies the orphan's `oldPatchId`/`oldSubject` and the trunk
// indices (`trunkByPatchId`, `trunkBySubject` — each `Map<key, sha[]>`).
export function retraceSha(sha, { oldPatchId, oldSubject, trunkByPatchId, trunkBySubject } = {}) {
  if (oldPatchId && trunkByPatchId && trunkByPatchId.has(oldPatchId)) {
    const cands = trunkByPatchId.get(oldPatchId);
    if (cands.length === 1) return { sha, mapped: cands[0], method: 'patch-id', ambiguous: false };
    return { sha, mapped: null, method: 'patch-id', ambiguous: true };
  }
  if (oldSubject && trunkBySubject && trunkBySubject.has(oldSubject)) {
    const cands = trunkBySubject.get(oldSubject);
    if (cands.length === 1) return { sha, mapped: cands[0], method: 'subject', ambiguous: false };
    return { sha, mapped: null, method: 'subject', ambiguous: true };
  }
  return { sha, mapped: null, method: null, ambiguous: false };
}
