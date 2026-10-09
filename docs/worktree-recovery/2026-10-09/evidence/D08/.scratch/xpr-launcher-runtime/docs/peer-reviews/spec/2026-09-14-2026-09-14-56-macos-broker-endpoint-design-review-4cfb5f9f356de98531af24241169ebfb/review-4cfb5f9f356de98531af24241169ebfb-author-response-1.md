<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-4cfb5f9f356de98531af24241169ebfb"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "c03814267c704f89c554ce57626a1d87896bf4a3"
artifact_blob: "7c2caefbe54419f5c8b683920da740a0b0981ab1"
artifact_digest: "sha256:b0b57391c3672d1b45828bf533ec80349a8dfc3d792d1c3f5d100222be673b34"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:6fb402d9aaaee78b6d6cc7660d9c4397dcb9a9ba2810d0d15bb7cf930fc1d6ab"
  identity_source: "runtime"
started_at: "2026-09-14T16:29:59.889Z"
submitted_at: "2026-09-14T16:42:20.513Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

<!-- cspell:words aipr EEXIST -->

## Summary

Revised the selected compact, full-entropy endpoint design without changing its
encoding. The path API now exposes the shared endpoint parent explicitly; the
design defines concurrent creation, cleanup, fencing, stale-socket reclamation,
and cross-layout lock authority. The namespace changes from `apr` to `aipr`, and
the byte-boundary tests are exact.

## Finding dispositions

1. **Accepted.** `brokerPaths` now returns `endpointDirectory`; Task 4 consumes
   it directly rather than reconstructing a path-layer decision.
2. **Accepted.** The design identifies the parent as per-user/shared, defines
   the checked `EEXIST` creation race, forbids per-project parent removal, and
   fences each broker that observes parent replacement.
3. **Accepted with scope clarification.** Only the matching full-digest lock
   holder may reclaim a stale endpoint after reconciliation and failed
   authenticated probing. The required lock/no-lock tests are assigned to #43,
   which owns the lock layer; #56 cannot implement them without recreating the
   dependency cycle it exists to remove.
4. **Accepted.** The namespace is now `aipr`; unsafe pre-existing parent state
   has dedicated `APR_BROKER_ENDPOINT_PARENT_UNSAFE` semantics and actionable,
   non-destructive recovery.
5. **Accepted.** The unversioned full-digest lock is explicitly the intentional
   mutual-exclusion point across endpoint-layout versions.
6. **Accepted.** Verification pins exact 103-byte and neighboring 104-byte home
   vectors.

## Changes made

- Added `endpointDirectory` to the path API and data flow.
- Specified shared-parent concurrency, fencing, and no-removal behavior.
- Bound stale-socket reclamation to verified full-digest lock ownership.
- Changed the compact namespace to `aipr` and added a dedicated unsafe-parent
  failure/recovery contract.
- Made the unversioned lock's cross-layout role deliberate.
- Forbade a duplicated endpoint token in `broker.json` v1.
- Added exact boundary and Task 4 ownership test obligations.
- Documented the intentionally retained Windows named-pipe suffix.

## Declined changes and rationale

None. The stale-endpoint execution tests are placed in #43 rather than #56
because they require the Task 4 lock implementation; the finding's contract and
test obligation are fully accepted.

## Verification

- Recomputed the corrected `aipr` path at 91 UTF-8 bytes for the real home.
- Recomputed the 27-byte/28-byte home boundary at 103/104 bytes.
- Checked the revised API, security, migration, failure, and verification
  sections for internal consistency and for preserved Windows behavior.
- Ran Prettier, Markdownlint, CSpell, and `git diff --check` before submit.
