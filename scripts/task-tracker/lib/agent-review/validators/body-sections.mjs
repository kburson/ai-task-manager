// Agent Review Gate — V1 body-sections validator (#810).
//
// Verifies that an issue body carries the ten canonical sections, in canonical
// order, each non-empty. It is a pure `validate`-family member: it never mutates
// the body and returns `{ pass, failures }` where each failure names the
// offending section by its human label.
//
// Canonical order is the single source of truth below. Heading matchers tolerate
// the two live suffix variants: the Pickup Directive's "— MANDATORY, DO NOT SKIP"
// tail and the Deep-Dive heading's trailing "(yyyy-mm-dd)" date. "Non-empty"
// means the slice between a section's heading and the next `##` heading contains
// at least one non-whitespace character — HTML-comment-only content (e.g. the
// all-marker AITM Progress Markers section) counts as non-empty.

import { registry } from '../registry.mjs';
import { hasNestedMetadataHeading } from '../../metadata-section.mjs';

// One row per required section, in canonical body order. `label` is the
// human name used in failures[]; `match` tests a heading's text (the part
// after `## `).
export const CANONICAL_SECTIONS = [
  { label: 'Story narrative', match: (h) => /^user story\b/i.test(h) },
  { label: 'Scope', match: (h) => /^scope\b/i.test(h) },
  { label: 'Story Origin', match: (h) => /^story origin\b/i.test(h) },
  { label: 'Plan Metadata', match: (h) => /^plan metadata\b/i.test(h) },
  { label: 'Pickup Directive', match: (h) => /^pickup directive\b/i.test(h) },
  { label: 'Deep Dive', match: (h) => /^deep[-\s]dive\b/i.test(h) },
  { label: 'Acceptance Criteria', match: (h) => /^acceptance criteria\b/i.test(h) },
  { label: 'Verification Commands', match: (h) => /^verification commands\b/i.test(h) },
  { label: 'Definition of Done', match: (h) => /^definition of done\b/i.test(h) },
  { label: 'AITM Progress Markers', match: (h) => /^aitm progress markers\b/i.test(h) },
];

// Scan a body for every `## <text>` heading, returning `{ text, start, end }`
// where `start`/`end` bound the section content (heading line excluded) up to
// the next `##` heading or end-of-body. `###+` sub-headings are NOT section
// boundaries; only exactly-`##` headings delimit sections.
function scanSections(body) {
  const lines = String(body || '').split('\n');
  const headings = [];
  let pos = 0;
  let detailsDepth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const m = /^##\s+(.*\S)\s*$/.exec(line);
    if (m && !/^###/.test(line)) {
      headings.push({
        text: m[1].trim(),
        lineStart: pos,
        lineEnd: pos + line.length,
        inDetails: detailsDepth > 0,
      });
    }
    if (/^<details\b/i.test(trimmed)) detailsDepth += 1;
    if (/^<\/details>/i.test(trimmed) && detailsDepth > 0) detailsDepth -= 1;
    pos += line.length + 1; // +1 for the split '\n'
  }
  const total = String(body || '').length;
  return headings.map((h, i) => {
    const contentStart = h.lineEnd;
    const contentEnd = i + 1 < headings.length ? headings[i + 1].lineStart : total;
    return {
      text: h.text,
      content: String(body || '').slice(contentStart, contentEnd),
      order: h.lineStart,
      inDetails: h.inDetails,
    };
  });
}

function isRootOnlySection(label) {
  return ['Acceptance Criteria', 'Verification Commands', 'Definition of Done'].includes(label);
}

// V1 validator. `context.body` is the issue body.
export function validate({ body } = {}) {
  const sections = scanSections(body);
  const failures = [];

  // Resolve each canonical row to the first matching heading in the body.
  const resolved = CANONICAL_SECTIONS.map((row) => ({
    row,
    hit: sections.find((s) => row.match(s.text) && (!isRootOnlySection(row.label) || !s.inDetails)),
  }));

  for (const row of CANONICAL_SECTIONS.filter((r) => isRootOnlySection(r.label))) {
    const hidden = sections.find((s) => row.match(s.text) && s.inDetails);
    if (hidden) {
      failures.push(
        `section '${row.label}' appears inside a details block; details block opened before ${row.label}; canonical checkbox sections must be root-level and visible`
      );
    }
  }

  // Missing + empty checks.
  for (const { row, hit } of resolved) {
    if (!hit) {
      failures.push(`section '${row.label}' is missing`);
      continue;
    }
    if (!/\S/.test(hit.content)) {
      failures.push(`section '${row.label}' is present but empty`);
    }
  }

  for (const heading of ['Story Origin', 'Plan Metadata']) {
    if (hasNestedMetadataHeading(body, heading)) {
      failures.push(`section '${heading}' must be flat and contain no nested headings`);
    }
  }

  // Order check — only across sections that are actually present. The document
  // offsets of the present sections must be strictly increasing in canonical
  // order; report the first inversion.
  const present = resolved.filter((r) => r.hit);
  for (let i = 1; i < present.length; i += 1) {
    if (present[i].hit.order < present[i - 1].hit.order) {
      failures.push(
        `section '${present[i].row.label}' appears before '${present[i - 1].row.label}'`
      );
      break;
    }
  }

  return { pass: failures.length === 0, failures };
}

export const bodySectionsValidator = {
  id: 'body-sections',
  describe: () => 'V1: ten canonical body sections present, ordered, and non-empty',
  validate,
};

registry.register(bodySectionsValidator);

export default bodySectionsValidator;
