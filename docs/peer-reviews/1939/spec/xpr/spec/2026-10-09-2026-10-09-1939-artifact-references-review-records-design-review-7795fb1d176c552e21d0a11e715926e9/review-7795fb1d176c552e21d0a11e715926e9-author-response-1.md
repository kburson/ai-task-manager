<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-7795fb1d176c552e21d0a11e715926e9"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-10-09-1939-artifact-references-review-records-design.md"
artifact_commit: "3621d94ab1f6d276f6558dfa8bb4e3a1ef7c1682"
artifact_blob: "4155688eaaf3686726be0a363f4e30bdec7981c3"
artifact_digest: "sha256:082fe12c903c2b11a51d63dfc99e8fd6606258bc61633cb7e84876c78d98f66a"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6.1-sol"
  model_display: "gpt-6.1-sol"
  session_fingerprint: "sha256:d2d8a8ea3320286cd073109a452c04fe5f5ac4f5aae475dd166efba597031774"
  identity_source: "runtime"
started_at: "2026-10-09T16:25:09.469Z"
submitted_at: "2026-10-09T16:43:21.045Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005","R1-F006","R1-F007","R1-F008","R1-F009","R1-F010"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Addressed seven required findings in the specification, with source-verified dispositions for all ten sealed IDs. The new revision distinguishes conservative local size budgets, protected marker authority, explicit legacy conflict policy, inline pins, flat projection grammar and exact raw-byte hash chaining. No feature implementation or historical apply occurred. Astra's earlier SAR remains bound to its predecessor digest; this is a fresh XPR revision.

Input: sha256:082fe12c903c2b11a51d63dfc99e8fd6606258bc61633cb7e84876c78d98f66a.
Revised raw bytes: sha256:9726515d37326409d7df925043ac15d5f111946d9b739710a5e9c0a7b13c56b9.

## Finding dispositions

| Finding | Disposition |
| --- | --- |
| R1-F001 | Addressed. Marker cap is 16 KiB UTF-8; whole final body is capped at 57,344 bytes/scalars including protected sections and body-version update. Typed size refusals occur before effect reservation/transport, never as indeterminate writes. GitHub error reports support the conservative policy; no live probe or stronger official-doc claim. |
| R1-F002 | Addressed. Summary cap 32,768 bytes/scalars including ownership framing; deterministic full/active-plus-superseded/range-compacted tiers preserve exact File Under Review and complete manifest reachability. Minimal-tier overflow refuses before effects; no extra summary or evidence truncation. |
| R1-F003 | Addressed. Inspected body-invariants.mjs and its mirror policy. Register new protected marker in both canonical and Bash diff guards; dedicated genesis/next-revision validation rejects loss/regression/same-revision divergence. Known enrolled authority loss cannot reopen generic default fallback. Named existing regression suites plus new contract tests. |
| R1-F004 | Addressed with intentional stricter policy. Verified both current readers prioritize Source-plan before Plan. Contradictory legacy A/B now yields legacy-precedence-conflict reporting former A selection, never silently selecting B. Inventory/preview/authorized repair precede enrollment. Unambiguous forms remain supported; fixtures cover both shapes. |
| R1-F005 | Addressed. Recognize path @ hex7-40, preserve supplied pins and uniquely expand commit prefixes against the same observed configured-repository object inventory. Missing/ambiguous/noncommit pins refuse pin-dependent resolution. Compare inline and separate pins by full expansion; record diagnostics/provenance and never claim global uniqueness or acceptance from an abbreviation. |
| R1-F006 | Addressed. Inspected plan-exit-plan-metadata-guard.mjs. Spec now mandates standalone bold group labels plus root flat bold-label/colon fields, actual review and artifact links, no nested headings/lists, and real substantive output. Added metadata shape, body-sections and issue-body consumers/tests to the inventory; no gate waiver. |
| R1-F007 | Addressed. All new digests use sha256:lowercase64hex. previousRecordDigest hashes raw prior committed JSON manifest blob including newline and prior fields; previousRecord carries its exact immutable identity. No semantic reserialization or self-hash. Producer/adapter share exact golden byte/chain fixtures. Legacy representations remain preserved. |
| R1-F008 | Partly adopted with source clarification. Added named missing consumers and actual runtime/context/capability/issue-mutex seams. Direct reuse of journal-authority.mjs for live publication is declined: inspected code invokes assertSyntheticContext, which requires rehearsal repository identity and issue >= 1000000. runtime-adapter lock is enrollment-specific. A bounded production integration must reuse resolved physical authority/canonical issue lock and prove native host identity and pending-effect fencing; it cannot pretend the rehearsal primitive is production-ready. |
| R1-F009 | Addressed. Retrieved exact pinned index and mapping through authenticated GitHub contents API. Recorded raw SHA-256 values in the spec, and require exact tracked fixture capture with source metadata and explicitly labeled synthetic derivations. No assumption that those paths exist on this checkout/trunk; fixture capture remains implementation work. |
| R1-F010 | Not adopted as a scope split. Historical backheal is explicitly required by #1939. Keep one governing spec, but decompose admission/retirement/transaction stories after read/render/publication with independent JIT reviews and separately gated opt-in historical pilot. No early destructive enablement. |

## Changes made

Added Digest and wire conventions; Protected authority marker; Legacy conflict and inline pins; Whole-body and summary budgets; Concrete flat display grammar; Runtime seams and reproducible reference fixtures. Updated inline record and Git-only manifest limits and the Plan mapping. Full prior evidence remains unchanged.

## Declined changes and rationale

Only optional R1-F010's separate follow-on specification is declined for the scope reason above. Optional R1-F008's implicit direct reuse of rehearsal-only journal authority is corrected using its actual assertSyntheticContext constraint; its broader inventory/runtime-seam recommendation is adopted. No required finding is declined.

## Verification

Read actual plan-exit planning-field guard, body-invariant/mirror instructions, evidence-v2 journal authority/protocol/runtime adapter/capabilities, runtime storage exports and canonical issue mutex. Fetched the two exact #1901 source documents at 5f35cf08c41bb8d9c482963e16a5313f44a973f6 and computed their raw digests via base64-decoded contents API bytes.

Prettier check passed on revised canonical specification. Markdown lint completed with zero issues on the repository's configured eligible Markdown surface. No future feature suite or implementation AC pass is claimed. Protocol submit owns the exact-path revision commit; no manual Git commit is performed during this XPR.

