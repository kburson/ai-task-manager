<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-ba8635687023d792982f5a0148954d7a"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md"
artifact_commit: "29bd66e799633f784be324e34c728ee2cf4721a6"
artifact_blob: "c7c0781431199e022a5764916e435b50f1b412fa"
artifact_digest: "sha256:de62f0b2045d5ffb48561ba083b2800825d345b44ce296d3d74620d1ac3c1ddb"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:5c0512d62ee6606447bcf1e9c1f78f016ec8b3a271d67b42159327bbfa658f4b"
  identity_source: "runtime"
started_at: "2026-09-30T08:22:26.323Z"
submitted_at: "2026-09-30T08:32:07.802Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Addressed all three sealed findings in this Backlog draft. No implementation or
lifecycle acceptance is claimed.

## Finding dispositions

### R1-F001 — Addressed

Selected bounded single-comment publication: 60,000 UTF-8 bytes for the complete
rendered event, below the reported 65,536-character service ceiling. Prepare
checks initial/terminal rendering read-only; recovery prepare applies the same
rule. Apply rechecks. The 1 MiB generic envelope bound cannot authorize this
publication. Added definite-absence versus uncertain-publication recovery,
near-limit/exact-cap/over-cap/Unicode cases, and mandatory intended-consumer
measurement and ceiling acceptance at Refine. No multipart/truncation fallback.

### R1-F002 — Addressed

Statement is one UTF-8 line with exact punctuation/spaces and proposal mode.
Whole-message raw equality is required. Inspected authority-resolver.mjs: it
trims input_text blocks before hashing, so normalized output alone cannot
enforce this rule. Added raw single-block validation before reference/hash use.
Added required observedResourceVector to the closed recovery proposal, null
for revision. Its canonical digest covers current resource/authority observations
and is transitively bound by proposalDigest. Added refusal coverage.

### R1-F003 — Addressed using option (b) and verified baseline constraints

Develop application now immediately blocks WRITE_CODE, COMMIT_CODE, proof
generation/stamping, and exit until current-revision Plan reapproval. The pending
fence covers application; the revision guard covers post-applied authority.

Inspection of demote.mjs found no Develop-to-Plan path. Test/Review-to-Develop
requires truthful code rework. Removed nonexistent demotion advice. Explicitly
included bounded Develop revision reapproval for both authority formats in
#1847: fresh ordinary planning/source/provenance checks, exact applied revision,
read-back, no fake stage entry, no evidence repair, no stage movement.
Document activity cannot launder mixed source changes.

Later-stage revision requires an independently justified normal code-rework
demotion. Criteria-only later-stage replanning is expressly unsupported in this
version and must be accepted at Refine. No fake reason or arbitrary reset.

## Changes made

Also clarified the SAR header, Codex-only authorization adapter, effective
event-proposal authority for preserved-individual dispositions, and full-chain
read costs/shared observation per gate invocation.

## Declined changes and rationale

No sealed finding declined. Did not choose multipart storage or invent a
Develop-to-Plan transition. The selected alternatives have explicit refusal
behavior and verification obligations.

## Verification

Read the full reviewer response and relevant specification sections. Inspected
authority-resolver.mjs (input trimming and statement hashing), plan-approve.mjs
(stage/canonical admission), and demote.mjs (Test/Review only and mandatory code
rework). Design/response edits only; runtime tests do not apply. Git diff and
specification consistency checks precede protocol submission and do not claim
implemented behavior.
