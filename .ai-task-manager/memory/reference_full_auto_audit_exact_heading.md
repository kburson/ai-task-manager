---
name: reference_full_auto_audit_exact_heading
description: 'The Agent Review Gate matches the Full-Auto plan-approval audit comment on the literal heading "Full-Auto Plan-Approval Audit" — any other wording fails the gate.'
metadata:
  node_type: memory
  type: reference
  originSessionId: c050b5c5-62cd-4f91-8d52-209d2232d2d5
---

`required-comments.mjs` (validator list, `label: 'Full-Auto plan-approval audit'`)
matches with `/Full-Auto Plan-Approval Audit/i` against comment bodies. A comment
titled anything else — e.g. `**Full-Auto audit — autonomous plan approval.**` —
does not satisfy it, and Test→Review fails with
`required-comments: required comment 'Full-Auto plan-approval audit' is missing`
even though the audit was genuinely posted.

Lead every Full-Auto plan-approval audit comment with:
`### Full-Auto Plan-Approval Audit — #<N>`

Sibling always-required comments on the same validator: `Timing Log`, and
`Refine Estimate` (which is conjunctive — the same comment must carry BOTH an
`aitm-refined-estimate:` marker and a `Planned Estimate` block). Code-kind-only:
`Commits`, `New Automated Tests`.

Related: [[feedback_full_auto_review_audit]], [[feedback_full_auto_gate_beyond_review]],
[[feedback_full_auto_tick_review_box]].
