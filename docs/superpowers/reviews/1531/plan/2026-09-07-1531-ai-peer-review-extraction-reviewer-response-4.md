# Reviewer Response 4 — AI Peer Review Extraction Implementation Plan

- **Artifact:** `docs/superpowers/plans/2026-09-07-1531-ai-peer-review-extraction.md`
- **Artifact commit:** `bffbfd656b7d8042b64bd53275f38cef02917fa1`
- **Prior artifact commit:** `cc7633776ae10c2294239899aa3dbb049297d926`
- **Author response:**
  `docs/superpowers/reviews/1531/plan/2026-09-07-1531-ai-peer-review-extraction-author-response-3.md`
- **Ratified spec:**
  `docs/superpowers/specs/2026-09-07-1531-ai-peer-review-extraction-design.md` at
  `68de80b45b23c90874bac0fcd87cfa0c1980edd4`
- **Reviewer turn:** 4
- **Decision:** `accepted`

## Summary

Both round-3 findings are closed, and I verified each in the revised plan rather
than accepting the disposition on its own.

**R3-F001.** Task 1 Step 7 now runs `git rm -- LICENSE-COMMERCIAL`, which stages
the deletion at the moment the instruction requires it. Step 8's `git commit`
takes no pathspec, so the staged removal is included, and the step adds a direct
assertion before the verifier:

```bash
! git ls-tree -r --name-only HEAD | rg '^LICENSE-COMMERCIAL$'
node scripts/verify-extraction.mjs
```

The Expected block now names the absence explicitly. This is the fix I asked for,
placed in the step that carries the instruction rather than bolted onto the
staging list.

**R3-F002.** Task 14 Step 5 is now the pre-commit test/lint/packaging gate only,
and its Expected no longer claims a clean working tree — it states accurately that
the tree holds the release-candidate changes and parity-gated deletions Step 6
will commit. `verify-extraction.mjs --require-legacy-removed`, `git diff --check`,
and `git status --short` moved to the end of Step 6, after the commit, where
`ls-tree -r HEAD` can actually observe the removed legacy paths. Task 1 Step 4
additionally specifies the wrapper surface — `node scripts/verify-extraction.mjs
[--require-legacy-removed]`, mapping to `requireLegacyRemoved: true`, rejecting
unknown arguments — which was the loose end I flagged alongside that finding.

Across four turns this plan closed twenty-two findings. The ones I care most about
in retrospect are the three that were the same defect wearing different clothes:
a fail-closed verifier invoked at a point where its own preconditions could not
hold (R1-F001 at the Phase 1 gate, R2-F001 in Task 1 Step 7, R3-F002 in Task 14
Step 5). The final shape handles that class structurally — the two-mode
`requireLegacyRemoved` gate distinguishes the bootstrap tree from the publishable
tree, `filtered_history_tip` bounds the history check without a commit-SHA
self-reference, and every verifier invocation now sits after the commit whose tree
it reads.

I was wrong twice, on R2-F003 and the binding half of R2-F004, and both were
caught by the author checking the repository instead of deferring. The hardening
that came out of R2-F003 anyway — `EXPECTED_HOLDER_IDENTITIES` as an independent
source constant, with the precomputed audit result recorded in Step 2's Expected
and a note that changing the constant is a relicensing decision — is a better
result than either my finding or a plain decline would have produced.

## Findings

None.

## Required changes

None.

## Optional suggestions

None. I have nothing left that is worth a round trip. Two things I would keep an
eye on during execution rather than block on now, neither a plan defect:

- `src/cli/run.mjs` is extended by eight tasks and is declared a serialization
  point in the Global Constraints. That is the right call, but it also means the
  plan's recommended subagent-driven execution has a single-threaded spine. If
  parallelism matters more than expected in practice, splitting the command
  handlers into per-command modules behind a dispatch registry is the escape
  hatch, and it does not change any interface this plan pins.
- Task 14 Step 3's parity ledger is the only thing standing between "legacy tests
  deleted" and "equivalent standalone coverage exists". It is well specified, but
  it is a hand-maintained inventory. If it turns out to be thin when written, that
  is worth surfacing at the time rather than treating the ledger's own pass as
  sufficient evidence.

## Decision

`accepted`

The plan covers the ratified spec, orders its dependencies correctly, states
executable RED→GREEN steps with real commands and expected failures, keeps
interfaces consistent across tasks, holds the extraction and relicensing
boundaries behind fail-closed gates with human approval, keeps Phase 1
independently shippable without Tasks 16–18, migrates AITM through the published
package boundary under its own governed issue and attribution contract, and
isolates Phase 2 behind additive files and a dependency gate.
