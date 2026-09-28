<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-aef2b5f22bd18644f060f796530e98e0"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-28-1841-worktree-hook-boundary-design.md"
artifact_commit: "72563c04c7b0f7d2b2e11ec26627be8c36e22628"
artifact_blob: "3c4be2fe41c54b883444830db9e53d6ed79af8fc"
artifact_digest: "sha256:fb1b7559711ef0fc7e0affec55aea80c755d56b0f7cb752bb88ef41c9d0f1276"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:b2f5083dd38b4293bf1b765a1190acd11c95df91027d5b1382ce4a8d7e8830df"
  identity_source: "runtime"
started_at: "2026-09-28T19:19:42.338Z"
submitted_at: "2026-09-28T19:47:14.617Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Accepted all seven findings. The revised specification separates the two binding defects, states the Codex patch payload contract, removes an inaccurate Bash quote claim, aligns Git metadata capability reporting with host permissions, and assigns commit-attribution ownership to governed evidence checks. It also maps every live #1841 criterion and records the generated-hook restore target.

## Finding dispositions

### R1-F001 — Accepted

Removed the claim that quoted prose is categorically refused. Both scanners mask quotes; the documented failure is naive mask desynchronization on escapes or unbalanced quotes. Wrapper bypass remains the primary reason to retire shell-text confinement. Named the duplicated `stripQuotedRegions` implementations.

### R1-F002 — Accepted

Separated payload `session_id` omission from fleet-wide newest-record selection. The latter independently explains the #1837/#1841 collision. Migration step 1 now requires a distinct regression test for each. Environment project-directory overrides cannot seed a foreign checkout; an override must resolve to the invoking root.

### R1-F003 — Accepted

Host permissions govern Git metadata writes. AITM will not refuse a working `git add` or `git commit` merely because the host cannot express a VCS capability. Doctor reports capability as unverified until tested, and an actual host denial is reported with its approval path.

### R1-F004 — Accepted

Specified `tool_input.command` as a patch-text string, with no precedence over `patch`, `input`, or `text`: multiple nonempty fields must be identical strings under the existing conflict rule. Arrays and other unobserved shapes are refused until a captured payload supports them. Existing backslash and dot-segment rejection remains before atomic target containment.

### R1-F005 — Accepted

Removed local commit-time owner lookup from the desired PreToolUse path. Commit-subject format lint remains local; `commit-trace`, review preflight, and close must verify the target issue, single owner, and attribution before accepting a commit as governed evidence. Added AC9 verification for invalid attribution refusal at publication.

### R1-F006 — Accepted

Enumerated AC7–AC13 from live #1841 body version 11 and mapped all AC1–AC13 to specific design and verification rows. The `vc:7` focused command must gain the new cases.

### R1-F007 — Accepted

Scoped the current-installation statement to the committed baseline. Recorded the baseline and temporary PreToolUse sets for both providers and the required generated set after migration. The table preserves Claude's independent `agent-guard` and `on-ask` entries and makes Codex's temporarily empty PreToolUse state explicit.

## Changes made

Updated the specification's evidence, provenance rationale, exact-session resolution, local file and Git boundaries, governed evidence ownership, migration sequence, installer restore table, acceptance mapping, and risks. Also incorporated the reviewer's two optional clarifications: duplicated quote strippers and deletion of the file-tool-only scratch carve-out.

## Declined changes and rationale

None.

## Verification

Read the full reviewer response, the live #1841 body, `apply-patch-targets.mjs`, and the committed versus temporary Codex/Claude hook registrations. `git diff --check` passed before formatting; Prettier formatting was applied to the spec. This is a design revision; implementation tests were not run.
