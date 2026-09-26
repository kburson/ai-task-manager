<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-b9cd498c93d682cc35e5a079769beb15"
role: "reviewer"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-26-1818-graphql-usage-measurement-spike.md"
artifact_commit: "4c1c6108d0b6ca984dd53ff824aa90add063b501"
artifact_blob: "4a9294ab0a40add36b5cc21d2c4f13b7419dbf35"
artifact_digest: "sha256:6f81850f5aee5b6040c59808637e6f46a0d8d8bbd3b5c7c1351d1b81164a6666"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:3a1cd530e39a6373b7da2e38bb82b90fbdaecb8ad3128115642a08d9088cc3a3"
  identity_source: "declared"
started_at: "2026-09-26T17:46:39.896Z"
submitted_at: "2026-09-26T18:19:17.199Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Accepted. Both round 2 findings are resolved in the artifact, not just in the
author response. I re-read the revised plan at 4c1c6108 in full and confirmed
each new bullet lands in the task the finding named, with the constraint text
the finding asked for rather than a weaker paraphrase. Nothing that was already
sound regressed, and the revision introduced no new unowned outputs of the kind
R2-F001 flagged.

The two defects were different in character and both closed cleanly. R2-F001
was an owned output with no input: Task 4 reported `x-ratelimit-*` budget
context that no task captured, and the obvious implementer shortcut was the
`gh --include` stdout-contract change the spec forbids. The fix encodes the
asymmetry explicitly — direct HTTP adapters capture headers, shim records carry
a transport-unavailable reason, and the no-`--include` prohibition is written
down where the implementer will read it. R2-F002 was my round 1 coverage miss:
three spec requirements with no owning task. The author gave all three owning
bullets rather than taking the deferral escape hatch I offered, which is the
stronger outcome.

Verified by reading the revised plan in full against the ratified spec's
Instrumentation, Storage, and Reporting-and-baseline sections. Read-only: no
tests run, no Git command run, artifact not edited. Protocol mode is `normal`;
authority assurance is `unavailable`.

### Round 2 dispositions verified

- **R2-F001 fixed.** Task 3 lines 310-314 add the capture bullet with all five
  headers named (`x-ratelimit-limit`, `remaining`, `used`, `reset`,
  `resource`), scoped to "direct HTTP adapter responses only," and carry both
  halves of the constraint: shim-observed records write an explicit
  transport-unavailable budget reason, and `--include` or "any flag that alters
  stdout contracts" is prohibited outright. Task 4 line 375-376 closes the
  reporting side — shim-only budget data renders as transport-unavailable, "not
  zero or blank" — and line 382-383 adds the shim-only budget fixture. The
  report bullet now has a real input, and the empty-section discharge is no
  longer available.
- **R2-F002 fixed, all three, with owning bullets rather than deferrals.**
  - *Owner-only permissions:* Task 2 line 248 folds "owner-only directory/file
    permissions where supported" into the writer-markers bullet. Correct owner —
    it sits with the code that creates the directory and files.
  - *Retention and cleanup:* Task 2 lines 250-253 give cleanup its own bullet
    with all four spec elements: retain until operator-directed cleanup after
    export, exclude active writers, disclose removed observation intervals, and
    mark cleanup or pause as coverage gaps. The active-writer exclusion is the
    clause that matters for the file-per-process-incarnation storage model, and
    it is stated rather than implied. Task 4 line 383 carries the matching
    cleanup-removed-intervals fixture, so the disclosure has a reporting-side
    test.
  - *Readable extent:* Task 4 lines 379-380 require snapshotting each file's
    readable extent "before parsing," and line 383-384 adds active-writer
    readable-extent fixtures. Placed alongside the existing partial-final-line
    handling at line 368 without conflating the two mechanisms, which is the
    distinction the finding turned on.
- **Optional 1 and 2 taken.** `augmentation version` is now a schema field at
  line 188. The Traceability Map is current: the Task 4 verifier row (line 148)
  adds unavailable budget and readable extents, and the Task 3 row (line 147)
  picked up header-capture, which I had not asked for and which is the right
  addition.

## Findings

None.

## Required changes

None.

## Optional suggestions

1. Estimates are still 46 hours parent total (7 + 9 + 10 + 9 + 11), unchanged
   across two revision rounds while Task 2 absorbed cleanup semantics and Task 4
   absorbed budget rendering and extent snapshotting. I raised this in round 2
   and the author did not take it; restating once for the record, not as a
   reopened concern. The defensible reading is that these were always implicit
   spec obligations and the estimates priced the spec, not the bullet count. If
   the child estimates are load-bearing for scheduling, Task 2 at 9 hours now
   carries cleanup with active-writer exclusion, which is real concurrency work.
   The author response also lists no declined changes while leaving this one
   untaken; a one-line note either way would make the record cleaner. Neither
   affects hydration correctness.
2. `budgetScopeId` appears in the Task 1 schema (line 187) and in Task 4's
   reporting bullet (line 375) but no bullet states how it is derived. I am
   deliberately not making this a finding: unlike the header case, there is no
   spec-forbidden shortcut waiting for the implementer, because Task 3's
   no-extra-GitHub-call tests (lines 316-317) already block the one hazardous
   derivation path — a token-identity lookup. Host-plus-known-scope derivation
   from data already in the record is the remaining option. Worth a sentence at
   Task 3 deep dive rather than a plan edit.
3. Parent AC5 (lines 76-78) enumerates the report's contents but does not
   mention cleanup-removed intervals, which are now a disclosed coverage gap
   under Task 2 line 252. AC6 (lines 79-81) covers collection gaps generally, so
   the requirement is not lost, only less visible at the parent gate. Summary
   surface, low stakes.

## Decision

accepted
