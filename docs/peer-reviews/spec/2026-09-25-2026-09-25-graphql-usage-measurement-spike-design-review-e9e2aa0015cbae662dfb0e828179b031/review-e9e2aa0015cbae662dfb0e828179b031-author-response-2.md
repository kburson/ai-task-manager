<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-e9e2aa0015cbae662dfb0e828179b031"
role: "author"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-25-graphql-usage-measurement-spike-design.md"
artifact_commit: "f617955dea4f6a1ecaf32abef1713cf4a9ab270e"
artifact_blob: "54e3924606d0d73eda0437dfff723d261b535a7d"
artifact_digest: "sha256:e10efe146cb3a2b8b718716d2338a7e505dfaaeee40f39a55ca90c3ac3b9b045"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:290f380b468b3c8b3ed7fcb5ee7a936dccade3481b185d9c0614cd38f3826e76"
  identity_source: "runtime"
started_at: "2026-09-25T21:12:37.511Z"
submitted_at: "2026-09-25T21:49:52.483Z"
finding_ids: []
answered_finding_ids: ["R2-F001","R2-F002","R2-F003"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Accepted all three findings. The revision propagates measurement session context
through the shared shim, explicitly accepts and measures per-invocation file
overhead, bounds process-tree enrollment caching, and sets a conservative point
ranking gate with a declared volume fallback.

## Finding dispositions

- **R2-F001 — Accepted.** The usage bootstrap now propagates session, source,
  worktree, enrollment, and route metadata. Trustworthy runtime session IDs are
  normalized/hashed; otherwise the launcher creates one measurement-session ID
  for its child tree, explicitly distinguished from an agent session. Nested
  bootstraps preserve it, separate sessions differ, and an invocation ID never
  substitutes for a session. Manifest joins use the same IDs. Missing/unmatched
  context remains unknown. AC3 now specifically exercises shim-collected shell
  and synchronous traffic, including two sessions sharing one worktree.
- **R2-F002 — Accepted.** Retain one uniquely named file per writer incarnation,
  including short-lived shims, and expressly forbid cross-process appends to a
  shared session file. Add retained file count and soft-cap warnings alongside
  bytes, plus report file-open count and elapsed read time. Cache enrollment in
  inherited process-tree environment, not in an inaccessible shared-root file.
  Define a maximum 60-minute validity and binding to session/root/version/runtime
  permission context; missing/malformed/expired context reprobes. A new sandbox
  requires fresh enrollment. Actual writes remain fallible; a stale success does
  not establish ongoing availability or global invalidation across children.
- **R2-F003 — Accepted.** Require 100% complete coverage for every operation in
  the predeclared candidate group before total-point ranking. Recorded-row
  percentages alone cannot hide missing attempts, uncovered sites, or collection
  gaps. Below the gate, state point-prioritization insufficiency and use declared
  comparable volume groups; if volume is also inadequate, the group is preliminary.
  A smoke run and inventory expose feasibility before the long baseline. Goals now
  explicitly lead with volume; known-point lower bounds remain useful supplemental
  evidence without claiming unmeasured point savings.

## Changes made

The specification also incorporates all three optional suggestions: AC3's storage
health is established by the AC9 probe in the same permission context; collection
now names the shim as the primary boundary; and observations carry launch-route
provenance, including originating route for inherited environments. It explicitly
says such metadata corroborates observed traffic but cannot prove bypass absence.

## Declined changes and rationale

No finding was declined. Chose process-isolated files rather than shared append
files: measured overhead and bounded-run warnings preserve the existing simple
concurrency guarantee without adding a daemon, compactor, or locking subsystem.
Chose a 100% complete-coverage gate rather than an arbitrary lower percentage:
without bounded unknown costs, even a small missing share can reverse rankings.
The declared volume fallback makes the spike useful while keeping that limitation
visible. Candidate groups cannot be narrowed after the run merely to pass the gate.

## Verification

The review accurately identifies the current bootstrap fields in
`action-capture.mjs:216-225`; they contain invocation context but no usage session.
The new propagation/caching contract is specified implementation work, not a claim
that those fields already exist. Rechecked the shim's process-per-invocation shape
and normal-exit completion against the preceding round's code evidence.

Before submission, the revised specification is checked with Prettier, repository
Markdown rules, and `git diff --check`; the editable response body is linted
separately from package-protected metadata. Only the spike specification and this
pending author response were edited. No runtime tests or live GitHub calls are
claimed for this documentation revision. The package owns submission and commit.
