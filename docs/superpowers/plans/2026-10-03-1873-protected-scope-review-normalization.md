# Protected Scope Review Normalization Implementation Plan — #1873

> **For agentic workers:** Use superpowers:executing-plans in this session. The user requires one owning agent and no delegation.

**Goal:** Persist genuine Review evidence while preserving protected Scope policy placement.

**Architecture:** V6 organization retains standalone markers in any section containing a protected policy, preserving its original non-empty position. The coordinator continues enforcing policy and pointer integrity; ordinary organization remains unchanged.

**Tech Stack:** Node.js >=24, ESM, node:test, existing AITM modules.

**Spec:** `docs/superpowers/specs/2026-10-03-1873-protected-scope-review-design.md`.

## Story Intent

- **Beneficiary:** Maintainers delivering reviewed changes with protected Scope evidence.
- **Capability:** Preserve the policy and reviewed evidence positions while organizing Review progress markers.
- **Need:** The formatter currently relocates the protected policy, preventing genuine Review evidence from being written.
- **Value or failure prevented:** Maintainers can record real review results without sacrificing protection against policy relocation and evidence tampering.

## Global Constraints

- Preserve protected policy/evidence bytes and positions.
- Keep all existing evidence and lifecycle enforcement.
- Preserve ai-peer-review's accepted HTTP source and plan.
- Use registered verbs and genuine execution provenance.
- Use this same agent for implementation and inspection.

## Review Focus

- Preserve raw policy indentation.
- Keep pointers with their owning checkbox.
- Preserve inert fenced examples.
- Keep ordinary organization idempotent.
- Reject deliberate policy movement and pointer tampering.

### Task 1: Preserve protected policy during Review organization

**Files:** Modify `scripts/task-tracker/lib/agent-review/validators/v6-marker-organization.mjs` and the existing normalizer tests. Add gate/stamp/coordinator regression coverage.

**Interfaces:** Keep `validate({body})`, `validateReviewedDelta(base,next)`, and `stampAgentReviewPassed` contracts unchanged.

- [ ] Add preservation, authentic gate/stamp, whitespace, fence, idempotence, and guard regression/control tests.
- [ ] Run exact focused verification and retain assertion-level red evidence.
- [ ] Retain the protected owning section's markers in `kept` before hoist/gather.
- [ ] Run focused verification green and inspect the change.
- [ ] Run formatting/lint and canonical Test; commit with `[#1873]` attribution.
- [ ] Complete registered Review, approval, delivery, and close after CI.
- [ ] Adopt the validated tool repair locally for #140, preserving its source scope; complete its fresh verification and delivery.

## Execution rulings

This blocking dependency correction is tracked separately to preserve #140's product scope. No installed-tool guard is edited. AITM correctly refused `.scratch` as runtime authority; the working source occupies the already ignored worktree area.

Ruling: preserve the owning section rather than only the policy line, because extracting a preceding ordinary marker also shifts the protected non-empty position. The cost is that those section-bound markers retain their existing positions.

Ruling: normalize trailing blank lines to a fixed point because the new preservation regression exposed V6 accumulating a final blank line on its second pass. The cost is a canonical trailing-newline representation; protected non-empty positions and raw policy lines remain unchanged.

Ruling: fetch the genuine immutable final-guidance-capture source in CI verification jobs. CI failed three integration files because the original pre-squash commit was absent, and all 21 tests in those files passed after fetching it locally. Frozen captures and their checksum/provenance guards are unchanged. The cost is one explicit historical object fetch per applicable CI job. The first local canonical run was interrupted and is not accepted as green evidence.

Ruling: clear inherited project-root aliases only at the test-child boundary, using the shared alias catalog. Canonical verification legitimately sets its own sandbox root, but forwarding that authority into independent fixtures tests the parent binding rather than the fixture. Credentials, actual provider/session identity, and explicit fixture root overlays remain intact. The cost is that fixtures must declare their own authority instead of depending on parent settings.

Ruling: replace the legacy create-issue fixture's scratch directory with the existing Git-backed runtime fixture helper. The CLI correctly rejects scratch-root authority; relaxing that production guard would conceal the defect. The cost is one local Git initialization per fixture.

Ruling: relocate the genuine issue binding to a shorter source checkout through stop and resume with confirmed relocation. This avoids exceeding the filesystem component limit for encoded session paths without changing session identity, path encoding, or historical evidence. The old checkout and receipts remain preserved.

Ruling: place the test-child environment helper in the existing test-report module beside the runner's buffer policy. A separate module exceeded the unchanged package-entry ceiling by one file in both Node compatibility jobs. The cost is a small additional policy export in an existing module; the package surface and ceiling remain unchanged. The obsolete canonical visit was interrupted, and its verified evidence was retired through registered rework.

Ruling: retain the runner's existing retry-policy import and assignment to preserve frozen executable topology. The child helper clears root aliases only. The cost is keeping environment isolation and retry policy in their respective existing modules; no frozen inventory is changed.

Ruling: exclude sanctioned runtime test-host directories from legacy state-container derivation, mirroring the existing exclusion for Claude worktree hosts. Two new nested-path assertions failed before the correction; the original state fallback and all 23 targeted state/fixture tests pass afterward. Ordinary container precedence and the runtime root guard are unchanged. The cost is recognizing two existing host-directory families.

Ruling: read fixture state through the canonical provider-neutral API, and replace obsolete fictional-root precedence assertions with real Git roots and explicit foreign/shadowed-alias refusal controls. The cost is local fixture Git initialization; no actual provider or session identity is changed.

Ruling: restore complete genuine Git history for local capture verification. The shallow source lacked immutable historical objects and correctly failed provenance checks. CI already checks out complete history; frozen inputs remain unchanged. The cost is fetching existing history locally.

Ruling: use a flat genuine temporary source checkout through registered stop/resume relocation to reduce nested repository-discovery overhead and encoded path length. The failed integration run measured 756672 ms against the unchanged ten-minute ceiling. The cost is an additional source checkout; prior checkouts, bindings and receipts remain historical evidence, and the genuine session identity stays unchanged.

Ruling: give current recertification replay an explicit fixture actor, matching the unit coverage, and assert the exact initial-fixture identity refusal. In a genuine Codex session, the existing integration test inherited that actor and observed identity drift before its assumed legacy timing-actor error. The cost is deterministic test-process actor setup; immutable archived captures and current refusal enforcement are unchanged. No controller identity is modified.
