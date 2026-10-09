<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7ac84e67eb2cc40db4f3229984135e27"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/design/2026-09-14-56-macos-broker-endpoint-design.md"
artifact_commit: "19652556bd2d660672e42f732efc52706a8f7b16"
artifact_blob: "b2d4edfdc2f1ad40c4f8459588af3462d84faa2e"
artifact_digest: "sha256:dbab9eb52d4c97e982576564a134d50daf9a44d190af27cbfbb295c7298124dc"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:6fb402d9aaaee78b6d6cc7660d9c4397dcb9a9ba2810d0d15bb7cf930fc1d6ab"
  identity_source: "runtime"
started_at: "2026-09-14T16:45:42.846Z"
submitted_at: "2026-09-14T16:53:43.777Z"
finding_ids: []
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

<!-- cspell:words aipr EEXIST bindat -->

## Summary

Revised the contract around the separated shared endpoint directories without
changing the selected full-entropy base32 routing. The path API now names every
protected Unix level and explicitly represents the absence of filesystem
parents on Windows. Creation races, absolute bind behavior, mid-lifetime loss,
client validation, and accepted-plan supersession are now closed contracts.

## Finding dispositions

1. **Accepted.** Replaced the singular `endpointDirectory` with a deeply frozen
   ordered `endpointDirectories` array: both Unix levels in order and `[]` on
   Windows. The Windows `listenPrivate` contract and key-for-key test are explicit.
2. **Accepted.** Both `aipr` and `aipr/v1` are created directly as `0700`; each
   level independently admits an `EEXIST` race only after complete
   owner/mode/type/no-symlink validation.
3. **Accepted.** Added `APR_BROKER_ENDPOINT_PARENT_LOST` with multi-broker blast
   radius, preserved evidence, per-project reconciliation, and non-destructive
   recovery semantics.
4. **Accepted.** The supersession header now names the accepted plan's exact
   affected lines and makes the #56 plan their executable replacement authority.
5. **Accepted.** Unix binds use the exact absolute pathname measured by
   preflight; retained directory identity handles provide the no-symlink
   assurance because supported platforms have no `bindat` operation.

## Changes made

- Defined ordered endpoint directories and platform-specific `listenPrivate`
  inputs.
- Defined per-level creation, race, retention, fencing, and cleanup behavior.
- Added shared-parent-loss failure and recovery.
- Named the exact accepted-plan contracts superseded by #56.
- Documented absolute bind and connecting-client validation.
- Added last-symbol base32 invariants, Linux 103/104 boundaries, unchanged
  authority-path vectors, and key-for-key Windows output.
- Clarified the RFC 4648 lowercase wording and future-layout discoverability.

## Declined changes and rationale

None.

## Verification

- Recomputed 91-byte real-home and 103/104-byte boundary arithmetic.
- Confirmed an all-zero 32-byte digest yields 52 `a` symbols and an all-`ff`
  digest yields 51 `7` symbols followed by `q` under the specified bit ordering.
- Checked all superseded plan references against the committed accepted plan.
- Ran Prettier, Markdownlint, CSpell, and `git diff --check` before submit.
