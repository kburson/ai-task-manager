// Pure story contracts. Callers own all GitHub and filesystem observations.
import { createHash } from 'node:crypto';
import { markdownViews } from './plan-markdown-views.mjs';
import { parseMetadataField } from './metadata-section.mjs';

const hash = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const bounded = (value) => String(value).slice(0, 240);
const violation = (code, line, message) => ({ code, line, message: bounded(message) });
const storyLines = (value) =>
  String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('<!--'));
const normalizedPhrase = (value) =>
  String(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?;:,]+$/, '');

// #503 intentionally scans raw source, including headings inside examples.
export function firstH2Heading(body) {
  const match = String(body ?? '').match(/^## (.+?)\s*$/m);
  return match ? match[1].trim() : null;
}

function validateOptions(options) {
  if (
    !options ||
    !['draft', 'approval'].includes(options.mode) ||
    typeof options.canonicalTemplate !== 'string' ||
    !options.canonicalTemplate.trim()
  ) {
    throw new TypeError('mode must be draft or approval and canonicalTemplate is required');
  }
}

export function evaluateStoryProse(prose, options) {
  validateOptions(options);
  const lines = storyLines(prose);
  const canonical = storyLines(options.canonicalTemplate);
  const kind =
    lines.length === 0
      ? 'empty'
      : lines.join('\n') === canonical.join('\n')
        ? 'template'
        : 'substantive';
  const violations = [];
  const add = (code, line, message) => {
    if (!violations.some((item) => item.code === code))
      violations.push(violation(code, line, message));
  };
  if (kind !== 'substantive') {
    if (options.mode === 'approval')
      add(
        'story-required-at-plan-approval',
        null,
        'Supply substantive User Story prose before Plan approval'
      );
    return { ok: violations.length === 0, kind, lines, violations };
  }
  const patterns = [/^As an? \S.*$/, /^I want to \S.*$/, /^So that \S.*$/];
  if (lines.length !== 3 || lines.some((line, index) => !patterns[index]?.test(line))) {
    add(
      'story-shape-invalid',
      null,
      'Use exactly three lines without bullets: As a/an, I want to, So that'
    );
  }
  const placeholders = options.canonicalTemplate.match(/\[[^\]\r\n]+\]/g) || [];
  const placeholderLine = lines.findIndex((line) =>
    placeholders.some((token) => line.includes(token))
  );
  if (placeholderLine !== -1)
    add('story-placeholder', placeholderLine + 1, 'Replace the remaining template placeholder');
  const actor = normalizedPhrase((lines[0] || '').replace(/^As an? /, ''));
  const capability = normalizedPhrase((lines[1] || '').replace(/^I want to /, ''));
  const value = normalizedPhrase((lines[2] || '').replace(/^So that /, ''));
  if (/^(?:(?:governed|delivery|implementation) )+agent$/.test(actor)) {
    add(
      'story-administrative-beneficiary',
      1,
      'Name the stakeholder receiving the benefit instead of the delivery agent'
    );
  }
  if (
    /^(?:deliver|execute|implement) (?:task|milestone) #?\d+(?:: .+)? from (?:the |a )?(?:pinned |source |implementation )*plan$/.test(
      capability
    )
  ) {
    add(
      'story-task-as-capability',
      2,
      'Describe the capability instead of executing a numbered plan task'
    );
  }
  const progress =
    /^(?:the )?(?:(?:parent )?(?:issue|epic|task)(?: #?\d+)?|parent)(?: advances| completes| is completed)(?: through (?:traceable execution|traceable implementation))?$/.test(
      value
    );
  if (progress)
    add(
      'story-workflow-progress-value',
      3,
      'Describe a stakeholder outcome instead of issue progress'
    );
  if (
    /^(?:traceable (?:execution|implementation)|(?:execution|implementation) is traceable)$/.test(
      value
    ) ||
    (progress && /through traceable (?:execution|implementation)$/.test(value))
  ) {
    add(
      'story-traceability-only-value',
      3,
      'Explain the concrete failure prevented by traceability'
    );
  }
  return { ok: violations.length === 0, kind, lines, violations };
}

export function evaluateStoryBody(body, options) {
  validateOptions(options);
  const source = String(body ?? '');
  const heading = /^## User Story\s*$/m.exec(source);
  if (!heading)
    return {
      ok: false,
      kind: 'empty',
      lines: [],
      violations: [violation('story-section-missing', null, 'Add the ## User Story section')],
    };
  const after = source.slice(heading.index + heading[0].length);
  const end = after.search(/^##\s/m);
  const result = evaluateStoryProse(end === -1 ? after : after.slice(0, end), options);
  if (firstH2Heading(source) !== 'User Story') {
    result.violations.unshift(
      violation(
        'story-section-position-invalid',
        source.slice(0, heading.index).split('\n').length,
        'Place ## User Story before every other raw level-two heading'
      )
    );
    result.ok = false;
  }
  return result;
}

export function storyDigest(lines) {
  return hash(storyLines(lines.join('\n')).join('\n'));
}

const INTENT_LABELS = {
  Beneficiary: 'beneficiary',
  Capability: 'capability',
  Need: 'need',
  'Value or failure prevented': 'value',
};
const INTENT_KEYS = Object.values(INTENT_LABELS);

function normalizedIntent(intent) {
  if (
    !intent ||
    typeof intent !== 'object' ||
    Object.keys(intent).length !== 4 ||
    INTENT_KEYS.some(
      (key) => typeof intent[key] !== 'string' || !intent[key].trim() || /[\r\n]/.test(intent[key])
    )
  ) {
    throw new TypeError(
      'Story Intent requires exactly four non-empty single-line string fields: beneficiary, capability, need, value'
    );
  }
  return Object.fromEntries(INTENT_KEYS.map((key) => [key, intent[key].trim()]));
}

export function intentDigest(intent) {
  return hash(JSON.stringify(normalizedIntent(intent)));
}

export function renderStoryFromIntent(intent) {
  const value = normalizedIntent(intent);
  return `As a ${value.beneficiary}\nI want to ${value.capability} because ${value.need}\nSo that ${value.value}`;
}

const headingAt = (line) => /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);

export function parseStoryIntent(markdown, { headingLevel = 2, startLine = 1, endLine } = {}) {
  const { originalLines, structuralLines, commandLines } = markdownViews(markdown);
  // A masked inline span still counts as a continuation. Remove comment bytes
  // only for this emptiness check; field values always come from originalLines.
  const contentLines = String(markdown)
    .replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => comment.replace(/[^\n]/g, ' '))
    .split('\n');
  const end = endLine ?? originalLines.length;
  const refuse = (code, line, message) => ({
    ok: false,
    intent: null,
    range: null,
    violations: [violation(code, line, message)],
  });
  if (
    ![2, 3, 4].includes(headingLevel) ||
    !Number.isInteger(startLine) ||
    !Number.isInteger(end) ||
    startLine < 1 ||
    end > originalLines.length ||
    end < startLine
  ) {
    return refuse('story-intent-invalid', null, 'Story Intent source bounds are invalid');
  }
  const found = [];
  for (let index = startLine - 1; index < end; index += 1) {
    const heading = headingAt(structuralLines[index]);
    if (heading?.[2] === 'Story Intent') found.push({ index, level: heading[1].length });
  }
  if (found.length === 0)
    return refuse(
      'story-intent-missing',
      startLine,
      `Source has no ${'#'.repeat(headingLevel)} Story Intent block`
    );
  if (found.length !== 1)
    return refuse(
      'story-intent-ambiguous',
      found[1].index + 1,
      'Source contains duplicate Story Intent blocks'
    );
  const { index, level } = found[0];
  if (level !== headingLevel)
    return refuse('story-intent-invalid', index + 1, 'Story Intent heading is at the wrong scope');
  let stop = index + 1;
  while (stop < end && !headingAt(structuralLines[stop])) stop += 1;
  if (stop < end && headingAt(structuralLines[stop])[1].length > level)
    return refuse('story-intent-invalid', stop + 1, 'Story Intent cannot contain nested headings');
  const intent = {};
  for (let cursor = index + 1; cursor < stop; cursor += 1) {
    const line = structuralLines[cursor];
    if (!line.trim() && !contentLines[cursor].trim()) continue;
    const field = /^[ \t]*-[ \t]+\*\*([^*]+):\*\*/.exec(line);
    if (!field)
      return refuse(
        'story-intent-invalid',
        cursor + 1,
        'Story Intent fields must be single-line labeled bullets; continuation lines are not permitted'
      );
    const key = Object.hasOwn(INTENT_LABELS, field[1]) ? INTENT_LABELS[field[1]] : null;
    if (!key || Object.hasOwn(intent, key))
      return refuse(
        'story-intent-invalid',
        cursor + 1,
        `Unknown or duplicate Story Intent field: ${field[1]}`
      );
    const value = originalLines[cursor].slice(field[0].length).trim();
    if (!value || !commandLines[cursor].slice(field[0].length).trim() || /[\r\n]/.test(value))
      return refuse(
        'story-intent-invalid',
        cursor + 1,
        `Story Intent field ${field[1]} must have a non-empty single-line value`
      );
    intent[key] = value;
  }
  if (INTENT_KEYS.some((key) => !Object.hasOwn(intent, key)))
    return refuse(
      'story-intent-invalid',
      index + 1,
      `Missing Story Intent field: ${INTENT_KEYS.filter((key) => !Object.hasOwn(intent, key)).join(', ')}`
    );
  return {
    ok: true,
    intent: normalizedIntent(intent),
    range: { start: index + 1, end: stop },
    violations: [],
  };
}

// Structural labels identify live metadata; values retain exact original bytes
// so copying a raw code-bearing heading cannot masquerade as an extractor key.
function planMetadata(body) {
  const { originalLines, structuralLines } = markdownViews(body);
  const fields = [];
  let inside = false;
  for (let index = 0; index < structuralLines.length; index += 1) {
    const heading = headingAt(structuralLines[index]);
    if (heading) {
      inside = heading[1] === '##' && heading[2] === 'Plan Metadata';
      continue;
    }
    if (!inside) continue;
    const visible = parseMetadataField(structuralLines[index]);
    const original = parseMetadataField(originalLines[index]);
    if (visible && original)
      fields.push({
        key: visible.key.toLowerCase(),
        value: original.value.replace(/<!--[\s\S]*?(?:-->|$)/g, '').trim(),
      });
  }
  return fields;
}

const substantive = (value) => Boolean(value?.trim()) && !/^\[[^\]]*\]$/.test(value.trim());
const withoutCommit = (value) => value.replace(/\s+@\s+[0-9a-f]{7,40}\s*$/i, '').trim();
function planReference(fields) {
  for (const key of ['Implementation-plan', 'Source-plan', 'Plan']) {
    const match = fields.find(
      (field) => field.key === key.toLowerCase() && substantive(withoutCommit(field.value))
    );
    if (match) return { key, path: withoutCommit(match.value) };
  }
  return null;
}

export function selectStoryIntentTask({ body = '', tasks = [], activePlanKey = null } = {}) {
  const fields = planMetadata(body);
  const selectors = fields.filter((field) => field.key === 'source-plan-section');
  const heading = selectors[0]?.value ?? null;
  const result = { ok: true, applied: false, heading: null, task: null, diagnostic: null };
  if (!activePlanKey || selectors.length === 0) return result;
  const refuse = (message) => ({
    ...result,
    ok: false,
    applied: true,
    heading,
    diagnostic: bounded(message),
  });
  if (selectors.length !== 1) return refuse('duplicate Source-plan-section fields');
  if (!substantive(heading)) return refuse('Source-plan-section is empty or a template');
  const active = planReference(fields);
  if (active && fields.filter((field) => field.key === active.key.toLowerCase()).length !== 1)
    return refuse('Linked plan metadata has duplicate active references');
  const source = fields.find(
    (field) => field.key === 'source-plan' && substantive(withoutCommit(field.value))
  );
  if (active && source && active.path !== withoutCommit(source.value))
    return refuse(
      'Source-plan-section conflicts with the active plan reference; repair the inherited selector or source authority'
    );
  const matches = tasks.filter((task) => task.heading === heading);
  if (matches.length !== 1) {
    // Put a useful exact candidate first so long untrusted selectors cannot hide it.
    const selectorPrefix = /^###\s+(Task|Milestone)\s+(\d+):/i.exec(heading);
    const candidate =
      tasks.find((task) => {
        const prefix = /^###\s+(Task|Milestone)\s+(\d+):/i.exec(task.heading);
        return (
          prefix &&
          selectorPrefix &&
          prefix[1].toLowerCase() === selectorPrefix[1].toLowerCase() &&
          prefix[2] === selectorPrefix[2]
        );
      })?.heading ?? tasks[0]?.heading;
    return refuse(
      matches.length > 1
        ? `Source-plan-section is ambiguous: ${heading}`
        : `Source-plan-section not found; extractor candidate: ${candidate && candidate.length <= 160 ? candidate : '(see extractor output)'}; supplied: ${heading}`
    );
  }
  return { ...result, applied: true, heading, task: matches[0] };
}

export function resolveStoryIntent({ body = '', plan = null } = {}) {
  const empty = {
    ok: false,
    intent: null,
    source: null,
    location: null,
    digest: null,
    violations: [],
  };
  const refuse = (message) => ({
    ...empty,
    violations: [violation('story-intent-source-unresolvable', null, message)],
  });
  const fields = planMetadata(body);
  const reference = planReference(fields);
  let parsed;
  let source;
  let location;
  if (reference) {
    if (fields.filter((field) => field.key === reference.key.toLowerCase()).length !== 1)
      return refuse('Linked plan metadata has duplicate active references');
    if (
      !plan ||
      plan.key !== reference.key ||
      plan.path !== reference.path ||
      typeof plan.text !== 'string' ||
      !Array.isArray(plan.tasks) ||
      plan.contentSha256 !== hash(plan.text)
    )
      return refuse(
        `Linked plan observation is absent, unreadable or inconsistent: ${reference.path}`
      );
    const selected = selectStoryIntentTask({
      body,
      tasks: plan.tasks,
      activePlanKey: reference.key,
    });
    if (!selected.ok) return refuse(selected.diagnostic);
    source = selected.applied ? 'linked-plan-task' : 'linked-plan';
    if (selected.applied) {
      const line = selected.task.sourceLine;
      if (!Number.isInteger(line) || line < 1)
        return refuse('Selected plan task has no valid source line');
      const { structuralLines } = markdownViews(plan.text);
      let end = line;
      while (end < structuralLines.length && !/^#{1,3}\s+/.test(structuralLines[end])) end += 1;
      parsed = parseStoryIntent(plan.text, { headingLevel: 4, startLine: line, endLine: end });
      location = { path: plan.path, heading: selected.heading, line };
    } else {
      // Root intent discovery excludes task subtrees but still diagnoses root duplicates.
      const { structuralLines } = markdownViews(plan.text);
      const roots = structuralLines
        .map((line, index) => (/^## Story Intent\s*$/.test(line) ? index : -1))
        .filter((index) => index !== -1);
      if (roots.length > 1)
        return {
          ...empty,
          violations: [
            violation(
              'story-intent-ambiguous',
              roots[1] + 1,
              'Linked plan contains duplicate root Story Intent blocks'
            ),
          ],
        };
      const start = roots[0];
      if (start === undefined)
        return {
          ...empty,
          violations: [
            violation(
              'story-intent-missing',
              null,
              `Linked plan has no root ## Story Intent: ${plan.path}`
            ),
          ],
        };
      let end = start + 1;
      while (end < structuralLines.length && !/^#{1,2}\s+/.test(structuralLines[end])) end += 1;
      parsed = parseStoryIntent(plan.text, { headingLevel: 2, startLine: start + 1, endLine: end });
      location = { path: plan.path, heading: '## Story Intent', line: start + 1 };
    }
  } else {
    if (plan || fields.some((field) => field.key === 'source-plan-section'))
      return refuse('No linked plan matches the supplied observation or task selector');
    const { structuralLines } = markdownViews(body);
    const sections = structuralLines
      .map((line, index) =>
        /^## Deep-Dive Analysis(?:\s*\([^\n]*\))?\s*$/.test(line) ? index : -1
      )
      .filter((index) => index !== -1);
    if (sections.length !== 1)
      return {
        ...empty,
        violations: [
          violation(
            sections.length ? 'story-intent-ambiguous' : 'story-intent-missing',
            null,
            'Expected exactly one root Deep-Dive Analysis section'
          ),
        ],
      };
    const start = sections[0];
    let end = start + 1;
    while (end < structuralLines.length && !/^#{1,2}\s+/.test(structuralLines[end])) end += 1;
    parsed = parseStoryIntent(body, { headingLevel: 3, startLine: start + 1, endLine: end });
    source = 'deep-dive';
    location = { path: null, heading: '### Story Intent', line: parsed.range?.start ?? start + 1 };
  }
  if (!parsed.ok) return { ...empty, violations: parsed.violations };
  return {
    ok: true,
    intent: parsed.intent,
    source,
    location,
    digest: intentDigest(parsed.intent),
    violations: [],
  };
}
