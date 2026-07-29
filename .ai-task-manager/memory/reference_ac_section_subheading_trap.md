---
name: reference_ac_section_subheading_trap
description: 'A `###` subheading nested inside `## Acceptance Criteria` empties the located AC section and hides all ACs from ac-stamp/ensureChecked.'
metadata:
  node_type: memory
  type: reference
  originSessionId: 21d3b5eb-93a4-4605-952e-d9d2ee33c136
---

`lib/ac-evidence.mjs` locates the AC section with `AC_HEADING_RE` (`## Acceptance Criteria`) and terminates it at the FIRST `SECTION_END_RE` match — which is ANY `#{1,4}` heading. So a nested `### Demonstrable (verifier-backed)` (or any `###`) placed BETWEEN `## Acceptance Criteria` and the checkboxes empties the located section: `parseEvidenceAcs` returns 0 ACs and `ac-stamp`/`ensureChecked` report "no AC line carrying aitm-verified-by matching."

**How to apply:** keep AC checkboxes sitting DIRECTLY under `## Acceptance Criteria`. Non-demonstrable ACs converted to bullets go under a sub-heading placed AFTER all the checkboxes (or in a later section), never between the `##` heading and the boxes. When user asks for a "demonstrable" sub-grouping, do it with bullets/text after the boxes, not a `###` above them.

**Also:** `ac-stamp`/`ensureChecked` match on EXACT full stripped label — markdown `**bold**` is NOT stripped (pass it verbatim), HTML comments ARE stripped and whitespace collapsed. Pass the entire AC label text including `**...**`.

**Second trap (opposite parser, epic #528):** `lib/code-complete-gate.mjs` `parseAcceptanceCriteria` terminates the AC section only at the next `##` — a `###` does NOT end it. So a `### Sub-issues` checklist inside the AC section is parsed as extra bare ACs with no verifier, blocking develop→test with `code-complete-ac-unverified: #N` for each. Fix: promote it to `## Sub-issues` (own section) via mutateIssueBody. Keep NOTHING but the real AC checkboxes between `## Acceptance Criteria` and the next `##` heading.

Related: [[feedback_dod_stamp_vs_ac_stamp]], [[feedback_route_issue_bodies_through_scripts]], [[reference_epic_no_commit_close_lane]].
