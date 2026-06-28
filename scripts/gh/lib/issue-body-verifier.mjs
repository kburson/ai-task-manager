// Canonical issue-body verifier.
//
// Pure: takes a Markdown body string, returns { ok, missing }.
// Used by `create-issue.mjs --body-file` to refuse arbitrary bodies that
// bypass the canonical Scope / AC / DoD / Pickup Directive structure assembled
// by `preflight-issue.mjs --shape`.
//
// Required sections (anchored heading regex; allow lifecycle marker blocks
// between sections):
//   ## Scope  (or ## Problem — either framing is canonical)
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

const SCOPE_REGEX = /^##\s+(Scope|Problem)\s*$/m;
const DOD_REGEX = /^#{2,3}\s+Definition of Done\s*$/m;
// Subheaders are matched tolerantly: the canonical text is
// "### Functional (verified at Test)" / "### Lifecycle (auto-ticked at
// Review/Close)" (#480 promoted DoD to a 2-hash top-level section and its
// subsections from #### to ###), but only the leading word is load-bearing.
const DOD_FUNCTIONAL_REGEX = /^#{3,4}\s+Functional\b/m;
const DOD_LIFECYCLE_REGEX = /^#{3,4}\s+Lifecycle\b/m;

const SECTION_CHECKS = [
  { name: '## Scope (or ## Problem)', regex: SCOPE_REGEX },
  { name: '## Acceptance Criteria', regex: /^##\s+Acceptance Criteria\s*$/m },
  { name: '## Definition of Done', regex: DOD_REGEX },
  {
    name: '## Pickup Directive — MANDATORY, DO NOT SKIP',
    regex: /^##\s+Pickup Directive\s+—\s+MANDATORY,\s+DO NOT SKIP\s*$/m,
  },
];

const PICKUP_HEADING_REGEX = SECTION_CHECKS[3].regex;
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
