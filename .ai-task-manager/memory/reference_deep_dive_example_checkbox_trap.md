---
name: reference_deep_dive_example_checkbox_trap
description: 'A `- [ ]` line used as an ILLUSTRATION in a deep dive becomes a real unticked checkbox in the issue body and blocks test→review.'
metadata:
  node_type: memory
  type: reference
  originSessionId: c050b5c5-62cd-4f91-8d52-209d2232d2d5
---

Never write a literal `- [ ] …` line in a deep-dive (or any text mirrored into an
issue body) to _illustrate_ marker syntax. The `dod:functional:checkboxes`
derivation scans the whole body and cannot distinguish an example from a promise,
so the illustration registers as a real unticked checkbox and refuses
`test→review` with `test-to-review-incomplete`. Indenting it does not help — the
scanner reads indented lines too.

Hit on #888 (2026-07-19) while illustrating `<!-- aitm-ac-struck child="#N" … -->`.
Fix was a one-off `mutateIssueBody` rewriting the line to a prose form
(`(unchecked) …`).

**How to apply:** show marker syntax without the checkbox prefix — quote just the
comment, or lead the line with `(unchecked)` / `(ticked)` in words. Same family of
body-shape traps as [[reference_ac_section_subheading_trap]] and
[[reference_deep_dive_heading_trap]].
