<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-eb1be65b9cdf02d104b74a5db558e7be"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "63d97aff0225ea28c46e668efcb87fa88383d6e7"
artifact_blob: "07b56298b851927826278d8c78ee2e0ddec47a5b"
artifact_digest: "sha256:3156738879af852cf4d0a0b1c05ab5ab90dd7ee806e6a46a73d1258cf3433a47"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:6fb402d9aaaee78b6d6cc7660d9c4397dcb9a9ba2810d0d15bb7cf930fc1d6ab"
  identity_source: "runtime"
started_at: "2026-09-14T18:25:56.540Z"
submitted_at: "2026-09-14T18:33:32.753Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

The revision separates bind-time observations, specifies a non-destructive
already-bound outcome, preserves unknown-layout predecessor evidence, and
rejects unusable endpoint limits before path derivation. It also removes the
endpoint-root recovery ambiguity and closes the reachable missing-socket client
case.

## Finding dispositions

- Finding 1 — accepted. Post-bind identity and secure-ready observations now
  have distinct timing, predicates, and baseline duties.
- Finding 2 — accepted. Bind-time already-bound results now produce the new
  `APR_BROKER_ENDPOINT_COLLISION` stable error, never trigger reclamation, and
  preserve the losing owner's startup evidence.
- Finding 3 — accepted. The prohibited input is now explicitly a
  caller-selected endpoint pathname; supported endpoint-root relocation remains
  the sole recovery for another account's legitimate parent.
- Finding 4 — accepted. Unknown predecessor layouts are neither derived nor
  traversed and survive in the new owner's unreconciled metadata.
- Finding 5 — accepted. POSIX limits below 63 bytes fail before derivation; the
  62/63 boundary is pinned in verification.

## Changes made

- Defined a post-bind identity observation before `chmod` that verifies
  owner/type and zero group/other permission bits while recording provisional
  device/inode identity.
- Defined a secure-ready observation after retained-parent `chmod` that compares
  identity and requires exact `0600` before metadata can become `ready`.
- Added `APR_BROKER_ENDPOINT_COLLISION`, including fail-closed `EADDRINUSE`
  behavior, diagnostic annotation of the losing `starting` record, lock release,
  recovery, and a forced-interleaving test.
- Added owner-side unknown-layout preservation and its verification case.
- Added the minimum valid POSIX limit calculation and exact boundary test.
- Adopted all optional clarifications: the three situation-selected
  `APR_BROKER_START_FAILED` recoveries, present-directory/absent-socket handling,
  the deliberate case-spelling false positive, and the pre-release limitation
  on measuring cache-eviction frequency with the defined operator response.

## Declined changes and rationale

None.

## Verification

- Rechecked each described interleaving against the lock, metadata, bind, and
  client sequencing in the correction.
- Ran `npx prettier --check` on the correction and this author response.
- Ran `git diff --check` and scanned for superseded ambiguous phrases and error
  counts.
