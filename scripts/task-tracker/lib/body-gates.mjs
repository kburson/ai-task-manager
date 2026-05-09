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
    mustComeBefore: /<!--\s*ai-task-manager:fields:start\s*-->/i,
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
