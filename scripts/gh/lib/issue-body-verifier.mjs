// Canonical issue-body verifier.
//
// Pure: takes a Markdown body string, returns { ok, missing }.
// Used by `create-issue.mjs --body-file` to refuse arbitrary bodies that
// bypass the canonical Scope / AC / DoD / Pickup Directive structure assembled
// by `preflight-issue.mjs --shape`.
//
// Required sections (anchored heading regex; allow lifecycle marker blocks
// between sections):
//   ## Scope
//   ## Acceptance Criteria
//   ### Definition of Done       (under any parent — top-level or nested)
//   ## Pickup Directive — MANDATORY, DO NOT SKIP
//
// The Pickup Directive section must also contain the literal line
//   > Follow: `.ai-task-manager/pickup-directive.md`
// otherwise the directive is malformed (truncated/placeholder).

const SECTION_CHECKS = [
  { name: '## Scope', regex: /^##\s+Scope\s*$/m },
  { name: '## Acceptance Criteria', regex: /^##\s+Acceptance Criteria\s*$/m },
  { name: '### Definition of Done', regex: /^###\s+Definition of Done\s*$/m },
  {
    name: '## Pickup Directive — MANDATORY, DO NOT SKIP',
    regex: /^##\s+Pickup Directive\s+—\s+MANDATORY,\s+DO NOT SKIP\s*$/m,
  },
];

const PICKUP_FOLLOW_LINE = '> Follow: `.ai-task-manager/pickup-directive.md`';

export function verifyIssueBody(body) {
  const missing = [];
  if (typeof body !== 'string' || body.length === 0) {
    return { ok: false, missing: SECTION_CHECKS.map((c) => c.name) };
  }

  for (const check of SECTION_CHECKS) {
    if (!check.regex.test(body)) missing.push(check.name);
  }

  // Pickup Directive heading present but the canonical "Follow:" line absent
  // counts as a malformed Pickup Directive.
  const hasPickupHeading = SECTION_CHECKS[3].regex.test(body);
  if (hasPickupHeading && !body.includes(PICKUP_FOLLOW_LINE)) {
    missing.push(
      'Pickup Directive: missing canonical `> Follow: `.ai-task-manager/pickup-directive.md`` line'
    );
  }

  return { ok: missing.length === 0, missing };
}

export const REQUIRED_SECTIONS = SECTION_CHECKS.map((c) => c.name);
export const PICKUP_FOLLOW_REQUIRED_LINE = PICKUP_FOLLOW_LINE;
