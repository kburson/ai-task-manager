<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7e25eb3b042cddffce22259d099bbdc0"
role: "reviewer"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-12-project-local-review-lifecycle-and-learning-design.md"
artifact_commit: "239de38c342c30694b6787ef8267274b464324c5"
artifact_blob: "f536ac2ec72e3398a2944a247565fb7237e57adb"
artifact_digest: "sha256:d40a8669d587735fcfa07102f0df315943a55950846e1224607097ccdc64faa9"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:e695305c03883b31f3248485f807eb24d3748e04e9ead5211ce5981aba7655d7"
  identity_source: "runtime"
started_at: "2026-09-12T23:40:48.388Z"
submitted_at: "2026-09-12T23:43:04.571Z"
finding_ids: ["R1-F001","R1-F002"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revisions requested for one remaining coordination gap. The lifecycle,
no-commit, successor-artifact, and predecessor-commit receipt rules are coherent
at the design level. The clone-wide mutation lease addresses simultaneous
reviewer reasoning, but its stated activation point leaves an unprotected gap
between an author handoff and the next reviewer resume. One optional retrieval
guard would also make the committed-snapshot implementation safer.

Reviewed the complete pinned design at commit
239de38c342c30694b6787ef8267274b464324c5 and digest
sha256:d40a8669d587735fcfa07102f0df315943a55950846e1224607097ccdc64faa9,
current 0.2.2 protocol source, and the prior review dispositions. This is design
assessment, not implementation approval or validation of the future phases.
Normal commit mode applies; the protocol reports human-authority assurance as
unavailable. The reviewer used its distinct runtime session and verified model
metadata. No direct Git commands, artifact edits, commits, or pushes were made.

## Findings

### R1-F001 — High: Protect the sealed handoff before the reviewer resumes

**Design references:** Concurrency, lines 717–735; protocol parity, lines
995–1004; SQLite concurrency verification, lines 1100–1105.

The proposed lease registers an active reviewer interval when joining or
resuming a reviewer turn. Current protocol authority establishes the next
reviewer's boundary earlier: author submission captures the repository boundary
at [run.mjs:2672](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/src/cli/run.mjs:2672)
and seals it in the author-revision event at
[run.mjs:2692](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/src/cli/run.mjs:2692).
[Reviewer submission](/Users/kpburson/projects/Vibe-Coding/ai-peer-review/src/cli/run.mjs:1833)
requires the current retained refs to equal that sealed boundary. Resume does
not create a fresh boundary.

A concrete two-worktree schedule exposes the gap:

1. Both reviewers finish their first turns and both authors prepare revisions.
2. Author A submits its revision, sealing reviewer A's next boundary, then
   releases the mutation lease. Reviewer A has not resumed yet.
3. Author B acquires the lease and commits. Under the stated registration rule,
   no reviewer interval is active, so this mutation is permitted.
4. Reviewer A resumes and submits against the already sealed boundary. B's ref
   change makes A fail with APR_REVIEWER_GIT_VIOLATION despite obeying the new
   coordination policy.

This is narrower than the earlier finding about simultaneous active reviewers:
the proposed active-interval test does not exercise delayed handoff delivery.
Starting the interval only at resume cannot preserve the current seal.

**Required resolution:** Define protection from the instant the authoritative
reviewer boundary is installed, including author-to-reviewer handoffs. Install
that protection before releasing the same clone-wide mutation lease, and make
initial join registration atomic with its boundary capture. State when a sealed
interval ends and how suspension or interrupted delivery preserves it until
submission or governed intervention. Resume must not silently rebaseline refs.
If a different seal timing is intended, explicitly specify and prove that
protocol change instead. Add the delayed-resume schedule above to Phase 2
conformance tests, including interruption after the handoff seal but before
reviewer activation. No broader branch exclusion is needed.

## Required changes

1. Resolve R1-F001 by covering the complete sealed reviewer interval, including
   pending handoffs, and add the delayed-resume concurrency test.

## Optional suggestions

### R1-F002 — Isolate ranking statistics as well as eligible case IDs

**Design references:** Snapshot membership, lines 712–715; retrieval, lines
786–804; reproducible-context verification, lines 1118–1125.

The design correctly requires committed snapshot membership and reproducible
context. Carry that requirement into the ranking statistics: a shared FTS5
index followed by a snapshot-membership filter is insufficient. SQLite's
[bm25 documentation](https://www.sqlite.org/fts5.html#the_bm25_function)
defines scoring using statistics from the complete FTS table.

An in-memory SQLite check kept eligible rows 1 and 2 fixed as `alpha alpha beta`
and `alpha beta beta`, queried `alpha OR beta`, and filtered to those two rows.
Adding 100 outside-snapshot `alpha` rows ranked case 2 first; replacing only
those outside-snapshot rows with 100 `beta` rows ranked case 1 first. A top-one
budget would therefore change the selected context without changing eligible
case bytes or the query. This is an implementation hazard, not evidence that a
future implementation already violates the design.

Specify that all scoring inputs and tie-breakers must derive from the pinned
snapshot and recorded query/configuration, or use a scoring method independent
of the rest of the clone's corpus. Add a test comparing retrieval in a fresh
clone with retrieval after unrelated branch events have been indexed. This can
remain a Phase 3 implementation-plan obligation.

## Decision

revisions-requested
