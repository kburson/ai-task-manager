<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-44cf48195bdeaa60b8acf83e3d0abe82"
role: "author"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-10-08-1901-event-derived-timing.md"
artifact_commit: "bcdb2b293df6d81d973ef9bcec4157dfd0b81dff"
artifact_blob: "a43a0aaeeceacfe53b93d08819049e1cb1105541"
artifact_digest: "sha256:718deac13d692a30be2ea6cea7c8f1d5d98f953d7fbd5ed4f216c1f0f4167984"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6.1-sol"
  model_display: "gpt-6.1-sol"
  session_fingerprint: "sha256:8f616e03195adf14884fbc247882c3fe1e4c4c85cedf0674e74b04118262dc7e"
  identity_source: "runtime"
started_at: "2026-10-09T02:17:32.513Z"
submitted_at: "2026-10-09T03:14:44.785Z"
finding_ids: []
answered_finding_ids: ["R2-F001","R2-F002","R2-F003","R2-F004"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the plan against all four sealed round-2 findings. The largest change names a satisfiable, bounded production authority route instead of relying on unspecified controller evidence. The supported handoff scope is now explicit: same OS user/host and shared main-checkout authority; cross-host authority and unattended controller takeover are refused. Codex native user-source takeover is supported; another-provider takeover needs a separately reviewed equivalent adapter. Normal/departure transfers remain provider-neutral within that same-host scope.

The accepted historical specification remains byte-identical. The later user amendment and this concrete authority clarification are part of the current plan review. No implementation, native handoff, production activation, historical repair or implementation test was performed.

## Finding dispositions

### R2-F001 — Addressed

Added "Concrete production authority and deferred-session recovery" immediately after the transfer contract and reconciled the older controller/owner-only language. Task 5 now owns the actual same-host shared receipt index under the main authority root, private actor-journal lookup, real current occupancy/generation/native binding validation and canonical admitted-release verification. A bare actor row/digest is insufficient; a real owner operation plus its retained receipt and canonical read-back is sufficient. A cross-worktree successor reads only the bounded same-user index and exact predecessor journal. Queued-only release, absent receipt, inaccessible source, competing intervening owner and unsupported host fail explicitly.

Added Task 5's timing-handoff-user-source.mjs and concrete native Codex user-message verification through the actual bound rollout resolver. It reuses existing role/hash/injection checks while supporting exact ordinal/raw digest when native IDs are absent. It independently re-reads native user input for the exact sanctioned recovery command bound to issue, opaque predecessor, successor and fresh operation. Model/tool/injected prose, prompt timestamp alone, copied IDs and caller JSON do not grant consent. Current scope does not invent an unattended controller adapter or claim cryptographic immunity from a hostile process rewriting every local authority file.

Generation-safe recovery uses the existing occupancy/binding-generation APIs, retains crash states and actual observation times, and never releases a newer generation or invents an old end. Added the exact visible deferred message/next command and typed explicit refusal behavior. Contender work before authorization is permanently uncredited and not silently journaled for later fabricated timing; checkpoints stay intact. Actual future bounded work starts after admitted recovery.

Required Task 4/5 end-to-end cases now drive real native/filesystem authority adapters with production-shaped occupancy, journal, receipt and native stream inputs, faking only external GitHub I/O. They exercise A closes unpaused → B deferred visibly → actual native user recovery command → receipt admission → known B future/unknown A tail, plus same-host cross-worktree actual departure-successor and the full negative/replay/crash set. No injected always-verified authority callback can satisfy these integration requirements.

### R2-F002 — Addressed

Corrected the measurement section's test-ownership sentence: handoff/journal/authority tests are Task 5-owned; measurement/native-normalizer tests are Task 6-owned. Task 4 integrates these interfaces and owns producer end-to-end tests. The adapter matrix and Task 5 Files include the new user-source adapter.

### R2-F003 — Addressed

Seeded Task 10's first focused verifier with existing executable-entrypoint-classification, integration guidance-admission, unit help and integration help suites. The broader enumerable regression inventory remains required before child Test.

### R2-F004 — Addressed

Task 4 Files now spells scripts/task-tracker/hook-handler.mjs in full, matching the ownership matrix.

## Changes made

Added the concrete bounded production authority/recovery section, reconciled older authorization language, added the Task 5 native user-source file and required real-resolver recovery tests, corrected split test ownership and exact hook path, and expanded Task 10's existing verifier minima. Ten tasks, six ranks and the 112-hour provisional joint estimate remain.

## Declined changes and rationale

None. The explicit same-host scope is the supported alternative requested by the reviewer; cross-host and unattended controller takeover are not claimed.

## Verification

- extractPlanTasks and validateSplitTasks: ten tasks; ok=true; no errors/violations.
- Artifact-only Prettier completed successfully after the substantive edit.
- git diff --check passed.
- This verification checks preparation collateral only. Proposed implementation suites remain unrun and no AC/DoD evidence is claimed.

