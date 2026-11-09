<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-ac3e35c32b02cc36dbbf5bebb20c0a70"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "e075f4e3dae0be5d0e444357e6727ee98d16a577"
artifact_blob: "1e2f5965ba3b468d84ef1806f55280df3ee31c6c"
artifact_digest: "sha256:93045bf8ed914ae17ef4ed181bad2bf0cb53acf0156b8fa155dffb0300aa3e2d"
agent:
  host: "grok"
  provider: "xai"
  model_id: "grok-4.6"
  model_display: "Grok 4.6"
  session_fingerprint: "sha256:6e38e20db3f9790942d546708b8e4ed7fed8b07c4f9ed8b10603bdb0ec52c1cb"
  identity_source: "runtime"
started_at: "2026-09-19T21:08:22.756Z"
submitted_at: "2026-09-19T21:21:52.183Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Re-reviewed the updated artifact `docs/design/2026-09-14-56-macos-broker-endpoint-design.md` (blob `1e2f5965ba3b468d84ef1806f55280df3ee31c6c`) against sealed author response 1 and the two R1 findings plus both adopted optional closures.

R1-F001 is closed. The `Supersedes` clause now names accepted design 253–254 and plan line 213. Handshake is no longer in the remain-in-force list; it is the expanded closed set specified here. The JSON field set is the full root tuple, package version, broker protocol version, Node major, authority `cacheRoot`, instance ID, and nonce proof, with kernel-reported peer user compared outside that payload. Missing `cacheRoot`, unknown fields, truncation, wrong project, and version mismatch fail closed with the existing broker-integrity error. `cacheRoot` is never inferred from the socket pathname or metadata. Verification requires that omitting `cacheRoot` or adding an extra field never yields `APR_BROKER_AUTHORITY_CACHE_MISMATCH`.

R1-F002 is closed. CACHE_MISMATCH and COLLISION recoveries converge `home` on macOS, `XDG_CACHE_HOME` or `home` on Linux, and `%LOCALAPPDATA%` on Windows. COLLISION adds `AI_PEER_REVIEW_ENDPOINT_ROOT` on POSIX only. Windows offline `explain` coverage for both errors must name `%LOCALAPPDATA%` and must not instruct setting `AI_PEER_REVIEW_ENDPOINT_ROOT`.

Both optional closures are present. Plan line 199 is replaced by a closed Task 4 interface list that restates `canonicalPath`, `userId`, `openPrivateRoot`, `openPrivateDirectory`, `acquireExclusive`, `listenPrivate`, `peerUser`, the lock object, `acquireBrokerOwnership`, `connectBroker`, and the version shape. Plan line 212 remains except for the named absolute Unix bind exception.

No remaining required defects.

## Findings

None.

## Required changes

None.

## Optional suggestions

None.

## Decision

accepted

