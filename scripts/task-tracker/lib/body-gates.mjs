// Structural gates for issue bodies: refuses state moves when an
// "evidence-required" checkbox is ticked without supporting body content.
//
// Pure function. No I/O. Caller is responsible for fetching the body and
// acting on the refusal (exit code, audit comment, etc.).
//
// validateBody(body, { gates }) → { ok: true } | { ok: false, refusedRules: [{ rule, reason }] }

import { LIFECYCLE_LABEL_SET } from './lifecycle-dod.mjs';
import { resolveContractSource } from './github-records/contract-source.mjs';
import { parseIssueFieldDb } from '../issue-field-db.mjs';

// #325 — size-bucketed floors for the `deep-dive-complete` rule. Calibrated
// to match real prose density: XS helpers (1hr) produce ~1416 chars (#324
// observed); S sub-issues ~1800-2200; M/L/XL epics 2400+.
export const DEEP_DIVE_SIZE_FLOORS = { XS: 1200, S: 1800, M: 2400, L: 2400, XL: 2400 };
const DEEP_DIVE_DEFAULT_FLOOR = 2000;

function pickSizeFloor(body, floors) {
  try {
    const parsed = parseIssueFieldDb(body);
    const size = parsed?.values?.size;
    if (size && floors[size] != null) return floors[size];
  } catch {
    /* fall through */
  }
  return DEEP_DIVE_DEFAULT_FLOOR;
}

const SECTION_RULE = 'section';
const ALL_CHECKED_RULE = 'all-checked-under';
const PLACEMENT_RULE = 'placement';

export const DEFAULT_GATES = [
  {
    name: 'deep-dive-placement',
    kind: PLACEMENT_RULE,
    trigger: /^##\s+Deep[- ]Dive Analysis\b/im,
    mustComeAfter: /^##\s+Pickup Directive\b/im,
    mustComeBefore: /^[ \t]*<!--\s*(?:ai-task-manager:fields:start|aitm-fields:)\s*/im,
  },
  {
    // #325 — migrated from `minNonEmptyLines: 20` (eyeballed, no calibration)
    // to `minSectionChars: 2000` (empirical floor of 2339 across 15 closed
    // sub-issues of #259). HTML comments are excluded from the measurement.
    name: 'deep-dive-complete',
    kind: SECTION_RULE,
    // Widened (#375) to trigger on both legacy colon and new `ts="..."` forms.
    trigger: /<!--\s*aitm-deep-dive-complete(?::\s*[^>]+|\s+ts="[^"]*")\s*-->/i,
    requireSection: /^##\s+Deep[- ]Dive Analysis\b/im,
    // Size-bucketed floors: XS=1200, S=1800, M/L/XL=2400. Fallback 2000 when
    // size is absent. Set via `sizeFloors` so the rule object stays declarative.
    sizeFloors: DEEP_DIVE_SIZE_FLOORS,
  },
  {
    name: 'dependency-map',
    kind: SECTION_RULE,
    trigger: /^- \[x\] (?:\*\*)?Dependency Map\b/im,
    requireSection: /^##\s+Dependency Map\b/im,
    minNonEmptyLines: 1,
  },
  {
    name: 'verification-commands',
    kind: ALL_CHECKED_RULE,
    heading: /^#{2,3}\s+Verification Commands\b/im,
  },
];

function findHeadingIndex(lines, headingRe) {
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i])) return i;
  }
  return -1;
}

function nextSectionEnd(lines, fromIdx) {
  for (let i = fromIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) return i;
  }
  return lines.length;
}

const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

function evaluateSectionRule(body, lines, rule) {
  if (!rule.trigger.test(body)) return null; // gate doesn't fire
  const headingIdx = findHeadingIndex(lines, rule.requireSection);
  if (headingIdx === -1) {
    return {
      rule: rule.name,
      reason: `ticked but no section matching ${rule.requireSection} found`,
    };
  }
  const end = nextSectionEnd(lines, headingIdx);
  // #325 — chars-based threshold (HTML comments stripped) preferred over
  // line-count when `minSectionChars` is configured. Line-count retained
  // for `dependency-map` and other small-section rules.
  if (rule.minSectionChars != null || rule.sizeFloors != null) {
    const sectionText = lines.slice(headingIdx + 1, end).join('\n');
    const chars = sectionText.replace(HTML_COMMENT_RE, '').trim().length;
    const floor =
      rule.sizeFloors != null ? pickSizeFloor(body, rule.sizeFloors) : rule.minSectionChars;
    if (chars < floor) {
      return {
        rule: rule.name,
        reason: `section has ${chars} char(s) of substantive content; minimum ${floor}`,
      };
    }
    return null;
  }
  const nonEmpty = lines.slice(headingIdx + 1, end).filter((l) => l.trim().length > 0).length;
  if (nonEmpty < rule.minNonEmptyLines) {
    return {
      rule: rule.name,
      reason: `section has ${nonEmpty} non-empty line(s); minimum ${rule.minNonEmptyLines}`,
    };
  }
  return null;
}

function evaluateAllCheckedRule(lines, rule, normalizedItems = null) {
  const unchecked = [];
  if (normalizedItems !== null) {
    for (const item of normalizedItems) {
      if (!item.checked) unchecked.push(item.command);
    }
  } else {
    const headingIdx = findHeadingIndex(lines, rule.heading);
    if (headingIdx === -1) return null; // vacuous pass
    const end = nextSectionEnd(lines, headingIdx);
    for (let i = headingIdx + 1; i < end; i++) {
      const m = lines[i].match(/^- \[([ x])\]\s+(.+)$/);
      if (m && m[1] === ' ') {
        const label = m[2].trim();
        // Lifecycle labels under `#### Lifecycle` (a `####` sibling of Verification
        // Commands' `###` heading) fall inside this scope because `nextSectionEnd`
        // stops only at `##`. They are owned by close — enforced by
        // `assertLifecycleSatisfied` in close-gate.mjs — not by the user, so skip.
        if (LIFECYCLE_LABEL_SET.has(label)) continue;
        unchecked.push(label);
      }
    }
  }
  if (unchecked.length > 0) {
    return {
      rule: rule.name,
      reason: `${unchecked.length} unchecked item(s) under heading: ${unchecked.slice(0, 3).join('; ')}${unchecked.length > 3 ? '; …' : ''}`,
    };
  }
  return null;
}

function evaluatePlacementRule(body, lines, rule) {
  const triggerIdx = findHeadingIndex(lines, rule.trigger);
  if (triggerIdx === -1) return null; // vacuous: rule only fires when trigger heading is present
  const afterIdx = findHeadingIndex(lines, rule.mustComeAfter);
  if (afterIdx === -1) {
    return {
      rule: rule.name,
      reason: `trigger heading present but anchor heading matching ${rule.mustComeAfter} is missing`,
    };
  }
  if (triggerIdx <= afterIdx) {
    return {
      rule: rule.name,
      reason: `trigger heading at line ${triggerIdx + 1} must appear AFTER anchor heading at line ${afterIdx + 1}`,
    };
  }
  const beforeMatch = body.match(rule.mustComeBefore);
  if (!beforeMatch) {
    return {
      rule: rule.name,
      reason: `trigger heading present but boundary marker matching ${rule.mustComeBefore} is missing`,
    };
  }
  const beforeOffset = beforeMatch.index;
  let triggerOffset = 0;
  for (let i = 0; i < triggerIdx; i++) triggerOffset += lines[i].length + 1;
  if (triggerOffset >= beforeOffset) {
    return {
      rule: rule.name,
      reason: `trigger heading must appear BEFORE boundary marker ${rule.mustComeBefore}`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Plan-gate predicates (Refine → Plan transition).
//
// These three "gate kinds" — `field-required`, `wave-admission`,
// `cascade-grooming` — fire only when the target state is `plan`.
// `body-section-required` is a fourth helper that covers the AC's "required
// body sections" check (rough AC, DoD, Pickup Directive, fields-block marker).
// They are exported as discrete predicates so the `plan` verb can compose
// them and return one blocker line per refusal.
//
// Each predicate returns either `null` (pass) or
// `{ kind, message }` (refusal).
// ---------------------------------------------------------------------------

const REQUIRED_FIELD_KEYS = ['estimate', 'size', 'priority'];

export function checkRequiredFields(fieldValues = {}, labels = []) {
  const missing = [];
  for (const key of REQUIRED_FIELD_KEYS) {
    const v = fieldValues[key];
    if (v === null || v === undefined || v === '') missing.push(key);
  }
  if (!Array.isArray(labels) || labels.length === 0) missing.push('labels');
  if (missing.length === 0) return [];
  return missing.map((name) => ({
    kind: 'field-required',
    message: `field-required: ${name} is empty`,
  }));
}

const REQUIRED_BODY_SECTIONS = [
  { name: 'Acceptance Criteria', re: /^##\s+Acceptance Criteria\b/im },
  { name: 'Definition of Done', re: /^#{2,3}\s+Definition of Done\b/im },
  { name: 'Pickup Directive', re: /^##\s+Pickup Directive\b/im },
  { name: 'fields-block marker', re: /<!--\s*(?:ai-task-manager:fields:start|aitm-fields:)\s*/i },
];

export function checkRequiredBodySections(body = '') {
  const refusals = [];
  for (const sec of REQUIRED_BODY_SECTIONS) {
    if (!sec.re.test(body)) {
      refusals.push({
        kind: 'body-section-required',
        message: `body-section-required: missing "${sec.name}"`,
      });
    }
  }
  return refusals;
}

// `waveAdmission` and `cascadeGrooming` are async. The `plan` verb composes
// them with the sync predicates above and emits one stderr line per blocker.

// Parent-admission gate. Refuses a sub-issue state advance past `Refine` when
// the parent epic's live Status is not yet `Develop` or beyond. Refuse-only
// — never auto-moves the parent.
//
// `readParentStatus({ parentEpicNumber, repo, projectId })` must return the
// parent's lowercase state slug (one of `STATES`), or `null` when the parent
// is not on the configured project board.
//
// Solo issues (`parentEpicNumber == null`) bypass the gate without invoking
// the reader.

import { normalizeStateId, stateIds } from './lifecycle-policy/index.mjs';

const DEFAULT_PARENT_ADMIT_STATE = 'develop';

// #162 — child sub-issue cannot lead parent epic in state.
// #176 — split entry-guard from arc-guard.
// Wave-admission tightening: a child may sit in Refine alongside the parent,
// but must wait for the epic to enter Develop before advancing to Plan or
// beyond. Without this, parent and children can be promoted to Plan together,
// which then deadlocks the epic's plan→develop epic-children-at-refine gate
// (every child would need to be reverted, which the 8-state machine
// disallows).
//
// Rule:
//   - target = refine: parent ≥ refine. Children get groomed alongside the epic.
//   - target ∈ {plan, develop, test, review, done}: parent ≥ develop. A child
//     cannot enter Plan until the epic has cleared its own Plan stage.
//
// Solo issues (`parentEpicNumber == null`) bypass.
//
// No env override exists.
const ADMIT_FLOOR_STATE = 'develop';
const ADMIT_FLOOR_IDX = stateIds().indexOf(ADMIT_FLOOR_STATE);
const REFINE_IDX = stateIds().indexOf('refine');

export async function checkParentAdmission({
  parentEpicNumber,
  repo,
  projectId,
  readParentStatus,
  targetState = DEFAULT_PARENT_ADMIT_STATE,
}) {
  if (parentEpicNumber == null) return [];
  const targetIdx = stateIds().indexOf(targetState);
  if (targetIdx < 0) {
    throw new Error(`checkParentAdmission: unknown targetState "${targetState}"`);
  }
  // Wave-admission floor: target=refine matches Refine; everything else
  // requires the parent to have entered Develop. `targetIdx` retained for the
  // unknown-target validation above.
  void targetIdx;
  const requiredIdx = targetState === 'refine' ? REFINE_IDX : ADMIT_FLOOR_IDX;
  const requiredState = stateIds()[requiredIdx];
  const raw = await readParentStatus({ parentEpicNumber, repo, projectId });
  const state = normalizeStateId(raw);
  if (state == null) {
    return [
      {
        kind: 'parent-admission',
        message: `parent-admission: parent #${parentEpicNumber} has no Status on the configured project (unknown); advance the epic to ${requiredState[0].toUpperCase() + requiredState.slice(1)} first`,
      },
    ];
  }
  const idx = stateIds().indexOf(state);
  if (idx >= 0 && idx >= requiredIdx) return [];
  return [
    {
      kind: 'parent-admission',
      message: `parent-admission: parent #${parentEpicNumber} is in ${state}; advance the epic to ${requiredState[0].toUpperCase() + requiredState.slice(1)} first (child cannot lead parent)`,
    },
  ];
}

export async function checkWaveAdmission({ parentEpicNumber, rank, repo, projectId, admit }) {
  // Solo bypass: no parent epic.
  if (parentEpicNumber == null) return [];
  const result = await admit({ parentEpicNumber, rank, repo, projectId });
  if (result.ok) return [];
  return result.blockers.map((b) => ({
    kind: 'wave-admission',
    message: `wave-admission: sibling #${b.issue} (rank ${b.rank}, state ${b.state}) blocks lower-Rank wait`,
  }));
}

// Derive the refined-or-beyond floor from lifecycle authority. This includes
// the durable Ready for Planning parking state and cannot drift on a rename.
const CASCADE_OK_STATES = new Set(stateIds().slice(REFINE_IDX));

export async function checkCascadeGrooming({
  isEpic,
  epicNumber,
  repo,
  projectId,
  fetchSubIssueStates,
}) {
  // Non-epic bypass.
  if (!isEpic) return [];
  if (typeof fetchSubIssueStates !== 'function') {
    return [
      {
        kind: 'cascade-grooming',
        message: 'cascade-grooming: no sub-issue fetcher configured',
      },
    ];
  }
  const subs = await fetchSubIssueStates({ epicNumber, repo, projectId });
  const refusals = [];
  for (const s of subs || []) {
    const state = String(s.state || '').toLowerCase();
    if (!CASCADE_OK_STATES.has(state)) {
      refusals.push({
        kind: 'cascade-grooming',
        message: `cascade-grooming: sub-issue #${s.number} is in ${state || 'unknown'} (must be Refine or beyond)`,
      });
    }
  }
  return refusals;
}

export function validateBody(body, { gates = DEFAULT_GATES, contractSource = null } = {}) {
  if ((typeof body !== 'string' || body.length === 0) && contractSource === null) {
    return { ok: true };
  }
  const sourceBody = typeof body === 'string' ? body : '';
  const lines = sourceBody.split('\n');
  const verificationCommands = contractSource?.contract?.verificationCommands ?? null;
  const refused = [];
  for (const rule of gates) {
    let r = null;
    if (rule.kind === SECTION_RULE) r = evaluateSectionRule(sourceBody, lines, rule);
    else if (rule.kind === ALL_CHECKED_RULE) {
      r = evaluateAllCheckedRule(
        lines,
        rule,
        rule.name === 'verification-commands' ? verificationCommands : null
      );
    } else if (rule.kind === PLACEMENT_RULE) r = evaluatePlacementRule(sourceBody, lines, rule);
    if (r) refused.push(r);
  }
  return refused.length === 0 ? { ok: true } : { ok: false, refusedRules: refused };
}

export async function validateBodyWithContractSource({
  repository,
  issue,
  issueBody,
  graphql,
  readContractRecord,
  gates = DEFAULT_GATES,
  deps = {},
} = {}) {
  const resolve = deps.resolveContractSource || resolveContractSource;
  try {
    const contractSource = await resolve({
      repository,
      issue,
      issueBody,
      graphql,
      readContractRecord,
    });
    return validateBody(issueBody, { gates, contractSource });
  } catch (error) {
    return {
      ok: false,
      refusedRules: [
        {
          rule: 'verification-commands',
          reason: `contract-source-failed: ${error.message}`,
        },
      ],
    };
  }
}
