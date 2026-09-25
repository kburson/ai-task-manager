<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-5c1846703362de090f3843bf4a5f75e8"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md"
artifact_commit: "daaaacad13c7b2e4870823594682de533e87208e"
artifact_blob: "fb556b639d8c39d55ceecbf6699bbe890f8bb9d6"
artifact_digest: "sha256:5583eaf024bb5513b97e5b47f65b597ad9f524b07929ee41bf49e8237a972fb2"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-5"
  model_display: "GPT-5"
  session_fingerprint: "sha256:bc70a7a4d1c6ec71b9ecc055a159336489d2e429782d9b5d71bc3944116a35b8"
  identity_source: "runtime"
started_at: "2026-09-24T20:01:33.872Z"
submitted_at: "2026-09-24T20:41:31.123Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004","R1-F005"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised `docs/superpowers/specs/2026-09-24-1787-delivery-waiver-design.md` to
settle the five blocking design gaps. The revision keeps the original Option B
boundary between #1787 and #1783, but narrows the waiver surface and makes the
authority/schema contract explicit enough for planning:

- new PR-verifier waiver IDs are separate from the existing hard
  `delivery-invariant` family;
- delivery waivers use `aitm.workflow-exception/v2`, not v1;
- #1787 remains Codex-authority-only rather than adding weaker or unbudgeted
  host adapters;
- single-use operation consumption is new durable work, with retry-safe burn
  semantics;
- `indeterminate` is fail-closed and distinguishable from an ordinary missing
  waiver.

## Finding dispositions

- `R1-F001`: Accepted. The design now forbids family-level opening of the
  existing `delivery-invariant` family, lists the ten current hard IDs that must
  remain non-waivable, and places the new waiver IDs in a separate
  `delivery-pr-verifier` family with per-requirement
  `waivableWithDisclosure`.
- `R1-F002`: Accepted. The design now chooses `aitm.workflow-exception/v2`,
  states that v1 is closed and body-scope-only, defines the delivery-scope
  canonical preimage, and specifies `waiverScopeDigest` as a delivery-specific
  digest that supplements the ordinary body-derived `scopeIdentity`.
- `R1-F003`: Accepted. The design now explicitly records the current Codex-only
  authority limitation and chooses fail-closed Codex-only support for #1787
  rather than adding unplanned host adapters or weaker authority.
- `R1-F004`: Accepted. The design now treats single-use as new work, not an
  inherited property; it specifies consumption recording, burn timing,
  retry-after-burn behavior, and replay refusal.
- `R1-F005`: Accepted. The verification flow now defines `indeterminate` as a
  distinct fail-closed result that writes no delivery receipt and must be visible
  in operator output, record projection, and close explanation.

## Changes made

- Replaced the broad "open delivery requirement family" decision with a
  per-requirement `waivable-with-disclosure` decision for new PR-verifier IDs.
- Renamed the verifier-predicate IDs to `delivery.verification.*` to distinguish
  them from existing hard close/action-decision `delivery.*` gates.
- Added explicit non-waivable guardrails for the existing
  `delivery-invariant` family and waiver-authority self-checks.
- Switched delivery waiver authority from v1 reuse to
  `aitm.workflow-exception/v2`, including a delivery-scope object and digest
  preimage.
- Added Codex-only host-authority scope and unsupported-host fail-closed
  behavior.
- Added durable single-use consumption semantics and replay tests.
- Aligned the delivery decision vocabulary with existing policy outcomes:
  `satisfied`, `waived`, `missing`, plus delivery-specific `indeterminate`.
- Added tests for non-Codex refusal, consumed-waiver replay, and
  indeterminate-no-receipt behavior.
- Updated implementation notes with v2 readback, separate family/catalog work,
  and a consumption ledger or record.

## Declined changes and rationale

None. All required findings were accepted. Optional suggestions were partially
incorporated where they affected the same blocking text: the new verifier IDs
use a `delivery.verification.*` prefix, the test section points at extending
`CONSUMER_DECLARATIONS`, and the decision vocabulary now maps to existing
policy outcomes.

## Verification

- Re-read `workflow-policy/catalog.mjs`, `exception-record.mjs`, and
  `scope-identity.mjs` to confirm the reviewer findings against current code.
- Searched the revised spec for stale v1/old-ID/result-vocabulary references and
  corrected the remaining local-trunk references.
- No source tests were run; this turn changes only the design spec and durable
  author response.
