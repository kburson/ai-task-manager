# Bounded Plan analysis implementation plan

> Agentic execution: follow the executing-plans skill and registered task lifecycle. Source issue #2143 owns this repair for Project-Estimator #206.

## Story Intent

- **Beneficiary:** project planning owner
- **Capability:** publish required bounded deep-dive planning analysis through a registered operation
- **Need:** converted epics with planning-ready unfinished children correctly lack deliverable authority and cannot publish required analysis with the general comment writer
- **Value or failure prevented:** planning gates can complete using attributable genuine analysis while product completion and delivery remain blocked

## Scope and diagnosis

General `comment` uses scoped-deliverable admission regardless of caller key. A converted epic has planning readiness while completion remains false, so this correctly denied general effect deadlocks its genuine planning deep dive. Preserve generic admission and completion policy. Add explicit `plan-analysis #N --body-file <path>` owning one fixed deep-dive comment. The operation also owns canonical mirror and completion of this deep-dive through existing audited primitives, with fresh authority before both effects and idempotent retry of its fixed comment identity.

## Task 1: Add bounded planning analysis operation

- [ ] Write a failing real-authority regression in scripts/tests/unit/task-tracker/verbs/plan-analysis.test.mjs for a planning-ready incomplete epic, fixed comment ownership/readback, ordinary comment denial, malformed narrative, missing/unknown readiness, wrong state, source/ownership drift and retry.
- [ ] Add scripts/task-tracker/verbs/plan-analysis.mjs with strict parsePlanAnalysisArgs and validatePlanAnalysis exports. Admit only the registered fixed comment operation; require current native session binding, timer, worktree/branch and owner, live Plan state, complete current decomposition with epic planning readiness true (or bounded ordinary story authority), no pending or stale projection. Recollect immediately before effect and compare immutable source digest; upsertOwnedComment owns exact readback.
- [ ] Register router preflight, dispatch, routing identity, help and command contracts. Leave generic comment and all decomposition capability derivation unchanged.
- [ ] Document the verb, required narrative headings and operation-owned post, canonical mirror and deep-dive completion workflow. Test existing mirror behavior and ensure canonical planning body revisions can mirror the validated analysis without full deliverable elevation; if this requires a special body effect, constrain it to the operation's exact mirrored comment.
- [ ] Run targeted tests, existing #2142 tests, full fast lane, lint, format and whitespace checks. Commit with [#2143], report for independent review; no packaging before review.

## Narrative contract

A canonical `## Plan Deep-Dive Analysis` root and allowlisted planning sections covering intent, diagnosis, implementation, dependencies and risks; accept the equivalent headings in the actual foundation analysis. Each section must carry substantive prose. Story Intent must retain the exact source-plan four-part intent: beneficiary, capability, need and value fields. The operator may adapt existing grounded prose into these fields; never manufacture stakeholder claims. Reject HTML/policy/proof markers, additional heading levels, checked boxes and delivery/completion headings. This validates structural planning intent; human review remains responsible for factual and semantic quality.

## Verification and limits

`node --test scripts/tests/unit/task-tracker/verbs/plan-analysis.test.mjs`, prior recovery regression, `npm test`, `npm run lint`, `npm run format:check`, `git diff --check`. Keep native Test/Review and upstream release distinct from source verification and local bootstrap packaging.

## Review rulings

Use the authenticated correlated comment-node URL for large comment identifiers; never request the deprecated 32-bit field. Completed canonical analysis is immutable through this operation, with changed prose refused before updating its fixed comment. Preflight the native deep-dive gate, normalize canonical line endings and enforce exact section/backpointer/prose readback. The native current binding and generation own the actor; durable path and branch history may name an earlier session.

Each explicit invocation is a new submission against current validated Plan authority and returns its input digest. No durable exact-attempt framework is introduced. Within-invocation drift refuses; across invocations the operator must review prose against current Scope. Structural validation does not establish semantic freshness.
