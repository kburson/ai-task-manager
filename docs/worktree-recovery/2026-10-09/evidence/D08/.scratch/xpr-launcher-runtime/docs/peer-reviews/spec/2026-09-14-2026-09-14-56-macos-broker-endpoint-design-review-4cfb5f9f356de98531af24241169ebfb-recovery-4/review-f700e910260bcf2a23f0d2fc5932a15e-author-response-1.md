<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-f700e910260bcf2a23f0d2fc5932a15e"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "2d33eb2a044ee28ee0390484fda2536c967c80c8"
artifact_blob: "a11c29289193e65a36b98a66c3704c4bf925ec66"
artifact_digest: "sha256:5cc4427c2230b5bee0b4367b19fc798ec328b77bdcd87d09808f54fdcd7bf165"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:6fb402d9aaaee78b6d6cc7660d9c4397dcb9a9ba2810d0d15bb7cf930fc1d6ab"
  identity_source: "runtime"
started_at: "2026-09-14T17:11:45.990Z"
submitted_at: "2026-09-14T17:20:16.158Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the two mechanisms added in the prior round. Post-bind validation now
records the filesystem identity baseline and compares against it only at later
cleanup. The overlength recovery now selects only a validated endpoint parent;
lock and metadata authority stay under the platform cache, so every endpoint
selection for one resolved authority root still contends for one lock. The path
contract now gives a complete per-platform input-to-source mapping.

## Finding dispositions

1. Accepted. The immediate post-bind observation now verifies owner, socket
   type, and mode, then records the observed device and inode/file identity.
   Pre-cleanup revalidates those properties and compares against the baseline;
   no comparison is made with unspecified listener-descriptor fields.
2. Accepted by removing the cause. `AI_PEER_REVIEW_CACHE_HOME` was replaced
   with `AI_PEER_REVIEW_ENDPOINT_ROOT`, which relocates only the protected
   socket namespace. The full-digest lock and metadata remain under the resolved
   platform `cacheRoot`; brokers using different endpoint roots therefore
   contend for the same lock. The document also scopes mutual exclusion
   truthfully to one resolved authority cache and records the accepted epic's
   pre-existing same-cache-configuration requirement.
3. Accepted. A normative table now maps every macOS, Linux, and Windows input,
   source enum, invalid defined value, and creation policy. Relative or empty
   Unix configuration values fail `APR_BROKER_PATH_INVALID`, ratifying shipped
   Linux behavior; Windows ignores the endpoint-root variable because named
   pipes have no endpoint root.

Optional 1 is accepted as an explicit v1 orphaned-socket lifecycle. Optional 2
is accepted by recording both roots and source enums in discovery metadata.
Optional 3 is accepted by passing `paths.endpointDirectories` on Windows.

## Changes made

- Split stable authority `cacheRoot` from configurable POSIX `endpointRoot` and
  added complete source classifications.
- Defined exact invalid-input behavior and recovery attribution for each source.
- Kept the full-digest lock stable across endpoint-root choices and added the
  two-broker/different-root verification obligation.
- Replaced the impossible listener-descriptor identity comparison with a
  record-then-compare filesystem baseline.
- Expanded metadata, client validation, Windows call-shape, and orphan cleanup
  contracts.

## Declined changes and rationale

None.

## Verification

- Re-checked the full path-return shape, mapping table, owner and client flows,
  mutual-exclusion claim, failure taxonomy, and verification ownership for
  internal consistency.
- Ran
  `npx prettier --check docs/design/2026-09-14-56-macos-broker-endpoint-design.md`;
  it passed after formatting the table.
