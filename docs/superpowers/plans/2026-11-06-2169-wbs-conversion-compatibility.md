# #2169 WBS conversion compatibility implementation plan

> **For agentic workers:** Use the executing-plans skill for native inline implementation, with meaningful TDD and one independent final source review. Root authorized this standalone defect through native Test/Review handoff; push, merge, provider callback and Close require the separate concrete delivery phase.

**Goal:** Preserve an accepted BUG child claim when native Epic conversion changes only its canonical prefix, without changing ordinary assessment authority or sibling provenance.

**Architecture:** Keep literal normalized WBS title comparison as the default. Add one narrowly qualified BUG-to-Epic case using strict current Epic kind and current native child/parent identity. Preserve untouched provider titles through both existing collectors and bind only admitted conversion facts into the readiness digest.

**Tech Stack:** Existing Node ESM, GitHub GraphQL collectors, native AITM lifecycle and node:test fixtures; no new dependency.

**Spec:** Root-accepted independent SAR artifact `9c91cb69ae285360d6578c0bdf53a42826cbe0da:docs/superpowers/plans/2026-11-06-2071-wbs-title-compatibility-support-plan.md`, SHA-256 `1c55f67914951c1e8b83c61d771094bc7be23c571a30014e34d5c7b46d1fb0a1`. The whole artifact was read and its hash independently recomputed in this owner chat. Its unresolved downstream #2071 route is context, not this issue's implementation scope.

## Scope

One causal correction, independently deliverable to trunk. Production ownership is exactly:

- `scripts/task-tracker/lib/decomposition-wbs-coverage.mjs`: strict compatibility predicate and claim fields.
- `scripts/task-tracker/lib/decomposition-delivery-readiness.mjs`: expected repository/parent context forwarding.
- `scripts/gh/lib/wave-admission.mjs`: existing query/fence identity transport, untouched raw title and shared mapper.
- `scripts/task-tracker/lib/decomposition-hook-authority.mjs`: existing root/child observation context transport.
- `scripts/task-tracker/lib/decomposition-authority.mjs`: readiness caller context and conditional admitted-fact hashing.

Configuration ownership is one exact root-relative `.prettierignore` entry, `/docs/superpowers/plans/2026-10-20-2039-active-child-execution-plan.md`, with an immutable-source-byte comment. Do not restore or archive that file in this live checkout.

## Context and adaptation authority

The accepted input was prepared for #2071; #2169 is the actual standalone defect, discovered during #2039, with a trunk delivery parent and no native issue parent. Root accepted the independent SAR and authorized creation, ordinary governed planning and implementation. The native B9c91 and Claude74/SPR79 artifacts remain unjoined/unaccepted; none supplies this issue's approval or test evidence.

This plan adapts the issue ID, title, execution authorization and issue-owned records while preserving the proposal's interfaces, five production owners, exact formatter exception and every proof obligation. It makes explicit the already required raw-title transport: `mapSubIssueNodes` must retain the provider's untouched value separately from its existing trimmed `title`, through both collectors. This is the accepted P3 clarification, not a new normalization policy. Material design/scope changes require a fresh Astra6/xhigh SAR before implementation.

The fresh physical source root is `/Users/kpburson/.codex/worktrees/wbs-compatibility-setup/ai-task-manager`, managed attachment `01a1b12b-324d-7072-8243-ebc4f83dc69f`, genuine owner SID `01a1a434-10b4-7000-b141-07ee13df65aa`. Canonical bootstrap passed at delivered Z `2e5a3feec6d6296778f767977cf8086f587d1967`; the self-link and running-package guidance source resolve to this root, and configured hook candidates select its local scripts. Native Start and draft-branch verified this issue's binding on `codex/2169-draft` at Z. The separate installed-consumer doctor report remains unhealthy for a missing install manifest; no installer/configuration repair was performed. The documented source-worktree setup is the applicable setup contract.

An ordinary Git comparison found no difference between Z and K `849239a672fdae97c9475e47bcc5eb8fc050f6fd` under `scripts`, `bin`, `guidance`, `instructions`, `package.json` or `package-lock.json`. This is source equivalence, not executed baseline proof. Capture baseline records before any production edit.

Fresh duplicate searches found no existing open fix. Paused Ready-for-Planning #1942 has a separate future artifact-reference migration; Root confirmed it is not this correction. PR #1907 touches wave-admission's separate project-item reader/stage-helper regions, not the child collector/map regions. Preserve those owners and all retained source. The other 28 open PRs inspected did not touch these five production paths.

## Global constraints

- Node minimum remains 24; use the current supported Node 26 worktree environment and locked dependencies.
- Preserve ordinary exact-title trimming behavior, normalized input/digests, child serialization and project hash. No mass assessment migration.
- No generalized prefix stripping, Unicode normalization, case folding, body-authored conversion flag, dual pin, schema extension, policy engine, approval flag, descendant query or added provider request.
- Preserve exact source path, selected heading, pinned commit, complete plan bytes, one-task/one-child uniqueness, section selection, planning, branch and disposition checks.
- Preserve original checkouts, refs, ignored evidence, closed #2161 and Unknown timing. Do not read original dirty #2071 WIP, activate #2145, touch frozen f7be, mutate live #2039/#2071 graphs/kinds/siblings/pins, restore/archive J, or build a carrier/trial capability.
- Existing collection fences are continuity checks, not atomic snapshots of every child title/body. Do not claim stronger concurrency guarantees.
- Use actual inherited native identity in disposable producer/refresh fixtures. A skipped native-actor case is not qualification.
- No product edits before native deep dive, Plan approval and current decomposition assessment. No raw Git branch workaround or identity/source override.
- One serial native-owned Test run consumes complete exact-head CI; no concurrent Test or manual full-suite loop. Root coordinates delivery after implementation review.

## Plan Metadata

- Priority: P0
- Size: L
- Estimate: 6 hours
- Labels: bug
- Estimate basis: conservative upper bound of the reviewed provisional 5-6 active engineering hours, including baseline/source setup (0.5h), predicate/collector/digest work (1.25h), native conversion/refresh/formatter fixtures (1.5h), targeted qualification (0.75h), and review/delivery repair (1-2h).
- Stop boundary: if detailed preparation cannot credibly stay within 6h, stop to revise the scope; do not disguise it as a 4h story or assume a repair chain.

## Story Intent

- **Beneficiary:** native-session operator
- **Capability:** retain an accepted WBS child claim through a legitimate canonical BUG-to-Epic conversion
- **Need:** literal title matching currently rejects the converted representation despite unchanged business title and provenance
- **Value or failure prevented:** continue governed decomposition without rewriting accepted plan bytes, losing sibling provenance or admitting an unrelated child

## Exact compatibility contract

Literal equality remains the first case with existing normalization. Only a mismatched title may use the second case, and every condition must hold:

1. Accepted task title begins with exactly `KIND_PREFIXES.bug` and has a nonempty business suffix.
2. Untouched provider `rawTitle` is exactly `EPIC_PREFIX + acceptedSuffix`. No trimming, case folding, Unicode normalization, other-prefix stripping or business-title change is allowed for the exception.
3. `classifyDecompositionKind(child.body)` returns `kind=epic` with no reasons. Fenced, duplicate, malformed or out-of-Progress-Markers kind, title/label alone and body-authored conversion claims grant nothing.
4. Current native observation identifies the same child node ID and positive safe issue number in the expected parent's complete immediate-child inventory. Its repository equals the independently supplied expected repository. Parent node ID, number and repository come from the queried provider parent, never Plan Metadata.
5. Expected parent number equals the readiness subject. Existing page/fence validation rejects missing, mixed, duplicated or drifted identity for compatibility. Foreign repository evidence remains foreign rather than being replaced with config.
6. Every existing provenance/readiness check remains in force. Current representation is recognized; these observations do not prove a cryptographic history of who performed conversion.

Reuse `classifyDecompositionKind`, `KIND_PREFIXES.bug` and `EPIC_PREFIX`. Do not call permissive `parseIssueKind` to grant the exception or `stripKnownPrefix` for title comparison.

## Interfaces and authority continuity

- `reconcileWbsCoverage({ tasks, acceptedPlanPath, acceptedPlanText, children, readPlanAtCommit, repository = null, parentIssueNumber = null })`.
- `evaluateMaterializedWbsReadiness({ issueNumber, repository = null, ...existing })` forwards expected repository and `parentIssueNumber=issueNumber`; its production caller supplies `subject.repository`.
- Child descriptors gain `rawTitle` and `nativeWbsIdentity: null | { repository, nodeId, number, parent: { repository, nodeId, number } }`. Repositories follow existing lowercase identity convention; IDs stay exact opaque strings; numbers are positive safe integers.
- `parseWbsChildClaim(child)` retains existing fields and adds untouched `rawTitle`, `kindClassification: { kind, reasons }` and native identity. These derive from provider descriptors/body, not visible metadata.
- `fetchAllSubIssueNodes` keeps its array return type. After complete inventory/fence validation, return cloned nodes carrying native parent context, such as `nativeWbsParent`. The shared mapper combines this with raw node ID/number/repository. Legacy mapping callers without native context retain ordinary equality and cannot gain compatibility.
- Wave collection adds parent ID/number/repository and child repository to its existing detail/fence selections, validates root continuity and compares identity tuples without another request. Hook collection adds child repository to its existing detail selection and carries root context from its existing root/inventory fences.
- Derive local `titleCompatibilityFacts` only from `r.boundaries.coverage.matched` entries whose normalized title differed and whose compatibility was admitted. Each fact contains accepted task number/title/heading, claim path/commit/section, raw title, strict kind/reasons and native identity. Sort a copy canonically; never reorder provider children/dependencies.
- With no admitted facts, readiness hashing remains exactly `{ children: normalized, planning: r.deliveryReady, terminal: children.map(isAcceptedTerminalChild) }`. Add `titleCompatibilityFacts` only when nonempty. No empty/null/undefined key, new observation or policy version for ordinary cases.
- Keep serialized `epicReadiness.children` unchanged. Keep project hash exactly `{ projectId, projectItemId, estimate, size }` for every case, preserving estimate-writer prediction. Overall input already hashes readiness.
- Fact changes after admission must change/remove the fact or make authority unavailable, invalidating the old projection even if planning stays false. Invalid-to-invalid changes that never admitted a conversion need not create new dependencies.
- Supported refresh remains registered `refresh-decomposition` via public `resume`, which invokes the owned refresh transaction. It locks, recollects, validates semantic drift and exact record readback, and preserves historical publication bytes. Read-only Explain/decompose-check do not refresh. A completed old writer retry still enforces its sealed intended digest; do not replay it to erase conversion drift.

## Review focus

- Title/kind spoofing: changed suffix, whitespace, extra/legacy/lowercase prefix, title/label alone and invalid kind locations must refuse.
- Missing/foreign/mixed identity: both collectors and pure coverage must refuse compatibility with wrong repository, root, node or number; visible metadata cannot repair missing native facts.
- Historical provenance: wrong path/heading/pin/full bytes, duplicates and missing tasks remain blocked; all 31 other sibling claims/states survive the 32-child fixture.
- Stale authority: unchanged ordinary records remain current; admitted conversion/fact drift invalidates old readiness even when planning=false, while project hashing stays unchanged.
- Genuine native behavior: actual kind and split/creator/tether production paths, confirmed public resume, exact traffic counts and formatter execution must supply evidence rather than success stubs or skipped actor cases.

## Acceptance Criteria

- [ ] Exact native conversion is accepted only under the complete strict contract, through both collectors, while ordinary behavior and provenance remain unchanged.
- [ ] Ordinary K baseline input/record bytes and readiness/project/input hashes remain usable; only admitted conversion facts add readiness authority.
- [ ] Public resume confirms a new converted assessment without rewriting historical publication; stale/malformed/pending/unconfirmed authority remains restricted.
- [ ] Disposable native conversion fixtures preserve 29 closed and two open other siblings and independent blockers; a separate fully admissible positive proves readiness.
- [ ] One exact formatter exception preserves J bytes and leaves an unformatted sibling and K archive subject to normal formatting.
- [ ] Required focused tests, full quality, exact-head complete CI/native Test and fresh independent source review are recorded without invented qualification.

## Implementation Tasks

### Task 1: Preserve converted BUG claims through native readiness

#### Story Intent

- **Beneficiary:** native-session operator
- **Capability:** retain accepted WBS provenance through canonical Epic conversion
- **Need:** whole-title equality rejects the same child after its native representation changes
- **Value or failure prevented:** avoid unnecessary plan rewrites while refusing unrelated or stale child claims

#### Files

Modify only the five production files and exact `.prettierignore` entry above. Extend these existing tests and fixtures:

- `scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs`
- `scripts/tests/unit/task-tracker/lib/decomposition-delivery-readiness.test.mjs`
- `scripts/tests/unit/task-tracker/lib/decomposition-authority.test.mjs`
- `scripts/tests/unit/task-tracker/lib/decomposition-projection.test.mjs`
- `scripts/tests/unit/task-tracker/gh/lib/wave-admission.test.mjs`
- `scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.cases.mjs` and its existing test entry
- `scripts/tests/fixtures/first-child-epic-provider.mjs` and `first-child-epic-cli-provider.mjs`, only as necessary for new selections and outer-parent cases

Create `scripts/tests/integration/task-tracker/wbs-converted-epic-compatibility.test.mjs`. Retain actual baseline and red/green output in issue-owned scratch evidence. No production test helper or success stub.

**Interfaces:** The single implementation task consumes the existing collectors, kind/prefix helpers, closed codec, refresh transaction and native fixture entry points; it produces the exact interfaces and conditional hash behavior above. There is no second production unit or assumed follow-on defect.

- [ ] Capture ordinary leaf and exact-title Epic records through the unmodified K-equivalent collector/owned refresh before production edits. Retain actual bytes, normalized input and readiness/project/input digests; compare unchanged records under F without rewriting their expectations. Exercise ordinary public resume/continuation and unchanged capabilities.
- [ ] Add a pure converted-positive test with a literal BUG task, actual canonical Epic title, strict kind and complete native identity. Run it before the fix; require failure at the existing title/provenance mismatch rather than fixture/import errors. Add strict title/kind/identity/provenance negatives and legacy exact-title behavior.
- [ ] Extend provider transport fixtures narrowly. Use disposable physical Git/provider fixtures and actual inherited native actor for registered kind and split/creator/tether paths followed by public outer assessment through both collectors. Retain original J full bytes and every one of the other 31 claims/bodies/states, including the actual 29-closed/two-open split. Keep independent blockers. Use a separate fully admissible positive.
- [ ] Add ordinary continuity and converted public-resume refresh tests. Preserve old completed publication bytes/intended digest; first inspect stale/restricted, then refresh confirmed, then inspect/admit using current digest. Change raw title, strict kind, child node/number/repository, parent identity and source provenance one at a time; include a constant-planning-false parent. Exercise codec/normalizer, malformed and pending records, failed exact readback and semantic drift during refresh.
- [ ] Run the targeted tests before implementation. Retain real red results for missing conversion compatibility while ordinary baselines remain valid. Implement the minimal five-file predicate/context/digest change; keep request boundaries and existing refusals. Add both-collector leading/trailing-whitespace refusals, not pure tests alone.
- [ ] Add the exact ignore entry and a disposable fixture using actual repository Prettier plus copied ignore configuration. Put exact J bytes at the original path; normal format/check must leave its SHA/blob unchanged. Deliberately unformatted sibling and K archive at distinct paths must fail normal check and change under normal write. Assert only one exact entry and no directory/wildcard exemption. Never modify live J/K artifacts.
- [ ] Run the full focused command groups below. Require passing positives, no native actor skip, all strict negatives, zero read-assessment effects, exact existing dispatch counts, retained sibling bytes/states and stale fact invalidation. Public resume has its existing mutation/refresh traffic, not a zero-request promise.
- [ ] Run appropriate native Develop verification, commit `[#2169]`, record the actual trail, and obtain fresh independent Astra6/xhigh or genuine Claude XPR code SAR at final tested source. Preserve declared review identity limits and full findings/dispositions. Use one native-owned Test/full-CI qualification; hand off to Root for normal Review/Full-Auto audit and concrete delivery coordination. Do not push/merge/callback/Close under this planning authority.

**Verification Commands:**

```sh
node --test scripts/tests/unit/task-tracker/lib/decomposition-plan-exit-gate.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-delivery-readiness.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-authority.test.mjs scripts/tests/unit/task-tracker/lib/decomposition-projection.test.mjs scripts/tests/unit/task-tracker/gh/lib/wave-admission.test.mjs
node --test scripts/tests/integration/task-tracker/wbs-converted-epic-compatibility.test.mjs scripts/tests/integration/task-tracker/first-child-epic-convergence.test.mjs scripts/tests/integration/task-tracker/lib/decomposition-hook-traffic.integration.test.mjs
npm run lint
npm run format:check
```

Expected before implementation: the converted-positive fails for the actual title mismatch, with ordinary baselines valid. Expected after implementation: focused commands and quality pass with all mandatory native cases executed. Complete test lanes are supplied through the configured exact-head CI receipt and native Test provider; local focused results alone do not establish that receipt.

## Review and proof status

The design SAR is recorded separately in `docs/reviews/2169-wbs-compatibility-plan-sar.md`. Root accepted the complete independent response and the raw-title clarification. This issue-owned adaptation does not claim that reviewer directly reviewed these new document bytes. No required product proof has executed as of plan authoring. Deep-dive, semantic Story Intent review, native Plan approval, current assessment, TDD, final code review and lifecycle verification remain real steps.
