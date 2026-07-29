---
name: feedback-no-source-issue-spike-lane
description: "No-source-code issues (repo-config chores, spike-finding actions) → reclassify to a no-commit kind so commit-trace's false HEAD attribution can't gate them"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ecfbba2d-1ae0-4e30-a041-91322715e9f6
---

When an issue's deliverable is NOT source code — a repo-config change (e.g. creating a GitHub label), a decision, or the _action from_ a spike finding — it produces zero commits. The develop→test code lane then breaks: `/task commit-trace` has no commit to record, so it grabs **HEAD**, which is some _other_ issue's commit, and stamps a false `### 🔗 Commits` trail.

**Why:** attributing another issue's commit to this one is fabricated/misleading evidence; do not build a close on it (`[[feedback_never_fabricate_evidence]]`).

**How to apply:**

1. `node scripts/task-tracker/task-tracker.mjs kind <N> spike` — reclassify to the no-commit deliverable lane (kinds: `audit|research|spike|epic`; `spike` fits finding-actions/config chores best — there is no "chore" kind). This swaps the commit-trail requirement for an `aitm-deliverable-posted` body marker and excludes the `tests` DoD item (`dod:kinds exclude="spike,research"`).
2. Void the bogus commit-trace: deleting another's comment is blocked by the auto-mode classifier, so **post a correction comment** marking the `### 🔗 Commits` trail void and naming whose commit it actually was (don't silently fix).
3. Stamp `<!-- aitm-deliverable-posted kind="spike" deliverable="..." -->` into the issue **body** (not just a comment) via `mutateIssueBody` — `gateCodeComplete` reads the body. This marker is NOT execution-proof, so it won't trip `FabricatedProofError`.
4. Verify green: `gateCodeComplete` on the no-commit lane needs only ACs checked+verified/waived/non-demonstrable + the deliverable marker.

Mechanism lives in `scripts/task-tracker/lib/issue-kind.mjs` (`NO_COMMIT_KINDS`) and `code-complete-gate.mjs` (audit branch). Verified end-to-end driving #686 (create SPIKE label) to Done.
