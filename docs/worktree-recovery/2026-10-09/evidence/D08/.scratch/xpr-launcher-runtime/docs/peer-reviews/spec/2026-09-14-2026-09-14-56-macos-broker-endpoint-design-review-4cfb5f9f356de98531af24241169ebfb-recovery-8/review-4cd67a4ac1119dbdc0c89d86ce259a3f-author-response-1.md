<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-4cd67a4ac1119dbdc0c89d86ce259a3f"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "f7454015f22b80b382af6003ca91643c62974264"
artifact_blob: "091b3f07b34992a71f1a23b4431abf3a17a74338"
artifact_digest: "sha256:fcc8762927a9569f900b7712601265025624a1e952368a6e861959cda3e23350"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:6fb402d9aaaee78b6d6cc7660d9c4397dcb9a9ba2810d0d15bb7cf930fc1d6ab"
  identity_source: "runtime"
started_at: "2026-09-14T17:53:58.352Z"
submitted_at: "2026-09-14T18:04:03.155Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Unified canonicality across every root input and made broker metadata publication
an explicit lock-instance-bound state machine. Clients now distinguish stale,
starting, incompatible-layout, ready-root-mismatch, and safe-absence outcomes in
that order. The path layer owns layout version and endpoint-root budget scalars,
and POSIX tests assert them directly.

## Finding dispositions

1. Accepted. Every table row now rejects trailing separators plus `.` and `..`
   components, with canonicality described as extending shipped behavior. The
   Failure and verification sections name all four root inputs and exact labels.
2. Accepted. Metadata carries the lock instance, nonce binding, and
   `starting`/`ready` state. The owner publishes current `starting` metadata
   before bind and `ready` before accepting clients. Clients prove currency
   first; stale instance/nonce produces integrity failure, current `starting`
   produces startup failure, and only current `ready` reaches mismatch or IPC.
3. Accepted. Current `ready` metadata with an unknown layout version produces
   existing `APR_BROKER_INCOMPATIBLE` with upgrade guidance before root
   comparison, traversal, or owner-election advice.
4. Accepted. POSIX verification now pins `endpointLayoutVersion: 1` and exact
   Darwin/Linux `maxEndpointRootBytes` values.

Optional 1 is accepted through the two path-layer scalar outputs. Optional 2 is
accepted with explicit per-user-root guidance already in the unsafe-parent
recovery. Optional 3 is accepted by rejecting POSIX `/` as an unrepresentable
owner-only root. Cache-eviction blast radius is now documented explicitly.

## Changes made

- Expanded canonical input validation and exact-label tests across home, XDG,
  Windows local app data, and endpoint-root inputs.
- Added lock-instance-bound metadata publication and client precedence.
- Added unknown-layout incompatibility behavior and crossover-window tests.
- Added path-layer-owned layout/budget fields and exact POSIX assertions.

## Declined changes and rationale

None.

## Verification

- Checked the input table, general canonicality rule, Failure behavior, and test
  list are single-sourced and consistent.
- Traced prior metadata through lock acquisition, `starting`, bind,
  post-conditions, `ready`, and client acceptance.
- Ran Prettier over the revised design.
