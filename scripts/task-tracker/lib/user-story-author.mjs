// User Story authoring (#662).
//
// Pure, total, idempotent body transform that authors or repairs the
// `## User Story` section so a refine→plan transition blocked by
// `userStoryBlockGuard` (lib/user-story-guard.mjs) can be unblocked in-workflow
// rather than by hand-editing the body in the GitHub web UI.
//
// `setUserStory(body, { asA, iWant, soThat })`:
//   - Composes three Connextra lines, prepending the canonical prefix
//     ("As a ", "I want to ", "So that ") only when the caller's clause does
//     not already lead with it.
//   - When `## User Story` is absent, inserts the section as the FIRST `## `
//     heading (ahead of whatever section currently leads), preserving every
//     marker / HTML comment above the first heading.
//   - When `## User Story` is present, replaces its body lines in place,
//     keeping the heading position and any markers inside the section.
//   - Idempotent: re-running with identical inputs reproduces the same bytes,
//     so `mutateIssueBody` short-circuits to a no-op.
//
// The composed lines are validated against the same PLACEHOLDERS set the block
// guard rejects, so a body written by this function always passes
// `validateUserStory`.

import { PLACEHOLDERS } from './user-story-guard.mjs';

const HEADING = '## User Story';

// Per-clause prefix detection: if the caller's clause already opens with the
// Connextra lead-in, keep it verbatim; otherwise prepend the canonical prefix.
const CLAUSE_SPECS = {
  asA: { key: 'asA', prefix: 'As a ', detect: /^as an?\b/i, label: 'asA' },
  iWant: { key: 'iWant', prefix: 'I want to ', detect: /^i want\b/i, label: 'iWant' },
  soThat: { key: 'soThat', prefix: 'So that ', detect: /^so that\b/i, label: 'soThat' },
};

function composeClause(spec, raw) {
  if (raw == null) {
    throw new TypeError(`setUserStory: ${spec.label} is required`);
  }
  const value = String(raw).trim();
  if (value.length === 0) {
    throw new TypeError(`setUserStory: ${spec.label} must be a non-empty string`);
  }
  const line = spec.detect.test(value) ? value : `${spec.prefix}${value}`;
  if (PLACEHOLDERS.has(line)) {
    throw new TypeError(
      `setUserStory: ${spec.label} resolves to the template placeholder "${line}" — supply real story content`
    );
  }
  return line;
}

// Build the canonical three-line story block (no heading).
export function buildUserStoryLines({ asA, iWant, soThat } = {}) {
  return [
    composeClause(CLAUSE_SPECS.asA, asA),
    composeClause(CLAUSE_SPECS.iWant, iWant),
    composeClause(CLAUSE_SPECS.soThat, soThat),
  ];
}

export function setUserStory(body, story = {}) {
  const src = String(body == null ? '' : body);
  const lines = buildUserStoryLines(story);
  const block = `${HEADING}\n\n${lines.join('\n')}\n`;

  const headingIdx = src.search(/^## User Story\s*$/m);
  if (headingIdx === -1) {
    return insertAsFirstHeading(src, block);
  }
  return replaceInPlace(src, headingIdx, lines);
}

// Insert the story block immediately before the first `## ` heading so User
// Story becomes the first `## ` heading. When the body has no `## ` heading at
// all, append the block at the end (it is trivially the first heading). Markers
// and prose above the first heading are preserved.
function insertAsFirstHeading(src, block) {
  const firstH2 = src.search(/^## /m);
  if (firstH2 === -1) {
    const base = src.replace(/\s+$/, '');
    return base.length === 0 ? `${block}` : `${base}\n\n${block}`;
  }
  const head = src.slice(0, firstH2).replace(/\s+$/, '');
  const rest = src.slice(firstH2);
  const lead = head.length === 0 ? '' : `${head}\n\n`;
  return `${lead}${block}\n${rest}`;
}

// Replace the body lines of the existing `## User Story` section in place. The
// section runs from the heading to the next `##` heading (or end of body). The
// heading line, any HTML-comment markers inside the section, and the trailing
// structure are preserved; only the visible story prose is swapped.
function replaceInPlace(src, headingIdx, lines) {
  const headingEnd = headingIdx + HEADING.length;
  const after = src.slice(headingEnd);
  const nextRel = after.search(/^##\s/m);
  const sectionBody = nextRel === -1 ? after : after.slice(0, nextRel);
  const tail = nextRel === -1 ? '' : after.slice(nextRel);

  // Preserve any HTML-comment markers that live inside the section (e.g. a
  // future verified-marker), re-emitting them after the fresh story lines.
  const markers = sectionBody
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('<!--'));

  const markerBlock = markers.length > 0 ? `\n${markers.join('\n')}\n` : '';
  const rebuilt = `${HEADING}\n\n${lines.join('\n')}\n${markerBlock}`;
  const sep = tail.length === 0 ? '' : '\n';
  return `${src.slice(0, headingIdx)}${rebuilt}${sep}${tail}`;
}
