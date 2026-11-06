<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-3cf82db24943e1c081143f5497f81378"
role: "author"
turn: 3
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-11-06-2071-public-activation-integration.md"
artifact_commit: "3ac32b471cf600bb4150e7a9c05cd703cc34d7b5"
artifact_blob: "06fe72af7fc3c8befd411a205a56c40720d50274"
artifact_digest: "sha256:9c8833850257118e4950cba64877b1bd89d346925c321ae80784d19e4606f81d"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "gpt-6-astra"
  session_fingerprint: "sha256:9ac23de3367c081dc8dadedf95ec4c16ac4d5dc25b6311c7492d78605e982cb5"
  identity_source: "runtime"
started_at: "2026-11-06T12:07:15.992Z"
submitted_at: "2026-11-06T12:44:35.799Z"
finding_ids: []
answered_finding_ids: ["R3-F001","R3-F002","R3-F003","R3-F004","R3-F005"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Replaced TTY-only conflict direction with K-equivalent explicit human attestation supporting chat-relayed non-TTY use, while preserving the prohibition on autonomous discard of external changes. Added exact audit publication, truthful assurance limits, bounded handoff overflow behavior and a named Root escalation if the native decomposition route does not exist. No broader product or route authority is claimed.

## Finding dispositions

- R3-F001 — Addressed. confirmStoryConflictResolution accepts a conflict-only --human attestation of actual chat-relayed direction or interactive confirmation. TTY is neither required nor sufficient. Headless operation with genuine explicit human direction is supported; an automatic decision without either channel, or a resolution file claiming human=true, refuses before effects. Preserve original automatic-mode signals in the audit when a human-directed override is actually relayed. The plan now explicitly disclaims protection against an agent that fabricates the flag or terminal input, matching K's approve --human assurance and the project's never-fabricate rule. Retain exact native decision evidence and atomically stage a mandatory owned audit comment; confirm it through the journal before affected writes. Include non-TTY human-directed success, Full-Auto UI-tick discard refusal, changed-resolution refusal and audit uncertainty cases.
- R3-F002 — Addressed with precise scope. The existing 4 MiB limit is canonical handoff MANIFEST bytes, including the added receipt descriptors, not an invented limit on all separately retained payload bytes. Overflow is a typed refusal, with no dropped references.
- R3-F003 — Addressed. If the separate native route plan finds no compliant route, Root decides on a separately reviewed framework change for title/WBS reconciliation under an existing appropriately scoped issue where possible. New work/gate change requires explicit authority; this plan creates no defect, waiver or closed binding rewrite. Without such authority, retain the hold and report no native route.
- R3-F004 — Addressed with the same overflow rule and safe remedy: publish/settle if natively permissible, perform approved retention of unneeded generation roots, then retry a smaller closure. Publication alone does not delete references and is never forced solely to make handoff fit.
- R3-F005 — Addressed by the named Root escalation and explicit no-route/hold outcome.

## Changes made

Changed the conflict-direction section and receipt channel payload, added a native audit-comment dependency and realistic non-TTY tests. Clarified the manifest overflow boundary/remedy and added the Root escalation paragraph. Native source behavior, 39–52h provisional decomposition, parent route and title/provenance blockers remain unchanged.

## Declined changes and rationale

No finding declined. A stronger PTY-detection/cryptographic-human boundary was not selected: it would overstate assurance and add unneeded rules. The plan deliberately preserves K's supported chat-relayed human signal and honestly states its trust boundary.

## Verification

R3's cited K approve --human/TTY behavior is consistent with the native source read during R1/R2. The plan and response are documentation only. Prettier and git diff --check pass before protocol submit. No product tests, reviewer Git action, source import, runtime/migration repair, graph/kind/estimate change, carrier creation, lifecycle move or implementation occurred. Same genuine Claude session and six-round XPR; no duplicate or cancellation.
