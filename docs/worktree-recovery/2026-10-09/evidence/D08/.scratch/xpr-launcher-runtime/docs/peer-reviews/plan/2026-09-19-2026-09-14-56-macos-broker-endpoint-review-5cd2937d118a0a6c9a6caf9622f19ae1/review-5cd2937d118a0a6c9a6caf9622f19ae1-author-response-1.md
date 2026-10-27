<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-5cd2937d118a0a6c9a6caf9622f19ae1"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/plans/2026-09-14-56-macos-broker-endpoint.md"
artifact_commit: "6a388d2439d46e4c8a5200d65097c887855dae2b"
artifact_blob: "cfa4e35b99359cc3d0dcd4de02d142c07ac84330"
artifact_digest: "sha256:49083dfc9c8c713c758d878e7e8c3eb56f7563bebe04c3f54a5ec50454e25b5d"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:3bd3e9cf6b8ebe6381a4f334650949f3cbd50618b88511d3f3706a4e6ef2e4b9"
  identity_source: "runtime"
started_at: "2026-09-19T21:25:06.367Z"
submitted_at: "2026-09-19T21:31:24.228Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Accepted all three findings and all optional suggestions. The revised plan now
pins the actual Darwin and Linux root budgets, fully specifies and tests the
platform-selected overlength recoveries, and explicitly replaces every legacy
test assertion that would contradict the compact POSIX layout.

## Finding dispositions

- **R1-F001 — accepted.** The Darwin golden result now injects limit 103 and
  expects root budget 42; the Linux golden result injects 107 and expects 46.
- **R1-F002 — accepted.** Unit, implementation, and integration steps now assert
  the exact accepted POSIX and Windows recoveries, including the configured-root
  success case with unchanged authority paths.
- **R1-F003 — accepted.** Task 1 explicitly changes the legacy limit-20 result to
  `APR_BROKER_ENDPOINT_LIMIT_INVALID` and removes the old full-digest
  `broker.sock` endpoint match.

## Changes made

- Added explicit injected limits and exact `maxEndpointRootBytes` expectations to
  both POSIX golden objects.
- Defined the `posix` fixture used by the base32 examples and retained the
  version-independence assertion.
- Added recovery-text assertions, the long-home configured-root recovery case,
  Windows `null` root-budget behavior, and removal of the retired recovery text.
- Added UTF-8 prefix assertions for both endpoint directory entries.
- Scheduled the two legacy assertion replacements before the focused suite is
  expected to pass.

## Declined changes and rationale

None.

## Verification

- `npx prettier --write docs/plans/2026-09-14-56-macos-broker-endpoint.md`
- `npx markdownlint-cli2 docs/plans/2026-09-14-56-macos-broker-endpoint.md`
- `npx cspell --no-progress docs/plans/2026-09-14-56-macos-broker-endpoint.md`
- `git diff --check`
