// Canonical issue-body verifier.
//
// Pure: takes a Markdown body string, returns { ok, missing }.
// Used by `create-issue.mjs --body-file` to refuse arbitrary bodies that
// bypass the canonical Scope / Story Origin / Plan Metadata / AC / DoD /
// Pickup Directive structure assembled by `preflight-issue.mjs --shape`.
//
// Required sections (anchored heading regex; allow lifecycle marker blocks
// between sections):
//   ## Scope  (or ## Problem — either framing is canonical)
//   ## Story Origin
//   ## Plan Metadata
//   ## Acceptance Criteria
//   ## Definition of Done       (top-level sibling; legacy ### still accepted)
//     ### Functional            (required subheader, present DoD only)
//     ### Lifecycle             (required subheader, present DoD only)
//   ## Pickup Directive — MANDATORY, DO NOT SKIP
//
// The Pickup Directive section must also contain the literal line
//   > Follow: `.ai-task-manager/templates/pickup-directive.md`
// otherwise the directive is malformed (truncated/placeholder).
//
// #171: a `## Definition of Done` heading alone is not enough — the
// #169/#170 failure mode shipped bodies whose DoD was a placeholder with no
// Functional/Lifecycle subsections. When the DoD heading is present we also
// require both subheaders, so an empty/stub DoD is reported as malformed.

import { hasStoryOriginFields } from '../../task-tracker/lib/story-origin.mjs';
import { hasNestedMetadataHeading } from '../../task-tracker/lib/metadata-section.mjs';
import {
  findAcsWithLegacyVerificationForm,
  findAcsWithoutVerifierOrInvalidTag,
} from '../../task-tracker/lib/body-invariants.mjs';
import { validateExactUserStoryLines } from '../../task-tracker/lib/user-story-author.mjs';

const USER_STORY_REGEX = /^##\s+User Story\s*$/m;
const SCOPE_REGEX = /^##\s+(Scope|Problem)\s*$/m;
const STORY_ORIGIN_REGEX = /^##\s+Story Origin\s*$/m;
const PLAN_METADATA_REGEX = /^##\s+Plan Metadata\s*$/m;
const DOD_REGEX = /^#{2,3}\s+Definition of Done\s*$/m;
// Subheaders are matched tolerantly: the canonical text is
// "### Functional (verified at Test)" / "### Lifecycle (auto-ticked at
// Review/Close)" (#480 promoted DoD to a 2-hash top-level section and its
// subsections from #### to ###), but only the leading word is load-bearing.
const DOD_FUNCTIONAL_REGEX = /^#{3,4}\s+Functional\b/m;
const DOD_LIFECYCLE_REGEX = /^#{3,4}\s+Lifecycle\b/m;
const PICKUP_HEADING_REGEX = /^##\s+Pickup Directive\s+—\s+MANDATORY,\s+DO NOT SKIP\s*$/m;

const SECTION_CHECKS = [
  { name: '## User Story', regex: USER_STORY_REGEX },
  { name: '## Scope (or ## Problem)', regex: SCOPE_REGEX },
  { name: '## Story Origin', regex: STORY_ORIGIN_REGEX },
  { name: '## Plan Metadata', regex: PLAN_METADATA_REGEX },
  { name: '## Acceptance Criteria', regex: /^##\s+Acceptance Criteria\s*$/m },
  { name: '## Definition of Done', regex: DOD_REGEX },
  {
    name: '## Pickup Directive — MANDATORY, DO NOT SKIP',
    regex: PICKUP_HEADING_REGEX,
  },
];

const PICKUP_FOLLOW_LINE = '> Follow: `.ai-task-manager/templates/pickup-directive.md`';

export function verifyIssueBody(body) {
  const missing = [];
  if (typeof body !== 'string' || body.length === 0) {
    return {
      ok: false,
      missing: [
        ...SECTION_CHECKS.map((c) => c.name),
        '### Functional (DoD subheader)',
        '### Lifecycle (DoD subheader)',
      ],
    };
  }

  for (const check of SECTION_CHECKS) {
    if (!check.regex.test(body)) missing.push(check.name);
  }

  if (USER_STORY_REGEX.test(body)) {
    const match = body.match(USER_STORY_REGEX);
    const start = match.index + match[0].length;
    const after = body.slice(start);
    const nextHeading = after.search(/^##\s+/m);
    const story = nextHeading === -1 ? after : after.slice(0, nextHeading);
    try {
      validateExactUserStoryLines(story);
    } catch {
      missing.push('## User Story must contain exactly three complete Connextra lines');
    }
  }

  if (/^##\s+Acceptance Criteria\s*$/m.test(body)) {
    const acOffenders = [
      ...findAcsWithLegacyVerificationForm(body),
      ...findAcsWithoutVerifierOrInvalidTag(body),
    ];
    if (acOffenders.length > 0) {
      const reasons = [...new Set(acOffenders.map(({ reason }) => reason))].join(', ');
      missing.push(`## Acceptance Criteria must use current verifier citations (${reasons})`);
    }
  }

  if (STORY_ORIGIN_REGEX.test(body) && !hasStoryOriginFields(body)) {
    missing.push('## Story Origin must contain at least one non-empty flat metadata field');
  }
  for (const heading of ['Story Origin', 'Plan Metadata']) {
    if (hasNestedMetadataHeading(body, heading)) {
      missing.push(`## ${heading} must be flat and contain no nested headings`);
    }
  }

  if (
    SCOPE_REGEX.test(body) &&
    STORY_ORIGIN_REGEX.test(body) &&
    body.search(SCOPE_REGEX) > body.search(STORY_ORIGIN_REGEX)
  ) {
    missing.push('## Scope (or ## Problem) must precede ## Story Origin');
  }

  if (
    STORY_ORIGIN_REGEX.test(body) &&
    PLAN_METADATA_REGEX.test(body) &&
    body.search(STORY_ORIGIN_REGEX) > body.search(PLAN_METADATA_REGEX)
  ) {
    missing.push('## Story Origin must precede ## Plan Metadata');
  }

  // #171 — when the DoD heading is present, both subheaders must be too. We
  // only flag missing subheaders when the parent heading exists, so a
  // DoD-absent body reports the single "## Definition of Done" miss without
  // a confusing pile of subheader misses.
  if (DOD_REGEX.test(body)) {
    if (!DOD_FUNCTIONAL_REGEX.test(body)) missing.push('### Functional (DoD subheader)');
    if (!DOD_LIFECYCLE_REGEX.test(body)) missing.push('### Lifecycle (DoD subheader)');
  }

  // Pickup Directive heading present but the canonical "Follow:" line absent
  // counts as a malformed Pickup Directive.
  if (PICKUP_HEADING_REGEX.test(body) && !body.includes(PICKUP_FOLLOW_LINE)) {
    missing.push(
      'Pickup Directive: missing canonical `> Follow: `.ai-task-manager/templates/pickup-directive.md`` line'
    );
  }

  return { ok: missing.length === 0, missing };
}

export const REQUIRED_SECTIONS = SECTION_CHECKS.map((c) => c.name);
export const PICKUP_FOLLOW_REQUIRED_LINE = PICKUP_FOLLOW_LINE;
