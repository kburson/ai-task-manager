---
name: reference_epic_no_commit_close_lane
description: "Epics have no direct commits — close them via `npx aitm kind <N> epic` + a deliverable comment attached by `epic-reconcile`, never commit-trace."
metadata: 
  node_type: memory
  type: reference
  originSessionId: c7f3f7f9-bd9f-4447-a198-23700aaaa612
---

An epic's commits are all child-tagged (#child), so the develop→test gates (`code-complete-commits-missing`, `develop-to-test-no-trail`) block it and running `/task commit-trace` would stamp a FALSE HEAD trail. Sanctioned lane (verified on epic #528, 2026-07-04):

1. `npx aitm kind <N> epic` — sets `<!-- aitm-issue-kind kind="epic" -->` (epic is in `NO_COMMIT_KINDS`, lib/issue-kind.mjs).
2. Post a deliverable summary comment (child issues Done + evidence), then run `npx aitm epic-reconcile <N> --deliverable-comment <id|url>`. The verb validates repository/issue ownership and records the URL-bearing `aitm-deliverable-posted` marker through the versioned body writer.
3. This swaps the commit-trail requirement for the deliverable marker in `gateCodeComplete` AND skips the HEAD-trail guard (`develop-exit-commit-trail-head-guard.mjs`).
4. ACs still require real verifier evidence (or waiver); `dod-stamp tests/lint/commits` still run at Test; DoD boxes need `ensureChecked` after stamping (dod-stamp only upserts run-props, doesn't tick).

Related: [[feedback_no_source_issue_spike_lane]], [[reference_ac_section_subheading_trap]], [[feedback_dod_stamp_vs_ac_stamp]].
