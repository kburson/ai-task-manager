<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-6b3d9911feadd5d18165eb56cbdcc48f"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "66b3beb69d12e3f431facc57bb2ed0084431601a"
artifact_blob: "385830367b2acfa0ab0f34c9cb95e3bc7b9afa29"
artifact_digest: "sha256:a3f0d359c5de496a408e3760a919cea37481c10a15f6b6f575dc1e3746ed484a"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:6fb402d9aaaee78b6d6cc7660d9c4397dcb9a9ba2810d0d15bb7cf930fc1d6ab"
  identity_source: "runtime"
started_at: "2026-09-14T17:35:06.523Z"
submitted_at: "2026-09-14T17:53:43.557Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Completed the client-ordering and canonical-path contract. A client now checks
stable authority metadata for a root mismatch before touching endpoint
directories, never creates those directories, and reports the existing startup
failure when an otherwise matching safe directory is absent. Root syntax,
comparison, constant ownership, path-error attribution, and the complete hostile
path/fencing verification handoff are explicit.

## Finding dispositions

1. Accepted. The client now opens only the authority cache, observes live lock
   and metadata, and compares roots before opening or traversing its endpoint
   root. It never creates endpoint or authority directories. Safe absence without
   a mismatch produces `APR_BROKER_START_FAILED`: owner election when unlocked,
   named owner reconciliation when locked.
2. Accepted. The Failure behavior entry is now presence-independent and occurs
   before traversal or connection, explicitly treating metadata as diagnostic
   evidence rather than routing authority.
3. Accepted. Roots are canonical absolute paths without trailing separators or
   dot components, symlinks are never resolved, and equality is byte-exact UTF-8
   and case-sensitive. Noncanonical input and case-only mismatch tests are
   required, making the 42/43 and 46/47 byte tests determinate.
4. Accepted. Added explicit ancestor-chain, every-level unsafe-condition,
   shared/leaf loss-fencing, and client-never-creates test obligations.
5. Accepted. `APR_BROKER_PATH_INVALID` now enumerates every path/digest trigger,
   requires exact input labels, and has per-variable verification.

Optional 1 is accepted through `endpointLayoutVersion` and
`maxEndpointRootBytes` path-layer outputs. Optional 3 is accepted as an explicit
Non-goal. Optional 2 was already made non-destructive; the final per-user
foreign-root recovery wording will be carried into #43's offline explain entry.

## Changes made

- Reordered client mismatch diagnosis ahead of all endpoint-root access.
- Defined absent-directory owner-election/reconciliation outcomes with no client
  filesystem mutation.
- Added canonical root syntax/equality and path-layer-owned layout/budget values.
- Expanded Failure behavior for mismatch and path-invalid cases.
- Added hostile ancestor, parent-unsafe, parent-lost, case, absence, and exact
  input-attribution verification requirements.

## Declined changes and rationale

None.

## Verification

- Traced the revised client sequence from path preflight through lock/metadata
  comparison, endpoint traversal, and owner-election fallback.
- Checked every normative unsafe/lost/path-invalid rule has a matching
  verification obligation.
- Ran Prettier over the revised design.
