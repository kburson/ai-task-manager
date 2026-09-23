# Consumer guidance release: governed split implementation plan

> **For agentic workers:** Execute each numbered task in its own governed issue, worktree, Test receipt, review, and merge-back before starting the next. Use the executing-plans skill for implementation checkpoints.

**Goal:** Ship compact, obligation-complete Codex and Claude guidance with final measured context and package certification inside the fixed budgets.

**Architecture:** A shared budget contract gates both static instruction scenarios and captured CLI lifecycle traffic. The router, adapter, pickup, and boot files keep the boundary/query/receipt protocol; the installed runtime supplies detailed guidance on demand. A final release child captures actual installed bytes and CLI events, then certifies both adapters and the production package together.

**Tech stack:** Node.js ESM, built-in test runner, AITM CLI, GitHub issue lifecycle, Markdown skill files, JSON evidence.

**Spec:** `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` (§18). This plan decomposes accepted #1558 WBS Task 26 in `docs/superpowers/plans/2026-09-16-1558-ask-the-script-guidance-hydration-wbs-r3.md` without changing its three acceptance criteria or VC17 release gate. #1678 retains its governed 32h/XL Plan forecast as the coordination epic.

## Story Intent

- **Beneficiary:** AITM release operator certifying guidance for both supported adapters
- **Capability:** Release a compact protocol whose guidance is fetched at lifecycle decision boundaries
- **Need:** Permanently loaded instructions and complete CLI traffic strain the fixed context budgets
- **Value or failure prevented:** The full governed lifecycle fits the budgets while retaining safety checks and complete operational values

## Global Constraints

- Keep absolute router-plus-pickup, clean, representative-blocked, and full-lifecycle ceilings at 5,000 / 300 / 500 / 7,000 proxy tokens and working maxima at 4,000 / 240 / 400 / 5,600. Derive both static and transcript gates from `scripts/task-tracker/lib/context-budgets.mjs`; do not raise or duplicate the limits.
- Use `Math.ceil(text.length / 4)` per loaded static file and `Math.ceil(sumOfTrafficCharacters / 4)` for all captured request/response traffic. Record exact UTF-8 bytes separately and preserve ordered paths, digests, identities, category counts, and uncertainty.
- Retain the five permanent rules, hard bans on direct issue creation and arbitrary state moves, canonical command/help pointers, current worktree/binding checks, and receipt invalidation after compaction, clear, fresh worker start, or sentinel change. Existing skill sentinels and `workflow-preflight` semantics remain distinct.
- Query after bind/resume, unsettled action, refusal/drift, compaction, and required external approval/merge; ordinary reads, edits, tests, and Git commands do not trigger mandatory Explain queries.
- The historical baseline, #1767 recertification capture, #1769 paired model, #1770 authority report, and 41-row obligation map remain immutable evidence. Final release evidence must use actual installed files and complete current public CLI traffic, not modeled static text or a candidate serializer.
- Preserve the seven-field operational result, typed values, fail-closed admission, authority revalidation, B1+B2 joint release, and independent #1561 full-contract check. No child may claim consumer release until Task 3 passes VC17.
- Keep the existing one-active-child sequencing inside #1678, then reconcile and close #1678 before closing #1558. Each child gets exact-head Test, Review, approval, owned merge-back, and governed Close.

## Implementation Tasks

### Task 1: Unify consumer context budgets and establish release regression gates

**Files:** Modify `scripts/task-tracker/measure-context.mjs`, `scripts/task-tracker/measure-guidance-context.mjs`, and `scripts/task-tracker/lib/context-budgets.mjs` only where needed for shared budget selection. Extend `scripts/tests/unit/task-tracker/core/measure-context.test.mjs` and `scripts/tests/unit/task-tracker/lib/context-budgets.test.mjs`. Create the budget/negative-evidence portion of `scripts/tests/integration/task-tracker/lib/guidance-release.test.mjs` without asserting that the still-large installed adapters have already passed.

**Boundary:** This child owns the fixed-gate machinery and deliberately red pre-slim measurement, not adapter prose or final positive release evidence. Preserve separately labeled idle/parallel scenarios. Add invoked-plus-pickup static and static bind/full-lifecycle instruction scenarios. Both gates must fail when one shared budget fixture is exceeded; missing actual final capture must refuse consumer release. Report the exact pre-slim totals and offending text paths without changing the frozen baseline.

- [ ] Write a focused regression that changes one shared budget fixture and proves both applicable static and transcript consumers reject the breach.
- [ ] Implement shared budget imports, scenario labels, working headroom checks, and a final-evidence-required release assertion.
- [ ] Run focused tests and both static measurements; record the intentional pre-slim failure as a result, not as a passing release.
- [ ] Commit the gate and tests, then complete exact-head governed Test before merge-back.

Run: `node --test scripts/tests/unit/task-tracker/core/measure-context.test.mjs scripts/tests/unit/task-tracker/lib/context-budgets.test.mjs scripts/tests/integration/task-tracker/lib/guidance-release.test.mjs`
Run: `node scripts/task-tracker/measure-context.mjs --all --adapter codex`
Run: `node scripts/task-tracker/measure-context.mjs --all --adapter claude`

#### Story Intent

- **Beneficiary:** AITM release operator measuring guidance cost
- **Capability:** See a fixed, shared budget verdict for static loads and complete lifecycle traffic
- **Need:** Independent ceilings and modeled final text could let one green measurement hide a release breach
- **Value or failure prevented:** An over-budget or incomplete consumer release is refused before adapter prose is changed

### Task 2: Slim both installed adapter protocols and preserve the obligation map

**Files:** Modify `skill/shared/router.md`, `skill/adapters/codex/SKILL.md`, `skill/adapters/claude/SKILL.md`, `templates/pickup-directive.md`, `templates/session-boot.md`, and the relevant lifecycle files under `skill/shared/rules/`. Update `docs/guides/ask-the-script.md`. Run `scripts/sync-templates.mjs` and inspect generated installed-template mirrors. Extend `scripts/tests/unit/task-tracker/core/session-boot.test.mjs` and `scripts/tests/unit/task-tracker/core/worker-context-contract.test.mjs`.

**Boundary:** This child owns static instructions and adapter behavior, not final CLI capture or package release certification. Trace every retained or moved clause through the 41-row `rule-guidance-map.json`. Keep the five rules, hard prohibitions, command/help/source recovery, receipt emission, and compaction/fresh-worker invalidation in both adapters. Replace repeated lifecycle state walks with exact query and receipt pointers. Do not load human prose automatically or use a disk ledger/compaction summary as restored instruction authority. Preserve additional installed adapter compatibility.

- [ ] Add failing adapter parity and receipt-invalidation assertions against the current installed text.
- [ ] Slim shared and provider-specific prose, update the human guide, and synchronize templates.
- [ ] Inspect the generated diff, map every obligation, and run focused boot/contract tests plus the static working-maxima gate for both adapters.
- [ ] Commit the installed protocol and verification, then complete exact-head governed Test before merge-back.

Run: `node --test scripts/tests/unit/task-tracker/core/session-boot.test.mjs scripts/tests/unit/task-tracker/core/worker-context-contract.test.mjs scripts/tests/unit/task-tracker/core/measure-context.test.mjs`
Run: `node scripts/task-tracker/measure-context.mjs --all --adapter codex`
Run: `node scripts/task-tracker/measure-context.mjs --all --adapter claude`

#### Story Intent

- **Beneficiary:** AITM operator using Codex or Claude during governed delivery
- **Capability:** Load the safety boundary once and fetch detailed lifecycle guidance when a decision arises
- **Need:** Repeated state-walk prose occupies context on every pickup even when its details are unused
- **Value or failure prevented:** Both adapters retain the same safeguards while leaving room for the complete lifecycle traffic

### Task 3: Capture actual consumer traffic and certify the packaged release

**Files:** Create or complete `scripts/tests/integration/task-tracker/lib/guidance-release.test.mjs`; update `scripts/task-tracker/measure-guidance-context.mjs`, the current paired context report and exact capture manifest under `scripts/tests/fixtures/1558/`, `scripts/tests/unit/task-tracker/core/package-boundary.test.mjs`, and package/release CI only as the positive consumer gate requires. Preserve historical artifacts and all frozen digests.

**Boundary:** This child owns final installed-byte/public-CLI capture, paired report, and B1+B2 consumer certification. Capture both adapters through the fixed §18 schedule including repeat, changed entry, reload, refusal/drift, compaction, external action, required diagnostics, and a declared reachable heavy case. Do not omit events or typed values to fit budgets. Compare complete current totals to an equivalent preserved Markdown baseline; record tokenizer package/version/encoding and separate proxy/byte counts. Exercise default, tracked, diverged, invalid, tampered, warm-cache, recovery-CLI, production-only tarball, and init-without-override cases. Verify #1561 internal full-contract behavior separately.

- [ ] Make the positive release test fail on missing or modeled final evidence and incomplete event/category identities.
- [ ] Capture actual installed files and complete public CLI traffic, regenerate the paired report, and reduce repeated serialization only if fixed ceilings demand it.
- [ ] Run both adapter static gates, full transcript budget gate, package/cache/invalid-admission certification, focused tests, full unit/integration/slow lanes, lint, and format checks.
- [ ] Record VC17 green only when every original #1678 acceptance criterion and #1558 traceability row is supported by exact final evidence; commit and complete exact-head governed Test before merge-back.

Run: `node --test scripts/tests/integration/task-tracker/lib/guidance-release.test.mjs scripts/tests/unit/task-tracker/core/measure-context.test.mjs scripts/tests/unit/task-tracker/core/session-boot.test.mjs scripts/tests/unit/task-tracker/core/worker-context-contract.test.mjs`
Run: `node scripts/task-tracker/measure-context.mjs --all --adapter codex`
Run: `node scripts/task-tracker/measure-context.mjs --all --adapter claude`
Run: `node scripts/task-tracker/measure-guidance-context.mjs --all --assert-budgets --json`
Run: `npm run test:unit`
Run: `npm run test:integration`
Run: `npm test`
Run: `npm run test:slow`
Run: `npm run lint`
Run: `npm run format:check`

#### Story Intent

- **Beneficiary:** AITM release operator shipping guidance to installed consumers
- **Capability:** Certify actual adapter text and complete public CLI traffic with package and cache integrity
- **Need:** Pre-slim and modeled reports cannot prove the shipped consumer stays within the fixed budgets
- **Value or failure prevented:** The release is blocked unless both adapters and the production package meet the full contract
