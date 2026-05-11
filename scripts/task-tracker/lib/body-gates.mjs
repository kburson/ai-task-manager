// Structural gates for issue bodies: refuses state moves when an
// "evidence-required" checkbox is ticked without supporting body content.
//
// Pure function. No I/O. Caller is responsible for fetching the body and
// acting on the refusal (exit code, audit comment, etc.).
//
// validateBody(body, { gates }) → { ok: true } | { ok: false, refusedRules: [{ rule, reason }] }

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
    name: 'deep-dive-complete',
    kind: SECTION_RULE,
    trigger: /^- \[x\] Deep dive complete\b/im,
    requireSection: /^##\s+Deep[- ]Dive Analysis\b/im,
    minNonEmptyLines: 20,
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

function evaluateSectionRule(body, lines, rule) {
  if (!rule.trigger.test(body)) return null; // gate doesn't fire
  const headingIdx = findHeadingIndex(lines, rule.requireSection);
  if (headingIdx === -1) {
    return { rule: rule.name, reason: `ticked but no section matching ${rule.requireSection} found` };
  }
  const end = nextSectionEnd(lines, headingIdx);
  const nonEmpty = lines.slice(headingIdx + 1, end).filter(l => l.trim().length > 0).length;
  if (nonEmpty < rule.minNonEmptyLines) {
    return { rule: rule.name, reason: `section has ${nonEmpty} non-empty line(s); minimum ${rule.minNonEmptyLines}` };
  }
  return null;
}

function evaluateAllCheckedRule(lines, rule) {
  const headingIdx = findHeadingIndex(lines, rule.heading);
  if (headingIdx === -1) return null; // vacuous pass
  const end = nextSectionEnd(lines, headingIdx);
  const unchecked = [];
  for (let i = headingIdx + 1; i < end; i++) {
    const m = lines[i].match(/^- \[([ x])\]\s+(.+)$/);
    if (m && m[1] === ' ') unchecked.push(m[2].trim());
  }
  if (unchecked.length > 0) {
    return { rule: rule.name, reason: `${unchecked.length} unchecked item(s) under heading: ${unchecked.slice(0, 3).join('; ')}${unchecked.length > 3 ? '; …' : ''}` };
  }
  return null;
}

function evaluatePlacementRule(body, lines, rule) {
  const triggerIdx = findHeadingIndex(lines, rule.trigger);
  if (triggerIdx === -1) return null; // vacuous: rule only fires when trigger heading is present
  const afterIdx = findHeadingIndex(lines, rule.mustComeAfter);
  if (afterIdx === -1) {
    return { rule: rule.name, reason: `trigger heading present but anchor heading matching ${rule.mustComeAfter} is missing` };
  }
  if (triggerIdx <= afterIdx) {
    return { rule: rule.name, reason: `trigger heading at line ${triggerIdx + 1} must appear AFTER anchor heading at line ${afterIdx + 1}` };
  }
  const beforeMatch = body.match(rule.mustComeBefore);
  if (!beforeMatch) {
    return { rule: rule.name, reason: `trigger heading present but boundary marker matching ${rule.mustComeBefore} is missing` };
  }
  const beforeOffset = beforeMatch.index;
  let triggerOffset = 0;
  for (let i = 0; i < triggerIdx; i++) triggerOffset += lines[i].length + 1;
  if (triggerOffset >= beforeOffset) {
    return { rule: rule.name, reason: `trigger heading must appear BEFORE boundary marker ${rule.mustComeBefore}` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Analyze-gate predicates (Grooming → Analysis transition).
//
// These three "gate kinds" — `field-required`, `wave-admission`,
// `cascade-grooming` — fire only when the target state is `analyze`.
// `body-section-required` is a fourth helper that covers the AC's "required
// body sections" check (rough AC, DoD, Pickup Directive, fields-block marker).
// They are exported as discrete predicates so the `analyze` verb can compose
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
  return missing.map(name => ({
    kind: 'field-required',
    message: `field-required: ${name} is empty`,
  }));
}

const REQUIRED_BODY_SECTIONS = [
  { name: 'Acceptance Criteria',  re: /^##\s+Acceptance Criteria\b/im },
  { name: 'Definition of Done',   re: /^#{2,3}\s+Definition of Done\b/im },
  { name: 'Pickup Directive',     re: /^##\s+Pickup Directive\b/im },
  { name: 'fields-block marker',  re: /<!--\s*(?:ai-task-manager:fields:start|aitm-fields:)\s*/i },
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

// `waveAdmission` and `cascadeGrooming` are async. The `analyze` verb composes
// them with the sync predicates above and emits one stderr line per blocker.

export async function checkWaveAdmission({ parentEpicNumber, sequence, repo, projectId, admit }) {
  // Solo bypass: no parent epic.
  if (parentEpicNumber == null) return [];
  const result = await admit({ parentEpicNumber, sequence, repo, projectId });
  if (result.ok) return [];
  return result.blockers.map(b => ({
    kind: 'wave-admission',
    message: `wave-admission: sibling #${b.issue} (sequence ${b.sequence}, state ${b.state}) blocks lower-Sequence wait`,
  }));
}

const CASCADE_OK_STATES = new Set([
  'groom', 'analyze', 'development', 'validate', 'review', 'done',
]);

export async function checkCascadeGrooming({ isEpic, epicNumber, repo, projectId, fetchSubIssueStates }) {
  // Non-epic bypass.
  if (!isEpic) return [];
  if (typeof fetchSubIssueStates !== 'function') {
    return [{
      kind: 'cascade-grooming',
      message: 'cascade-grooming: no sub-issue fetcher configured',
    }];
  }
  const subs = await fetchSubIssueStates({ epicNumber, repo, projectId });
  const refusals = [];
  for (const s of subs || []) {
    const state = String(s.state || '').toLowerCase();
    if (!CASCADE_OK_STATES.has(state)) {
      refusals.push({
        kind: 'cascade-grooming',
        message: `cascade-grooming: sub-issue #${s.number} is in ${state || 'unknown'} (must be Grooming or beyond)`,
      });
    }
  }
  return refusals;
}

export function validateBody(body, { gates = DEFAULT_GATES } = {}) {
  if (typeof body !== 'string' || body.length === 0) return { ok: true };
  const lines = body.split('\n');
  const refused = [];
  for (const rule of gates) {
    let r = null;
    if (rule.kind === SECTION_RULE) r = evaluateSectionRule(body, lines, rule);
    else if (rule.kind === ALL_CHECKED_RULE) r = evaluateAllCheckedRule(lines, rule);
    else if (rule.kind === PLACEMENT_RULE) r = evaluatePlacementRule(body, lines, rule);
    if (r) refused.push(r);
  }
  return refused.length === 0 ? { ok: true } : { ok: false, refusedRules: refused };
}
