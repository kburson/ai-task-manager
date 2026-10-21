<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-ac3e35c32b02cc36dbbf5bebb20c0a70"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "ce566ab6b16da78b546d184eb6862e601d0f5387"
artifact_blob: "4cb0d0b2a1add9d6367d89dbdf0809be65c39d7e"
artifact_digest: "sha256:ae5b023ce0d532cf6a9d45273b9bce71f035bf56a8423f57c141de74f36dc463"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:3bd3e9cf6b8ebe6381a4f334650949f3cbd50618b88511d3f3706a4e6ef2e4b9"
  identity_source: "runtime"
started_at: "2026-09-19T21:05:37.996Z"
submitted_at: "2026-09-19T21:20:00.468Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Accepted both findings and revised the correction so its authority explicitly
covers the expanded closed handshake and every platform receives an actionable
cache-root recovery. I also adopted both optional closure suggestions: the Task 4
interface replacement is now self-contained, and the absolute Unix bind is named
as the sole exception to the accepted directory-relative file-operation rule.

## Finding dispositions

- **R1-F001 — accepted.** The `Supersedes` clause now names the accepted
  design's live-endpoint verification sentence and plan line 213. The correction
  defines the exact expanded closed handshake, retains unknown-field rejection,
  and adds verification for missing `cacheRoot` and extra fields.
- **R1-F002 — accepted.** Both mismatch and collision recoveries now name
  `home` for macOS, `XDG_CACHE_HOME` or `home` for Linux, and
  `%LOCALAPPDATA%` for Windows. Only POSIX collision recovery mentions
  `AI_PEER_REVIEW_ENDPOINT_ROOT`, with Windows-specific offline-explain coverage.

## Changes made

- Expanded the named supersession boundary to accepted design lines 253–254 and
  epic-plan line 213; documented plan line 212's absolute-bind-only exception.
- Closed the replacement Task 4 interface contract by restating unchanged
  exports, lock shape, ownership/connect entry points, and version shape alongside
  the new retained-handle operations.
- Defined the handshake's full closed field set and failure behavior for absent
  `cacheRoot`, unknown members, truncation, wrong project, and version mismatch.
- Made both cross-domain recovery paths platform-specific and added the exact
  Windows registry and handshake verification cases.

## Declined changes and rationale

None.

## Verification

- `npx prettier --check docs/design/2026-09-14-56-macos-broker-endpoint-design.md`
- `npx markdownlint-cli2 docs/design/2026-09-14-56-macos-broker-endpoint-design.md`
- `npx cspell --no-progress docs/design/2026-09-14-56-macos-broker-endpoint-design.md`
- `git diff --check`
