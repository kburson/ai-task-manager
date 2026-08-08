---
name: feedback-never-demote-human-signed-final-review
description: A human-ticked Final Review Passed is a genuine sign-off (marker-less by design); never demote or treat as stale
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7eb34043-996a-4344-b692-4f66fef0559a
  modified: 2026-07-23T01:05:50.548Z
---

When the human personally ticks `- [x] Final Review Passed`, that is their genuine
manual sign-off. It is **marker-less by design** — a human review box carries no
`aitm-verified` proof marker, so guards like `findCheckboxesTickedWithoutProof` will
flag it (or a line-shift can make it look "newly ticked"); that is a FALSE POSITIVE, not
stale/fabricated evidence.

**Why:** On #908 (2026-07-22/23) I demoted the issue out of Review *after* the user had
manually signed off Final Review, over-applying an "invalidate/revalidate" directive to
boxes that were legitimately green + human-approved — then misread the `[x]` as `[ ]` and
told the user it was unchecked. The demote reverted their approval and burned a full
re-verify cycle for zero honesty gain. User correction: "I manually ticked 908 final
review when you were last in review... you demoted out for the wrong reason."

**How to apply:** Before demoting ANY Review-stage issue, check whether `Final Review
Passed` is human-ticked. If it is, do NOT demote — the issue is approved; drive it to
close (`approve` records the human approval that the tick represents, then `close`). If a
mutate guard flags the marker-less human sign-off, bypass with a documented
`allowUnverifiedTicks: true` — never untick it. Distinguish auto-approval (needs a
Full-Auto audit comment) from a real human tick (does not). Related:
[[reference_demote_stale_evidence_reverify_recipe]] (#932 demote-leaves-stale-evidence is
about AC/VC/DoD derived green — NOT the human Final Review box), [[project_epic_912_state]].
