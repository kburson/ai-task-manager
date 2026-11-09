<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-4c2e7644422e7a83591a649374cb1afc"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "588735b9e095d524185ca16109e684853a580ace"
artifact_blob: "7e2e5dbd073e6aa78b7facc20c141e769996a49e"
artifact_digest: "sha256:c8a79b34db5435582a1f192b1ae27a8025027fa0c8456aa57153fb34e7b9c1ee"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:6fb402d9aaaee78b6d6cc7660d9c4397dcb9a9ba2810d0d15bb7cf930fc1d6ab"
  identity_source: "runtime"
started_at: "2026-09-14T18:04:13.950Z"
submitted_at: "2026-09-14T18:11:28.114Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Defined the remaining owner-recovery, socket-mode, and integration-test edges.
An unreachable superseded root is now non-blocking but durably diagnosed, Unix
socket entries must be exactly `0600`, and real-home macOS tests use the supported
configured production root only when the default correctly reports overlength.
Budget values are carried by the error rather than copied literals.

## Finding dispositions

1. Accepted with proceed behavior. A lock-holding owner records an absent,
   unreachable, or unsafe superseded root and exact condition in current
   metadata, touches nothing there, and proceeds at its valid root. Clients route
   only from explicit configuration, so the unreachable former root cannot
   become authority. Tests cover absent and unsafe prior roots.
2. Accepted. POSIX socket entries are set through the retained parent to exactly
   `0600` before `ready`; platforms unable to enforce or observe that value fail
   closed. Post-bind tests assert the exact mode.
3. Accepted. The macOS integration test binds the real default production path
   when it fits. On long-home accounts it first proves the exact overlength
   recovery, then binds the production path derived from a validated configured
   endpoint root; unrelated substitution remains forbidden.
4. Accepted. `APR_BROKER_ENDPOINT_TOO_LONG.details` carries the path-layer
   `maxEndpointRootBytes` value.

Optional 1 is accepted: unknown non-null layout versions take precedence in
both `starting` and `ready`. Optional 2 is accepted by returning and recording
`null` layout version/budget on Windows, decoupling its unversioned named-pipe
label.

## Changes made

- Added non-blocking, diagnostic-only superseded-root reconciliation failure.
- Required deterministic exact-`0600` socket enforcement and observation.
- Made the macOS real-home integration path valid for both fitting and long-home
  environments.
- Added derived budget error details and platform-specific layout scalar rules.

## Declined changes and rationale

None.

## Verification

- Checked prior-root failure cannot authorize traversal, cleanup, or client
  routing.
- Checked socket mode, metadata publication, and integration-test ordering.
- Ran Prettier over the revised design.
