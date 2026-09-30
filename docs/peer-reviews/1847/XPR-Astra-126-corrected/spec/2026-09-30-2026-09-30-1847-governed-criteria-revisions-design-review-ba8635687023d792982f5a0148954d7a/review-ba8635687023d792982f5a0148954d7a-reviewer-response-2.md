<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-ba8635687023d792982f5a0148954d7a"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md"
artifact_commit: "042ed2d8fb002feeda3771a85761ab5d27dcb8b7"
artifact_blob: "b59ceeb96c1248d6ae3157546b3bfaabbb502ac9"
artifact_digest: "sha256:d00af99b2b2cdc1c67bb19b2010afdbd4236d5b35154a382564d0c7d59eb573f"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5-5"
  model_display: "claude-opus-5-5"
  session_fingerprint: "sha256:9ab594da82e932c23d67af728809f0f2d2f4128f616ae2d30fdd407809de45b5"
  identity_source: "runtime"
started_at: "2026-09-30T08:23:55.073Z"
submitted_at: "2026-09-30T08:33:45.757Z"
finding_ids: ["R2-F001"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Round-2 independent review of the revised artifact at blob `b59ceeb9` (digest
`sha256:d00af99b…`), against the author's round-1 dispositions and the live
baseline.

Method: full re-read of the revised specification, then a read of
`author-response-1.md`. I checked the author's new baseline claims directly:

- `scripts/task-tracker/verbs/demote.mjs:3-12, 139-160` confirms the only backward
  paths are Test→Develop and Review→Develop. Both require `--rework "<reason>"`,
  and no Develop→Plan demotion exists. The author's removal of the nonexistent
  demotion advice is correct.
- `authority-resolver.mjs:115-118` trims each `input_text` block before joining
  and hashing. The author's point is correct: raw whole-message equality cannot
  be enforced from normalized loader output alone. The added raw single-block
  validation is necessary, not redundant.

Round-1 findings:

- **R1-F001 — resolved.** The spec now has a 60,000 UTF-8-byte single-comment
  cap, and UTF-8 bytes ≥ characters, so the cap is conservative against
  GitHub's 65,536-character limit. The spec also adds:
  - a read-only `prepare` refusal (`revision-archive-too-large`);
  - an explicit statement that the 1 MiB envelope bound cannot authorize
    publication;
  - a budgeted terminal event;
  - definite-absence versus uncertain-publication handling;
  - exact-cap, one-byte-over, and non-ASCII tests;
  - a Refine obligation to measure the #124-shaped archive.

  Declining multipart storage is a legitimate choice of option (b).
- **R1-F002 — resolved.** The statement is now one line with fixed spacing,
  proposal-mode vocabulary, no terminator, and whole-message byte equality.
  `observedResourceVector` is a closed proposal field: null for `revision` and
  required for recovery modes. It is covered by `proposalDigest`, and tests
  cover refusal of extra prose, extra blocks, and mismatched vectors.
- **R1-F003 — resolved in substance** via option (b): Develop apply immediately
  blocks `WRITE_CODE`, `COMMIT_CODE`, proof generation, and exit, and a bounded
  in-Develop reapproval path handles the rest. Being honest that criteria-only
  Test/Review revision is unsupported, rather than fabricating rework, is the
  right call.

The option (b) resolution adds one new consumer on a hot path, and the spec does
not say how that consumer obtains revision state. That gap is the only
remaining material finding.

## Findings

### R2-F001 — Develop activity admission has no specified source of revision state

The new consumer-table row "Develop activity admission" requires refusing
`WRITE_CODE`, `COMMIT_CODE`, and proof generation while an applied revision lacks
current revision-bound Plan approval. `WRITE_CODE` and `COMMIT_CODE` are decided
by the PreToolUse activity guard on every Edit/Write/Bash call.

At baseline, that guard is purely local. `activity-guard.mjs:110-119` derives
state from `readBoundState(projectRoot, …)`, and the file imports no GitHub
client. Its only reads are local files: stdin, bound state, and
`task-tracker.json`.

Elsewhere, the specification requires revision state to come from a fully
paginated, fully validated event-chain read. Incomplete reads are indeterminate,
and "a protected body pointer ... cannot replace chain validation". Taken
literally for this consumer:

- every Develop-stage tool call for every bound issue, including issues that
  have never been revised, must page through GitHub comments to prove there is
  no applied revision with stale approval. Absence of the body pointer cannot
  prove absence, because ungoverned edits can remove it.
- any network failure makes the hook indeterminate. Under fail-closed rules,
  that blocks all Develop code editing whenever GitHub is slow or unreachable.
- "Share one complete paginated observation within each gate invocation" does
  not help. Each hook call is a separate invocation, and the spec forbids reuse
  across invocations as fresh authority.

The alternative is a local projection. The spec neither defines one nor names
its trust and staleness rules. An implementer is left to choose among three
options:

- network reads in the hook: latency plus fail-closed outages;
- a local cache with unspecified freshness, which is a silent-bypass risk if it
  is stale after another linked worktree applies a revision;
- skipping the check in the hook, which reopens the R1-F003 interval.

The "Budget this read cost at Refine" sentence defers the cost but not the
design decision. This is the only consumer that runs per tool call rather than
per lifecycle gate.

**Required:** specify the revision-state source for Develop activity admission,
for example:

- a local revision-admission projection under the registered common Git
  directory, written only by `criteria-revise apply/recover` and the Develop
  reapproval path under the strict interlock. Linked worktrees see it
  immediately. Its absence or corruption for a bound issue in a revision-enabled
  domain fails closed, and it is re-derived from the full chain at bind time and
  at every lifecycle gate. Each authoritative gate still performs full chain
  validation.
- or an explicit statement that the hook performs a bounded chain read, with
  stated fail-closed behavior and acceptance of that outage cost at Refine.

State which one applies, how a never-revised issue is admitted cheaply without
weakening the "pointer cannot prove absence" rule at authoritative gates, and
add one interleaving test: a revision is applied from linked worktree A while
worktree B holds a Develop binding for the same issue, and B's next code write
is refused.

## Required changes

1. Specify how Develop activity admission, a per-tool-call consumer, obtains
   revision and stale-approval state. Give its freshness and fail-closed rules,
   how never-revised issues are admitted, and add the cross-worktree interleaving
   test. (R2-F001)

## Optional suggestions

1. **Bound the authorization-source ID lengths used in the terminal budget.**
   `validateAuthorizationSource` restricts the `sessionId` and `messageId`
   character classes but not their length (`authority-resolver.mjs:36-38`). The
   terminal event budget assumes "bounded fixed-format hashes/IDs". Recovery
   events and terminals carry authorization provenance whose size depends on
   host-issued IDs. Either cap those lengths in the revision schema or budget the
   worst case explicitly, so a long host ID cannot push a pre-budgeted terminal
   event over 60,000 bytes after durable preparation.
2. **Original-session resume statement.** "A recovery in the original session
   may reuse the original approval" implies resuming the original operation
   without a new `resume`-mode proposal, since a new proposal would carry a new
   digest and mode. Say so explicitly, so implementers don't mint a `resume`
   proposal that then fails to match the original `revision`-mode statement.
3. **Formatting.** The Develop activity-admission row (line 665) and the
   Test/Review stage row (line 228) break table column alignment, and line 351
   runs well past the wrap width. Prettier will reflow these, but fixing them
   keeps the committed artifact's digest stable across format passes.

## Decision

revisions-requested
