<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-597f95fd88e73615a78d0fa74c6c131b"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "86f4501700c2ebfe307599cf1fb6c010c9ccbf18"
artifact_blob: "8a50527a88e5b537d3b0143cb737d93e2e2fda91"
artifact_digest: "sha256:2feefba2ab210df7efd117ddce2a65e5ac787c0861348bd46deeb2ea8a87664d"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:6fb402d9aaaee78b6d6cc7660d9c4397dcb9a9ba2810d0d15bb7cf930fc1d6ab"
  identity_source: "runtime"
started_at: "2026-09-14T16:53:56.326Z"
submitted_at: "2026-09-14T17:03:49.234Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the correction design to define one explicit cache-root trust anchor and
two equally protected, ordered directory chains. The revision keeps the selected
lowercase-base32 endpoint and all accepted byte-budget decisions unchanged. It
adds the authority-chain contract, handle-relative traversal, post-bind identity
comparison, complete POSIX verification assertions, and platform-specific Unix
socket limits.

## Finding dispositions

1. Accepted. The design now exposes a deeply frozen `authorityDirectories`
   chain, requires owner-only creation and complete owner/mode/type/no-symlink
   validation at each level, and names pre-existing and mid-lifetime failures.
2. Accepted. `<user-cache>` is now the explicit validated trust anchor. The
   design assigns absent or unusable roots to
   `APR_BROKER_CACHE_ROOT_UNAVAILABLE`, prohibits arbitrary ancestor creation,
   and assigns creation of every package-owned child level to Task 4.
3. Accepted. Both chains must be traversed relative to retained parent handles
   with no-follow semantics. After the unavoidable absolute `bind()`, the socket
   is compared by device/file identity, type, owner, and mode against the entry
   observed through the retained final-parent handle.
4. Accepted. POSIX verification now pins the exact ordered, deeply frozen
   `endpointDirectories` array and its prefix relation to the endpoint. The same
   explicit contract is added for `authorityDirectories` on all platforms.
5. Accepted. Darwin now uses 103 usable bytes and Linux 107; each boundary test
   accepts at its injected limit and refuses one byte over.

Optional 1 is clarified: normal release and authenticated stale reclamation
remove project socket leaves, while shared directories remain. Optional 2 is
accepted as an explicit residual `aipr` name-collision risk. Optional 3 is
accepted by naming the three superseded plan headings alongside their line
numbers. Optional 4 is accepted by declaring the pathname-layout and metadata
schema versions independent.

## Changes made

- Added `cacheRoot` and `authorityDirectories` to the corrected path return
  shape, including exact deep-freeze and ordering requirements.
- Defined cache-root validation and non-destructive failure behavior for macOS,
  Linux `XDG_CACHE_HOME`, and Windows authority paths.
- Required authority and endpoint children to be created/opened relative to
  retained parent handles and required a retained-parent post-bind identity
  check.
- Added `APR_BROKER_CACHE_ROOT_UNAVAILABLE`,
  `APR_BROKER_AUTHORITY_PARENT_UNSAFE`, and
  `APR_BROKER_AUTHORITY_PARENT_LOST` failure contracts.
- Corrected Linux's production limit to 107 usable bytes and expanded the unit
  verification contract for both path arrays.
- Clarified version independence, the short-name collision risk, stable shared
  directories, and superseded-plan anchors.

## Declined changes and rationale

None.

## Verification

- Re-read the accepted epic design, accepted implementation plan, shipped
  `src/broker/paths.mjs`, and current broker-identity tests at the cited
  contracts.
- Recomputed the unchanged macOS 91/103/104 byte values and confirmed the Linux
  `sun_path[108]` contract is expressed as 107 usable bytes.
- Ran
  `npx prettier --check docs/design/2026-09-14-56-macos-broker-endpoint-design.md`;
  it passed.
