<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7f960d0baa0c582f580431012d7adcd6"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "02ce8817e03954bd7d0132e1e1062672c185a861"
artifact_blob: "368526689a2bbe10e25551c3c2de69f7ef4b5faa"
artifact_digest: "sha256:465eb23a800d7728cf55aeefffb03a67e5c00d63740fc66596d1dd48fa38ac95"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:6fb402d9aaaee78b6d6cc7660d9c4397dcb9a9ba2810d0d15bb7cf930fc1d6ab"
  identity_source: "runtime"
started_at: "2026-09-14T17:04:04.494Z"
submitted_at: "2026-09-14T17:11:35.537Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the design to make the compact endpoint usable for macOS accounts whose
default cache path exceeds `sun_path`, without allowing an endpoint override.
The corrected contract now supports a validated whole-cache-root setting,
handles Linux default-cache creation safely, strengthens trust-anchor
permissions, assigns every new security behavior to a verification owner, and
states exactly which accepted epic clauses are superseded or extended.

## Finding dispositions

1. Accepted with option (b). An absolute `AI_PEER_REVIEW_CACHE_HOME` is now a
   supported macOS/Linux input for the complete broker-state root. The design
   states the 27-byte home and 20-byte macOS short-name limits and gives the
   cache-root setting as the one recovery action. Caller-selected endpoint paths
   remain forbidden.
2. Accepted. The Linux `home-default` path may create `.cache` as `0700`
   relative to a retained, validated home handle. Configured and other platform
   roots must already exist and remain fail-closed.
3. Accepted. Every cache-root source must be non-symlink, user-owned, and not
   writable by group or other.
4. Accepted. The #43 verification handoff now explicitly covers all five new
   registry entries and exact recoveries, post-bind retained-parent identity,
   no-unlink-on-mismatch, live-handle requirements, and Windows no-`dirname`
   behavior.
5. Accepted. The Supersedes clause now names the epic layout, security, and
   stable-error clauses. The accepted documents remain sealed; the
   issue-numbered correction takes narrow precedence.

Optional 1 is accepted with forward attribution from validated full-digest
authority directories. Optional 2 is accepted as
`endpoint_layout_version: 1` in metadata schema v1. Optional 3 is accepted with
an explicit most-significant-bit encoding statement. Optional 4 is accepted by
marking the #56 plan as forthcoming and independently review-gated.

## Changes made

- Added cache-root selection precedence and the exact `cacheRootSource` enum to
  the path contract.
- Added actionable macOS overlength recovery and boundary verification for
  20-byte versus 21-byte short names.
- Added handle-relative first-run creation for Linux `~/.cache` and refusal of
  unsafe or absent configured roots.
- Added non-group/non-other-writable cache-root requirements and corresponding
  #43 tests.
- Expanded the #43 handoff for stable errors, live-handle enforcement,
  post-bind identity checks, Windows logical-pipe handling, and metadata layout
  versioning.
- Corrected supersession scope and clarified endpoint-loss attribution.

## Declined changes and rationale

None.

## Verification

- Recomputed the 27-byte home and 20-byte `/Users/<short-name>` boundaries.
- Checked the revised path, ownership, failure, compatibility, and verification
  sections for consistent input precedence and task ownership.
- Ran
  `npx prettier --check docs/design/2026-09-14-56-macos-broker-endpoint-design.md`;
  it passed.
