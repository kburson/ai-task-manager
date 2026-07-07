---
name: aggregate-test-execution-pattern
description: "For coverage/test epics, run the full suite ONCE in aggregate at the sub-epic level; grandchildren run only targeted fixtures. Big time saver."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 462155d4-59b5-406d-a4d4-470fa1499d10
---

When an epic spawns many test/coverage stories under group sub-epics, do NOT let
each grandchild run `npm run test:all` — it costs ~15 min per story. Instead push
the full-suite regression to run **once in aggregate** at the sub-epic level.

Mechanism (verified in this repo, 2026-06-28, epic #584):
- The `## Verification Commands` section is a **derived fixed-point** of the body's
  Functional-DoD + AC commands (`preflight-issue.mjs` → `auditEvidenceMarkers(...).missingVerificationCommands`).
- The Test sandbox (`verbs/test.mjs`) runs **every** VC line via `execFile`, cold,
  with no cache. So whatever lands in VC runs per-issue.
- Therefore the lever is the **Functional-DoD `tests` key's declared command**:
  - **Grandchild (story):** declare `tests` = targeted `node --test <affected fixtures>`
    → VC seeds targeted only → sandbox never runs `test:all`.
  - **Sub-epic:** declare `tests` = `npm run test:all` → its sandbox runs the full
    suite once, in aggregate across all its children, at the merged trunk SHA.
  - **Root epic:** `test:all` + coverage gate once at the end.
- No gate forces the `tests` key to equal `test:all`: the #523 demonstrable-verifier
  gate (`findAcsWithoutVerifierOrInvalidTag`) scans only the **AC** section;
  `functional-dod-evidence.mjs` enforces only marker form. ACs still need targeted
  verifiers (`test:all` is the "regression floor, not an AC verifier").
- A content-addressed suite cache already exists (#446, `verifier-cache.mjs`), keyed
  on `(normalized cmd, HEAD short-sha)` at a clean tree, scoped to `npm run test:all`,
  pruned-to-current-sha. It opportunistically dedupes the sub-epic→root-epic `test:all`
  stamps when they share a SHA. It does NOT help the sandbox (isolated worktree).

**Ordering rule that makes it honest:** all of a sub-epic's stories merge to trunk →
sub-epic runs `test:all` once at that SHA → stories close at the same SHA → next
sub-epic begins (HEAD must not advance mid-group). No grandchild reaches Done until
the sub-epic's aggregate run is green, so "all automated tests pass" is a real
precondition, not faked. Relates to [[feedback_never_fabricate_evidence]] and
[[project_drive_508_tree]].

**Why:** User (2026-06-28) wants this remembered — running the full suite once per
group instead of once per story turns 36 full runs into ~8, saving hours.

**How to apply:** When building a test/coverage epic, author grandchild `tests` DoD
keys as targeted commands (override the preflight default via `mutateIssueBody`
post-create if needed); reserve `npm run test:all` for sub-epic and root-epic `tests`
keys; drive groups sequentially so each group's aggregate run and its children's
closes share one trunk SHA.
