# Phase 5: Provider-Comparison Experiments

<!-- cspell:words worktree worktrees nondelivery anonymization unblinded -->

## Document status

- **Date:** 2026-09-13
- **Status:** Draft for written human and peer review
- **Owner:** `ai-peer-review`
- **Issue:** [#34](https://github.com/kburson/ai-peer-review/issues/34)
- **Parent feature epic:**
  [#29](https://github.com/kburson/ai-peer-review/issues/29)
- **Phase:** 5 of 5
- **Depends on:** Phase 2 [#31](https://github.com/kburson/ai-peer-review/issues/31)
  and Phase 3 [#32](https://github.com/kburson/ai-peer-review/issues/32)
- **Does not depend on:** Phase 4 lesson generation, except when an experiment
  explicitly consumes already accepted knowledge or later emits observations
- **Scope:** Design only; this document does not authorize implementation,
  provider spending, artifact delivery, or automatic winner selection

## Source authority

This specification atomically extracts Phase 5 from the accepted
[Project-Local Review Lifecycle and Learning Design](2026-09-12-project-local-review-lifecycle-and-learning-design.md),
whose accepted digest is
`sha256:0b65a538437dc2ef2bb86533e991c90b945dacb9fbc7cbe16ad277f8f709fd27`.
The umbrella design and the accepted Phase 1 through Phase 3 contracts remain
binding. Phase 4 governs any later conversion of experiment observations into
active lessons.

## Summary

Phase 5 adds controlled, non-delivery comparisons of reviewer and author
provider/model pairings. Every arm starts from the same committed artifact blob,
knowledge snapshot, instructions, templates, budgets, and stopping policy in an
isolated worktree and branch. Only declared provider or model variables may
differ.

Arms retain their own review evidence and ordered patches. The coordinator
imports result receipts and unique evidence, not complete competing FUR copies.
An experiment cannot approve, move, or deliver the canonical artifact. A user
may later select an arm or request synthesis only through a new normal,
digest-verified, author-controlled successor review.

## Goals

- Compare provider pairings against identical controlled review inputs.
- Isolate arm branches, worktrees, sessions, evidence, and mutation authority.
- Preserve enough evidence to reconstruct methods and compare outcomes.
- Prevent experimental variants from changing canonical lifecycle authority.
- Support blind comparison where provider constraints allow.
- Measure quality, effort, latency, tokens, cost, and later escape evidence.
- Record outcomes as observations without activating lessons automatically.
- Fail closed on baseline drift, undeclared variables, interruption, or conflict.

## Non-goals

- Automatically choosing, merging, approving, or delivering a winning FUR.
- Treating provider identity as the only experimental variable.
- Claiming statistical significance from an underpowered experiment.
- Requiring blind evaluation when infrastructure or policy cannot support it.
- Exporting private project evidence to an undeclared service.
- Copying complete arm artifacts into the coordinator's canonical tree.
- Bypassing Phase 2 retained-ref coordination for experimental commits.

## Experiment definition

An experiment begins with a closed, immutable manifest plan that freezes:

- `experimentId`, schema version, creator, and creation time;
- baseline commit and tree;
- FUR path, `chainId`, `artifactId`, Git blob, and SHA-256 digest;
- Phase 3 knowledge snapshot, selected cases, and compiled context digest;
- author and reviewer instruction-set digests;
- response templates, protocol version, and package version;
- maximum turns, model tokens, elapsed time, and cost policy;
- stopping, retry, abandonment, and intervention policies;
- comparison rubric and anonymization policy;
- each arm's declared provider, host, model, and role pairing; and
- the exact variables allowed to differ between arms.

The plan is sealed before any arm starts. Later corrections append an amendment
and require restarting affected arms from the same verified baseline; a running
arm cannot silently adopt changed controls.

Provider credentials, private handles, and unrestricted transcripts are never
stored in the tracked manifest.

## Baseline eligibility

The baseline must be a committed, clean, contained FUR eligible for a normal
review under Phase 1. Experiment startup verifies the artifact blob and digest,
the Phase 3 snapshot receipt, instruction and template bytes, package version,
and budget configuration.

All arms must begin from the same baseline commit, even if a newer coordinating
branch exists. If the requested commit is unavailable, no longer resolves to the
declared tree, or conflicts with the artifact/catalog digest, the experiment
fails before worktree creation.

Normal approval or delivery occurring elsewhere after experiment start does not
grant the arms authority. It may make later selection ineligible until a user
chooses an explicit successor based on current canonical state.

## Arm isolation and orchestration

Each arm receives:

- a separate linked worktree and branch created at the exact baseline commit;
- a unique `reviewId`, evidence directory, Phase 2 session, and participant set;
- the same FUR path and initial bytes;
- the same immutable compiled context and supplemental evidence policy; and
- only its declared provider/model pairing and allowed variables.

The coordinator verifies worktree registration, branch target, `HEAD`, index,
artifact blob, knowledge snapshot, and configuration immediately before arm
start. A mismatch aborts that arm and prevents comparison.

Arms may run concurrently only after Phase 2 clone-wide coordination is active.
Every arm commit acquires the retained-ref mutation lease and respects other
sealed reviewer intervals. Provider calls and agent reasoning do not hold the
lease or a database transaction.

An arm cannot read another arm's working tree, transient database rows, provider
handles, responses, or identity mapping unless the manifest explicitly defines
a post-terminal comparison input. Shared database use is restricted by distinct
session and snapshot membership.

## Arm evidence and result receipts

Each arm uses normal review evidence mechanics within its isolated branch:

- author handoff and reviewer invitation;
- ordered reviewer and author responses;
- package-generated digest-verified patches;
- findings and dispositions;
- protocol and manifest checkpoints; and
- terminal accepted, rejected, abandoned, or intervention state.

An arm result receipt summarizes baseline and final artifact digests, patch
sequence, findings, dispositions, cycles, token use, duration, cost, provider
identity, terminal state, and evidence paths. It does not claim approval or
delivery.

The coordinating branch imports only unique review evidence, arm result
receipts, and the experiment comparison. It never copies complete files such as
`spec-codex.md` and `spec-claude.md`. Ordered patches remain the compact account
of each variant.

Collection verifies every imported path and digest against the arm's committed
tree. Duplicate identical receipts are idempotent. Conflicting receipt bytes or
missing patch chains fail closed and preserve both branches for intervention.

## Non-delivery boundary

Experiment mode has no operation that can:

- move a proposed artifact to approved;
- append approval or delivery catalog authority;
- change the coordinating FUR;
- select a current artifact ID or digest;
- hydrate backlog work; or
- present `accepted-uncommitted` as production readiness.

An arm's reviewer acceptance means only that its isolated proposed revision
satisfied that arm. The experiment record uses `arm-accepted`, not canonical
`approved`.

A later user selection or synthesis creates a new normal author-controlled
operation from explicitly verified source and current canonical digests. The
result is a proposed successor or revision reviewed through the ordinary Phase 1
protocol. Provenance cites the experiment, selected arm patches, or synthesis
inputs, but the experiment itself remains non-delivery.

## Blind comparison

Where supported, a comparison bundle replaces provider/model labels with stable
anonymous arm labels and removes incidental metadata that would reveal them.
The anonymization transform is versioned and digest-recorded. The evaluator
cannot access the identity map until after its decision is sealed.

The rubric evaluates:

- valid findings and material omissions;
- false positives and critique burden;
- severity calibration;
- accepted patch quality and residual design risk;
- review cycles and author rework;
- elapsed and active duration;
- input and output tokens plus reported cost; and
- later defect escape evidence when a defined observation window exists.

The evaluator records per-metric evidence, missing data, uncertainty, and
whether the comparison was blind. Provider names are revealed only in the final
materialized report according to configured policy.

If blind comparison is unavailable, the manifest says why and the evaluation
remains valid but visibly unblinded. The system never claims blindness based
only on an instruction to ignore known identities.

## Measurement and interpretation

Every numeric result declares source, unit, aggregation, unavailable values, and
whether it was provider-reported or independently measured. Cost is normalized
only when pricing inputs and currency/time basis are pinned. Missing token or
cost telemetry remains missing, not zero.

Later escape rates require a declared observation window and chain linkage from
Phase 4. Absence of a reported defect is not proof of a superior review.
Experiments report sample size and do not generalize beyond tested artifact
kinds, scopes, providers, models, instructions, and budgets.

## Knowledge interaction

All arms use the same immutable Phase 3 snapshot and selected cases. Experiment
outcomes may append observation events only when Phase 4 governance is available
or through an equivalent explicit observation path. No score, evaluator
preference, or winning arm automatically creates or accepts a lesson.

Future experiments may compare knowledge policies, but then policy or snapshot
is an explicitly declared variable and the study is not described as a pure
provider comparison.

## Interruption and recovery

The coordinator records arm state as reserved, worktree-ready, running,
terminal, collected, or intervention-required. Each transition uses idempotent
operation IDs and verified receipts.

On restart it validates baseline, worktree, branch, Phase 2 session, sealed
reviewer interval, evidence commits, and result receipts. Identical completed
work is reused. Missing providers may resume only through the existing identity
and session rules. An interrupted arm does not cause another arm to inherit its
budget, identity, or evidence.

Comparison starts only when the manifest's stopping policy is satisfied. An arm
that is abandoned or invalid remains part of the record with its reason; it is
not silently removed to improve the result.

Cleanup may remove package-created worktrees and branches only through an
explicit recoverable command after evidence collection, terminal-state proof,
and user authorization. It must not delete uncollected or divergent work.

## Failure behavior

The operation fails closed on:

- baseline commit, blob, digest, snapshot, instruction, or budget drift;
- a worktree or branch not rooted at the declared baseline;
- an undeclared variable difference;
- cross-arm session, context, or evidence leakage;
- attempted canonical approval, delivery, or coordinator FUR mutation;
- invalid anonymization or premature identity reveal;
- missing or conflicting arm evidence;
- retained-ref coordination conflict; or
- comparison claims unsupported by recorded data.

Failures preserve arm worktrees, branches, evidence, and manifest state and
return one exact recovery action.

## Implementation seams

The plan should isolate:

- experiment manifest schema and controlled-input freezer;
- exact-baseline worktree and branch orchestrator;
- arm session factory over Phase 2 and Phase 3 services;
- non-delivery authorization guard;
- arm result and evidence collector;
- anonymization transform and identity escrow;
- comparison rubric, metric normalizer, and report renderer;
- normal selection or synthesis handoff; and
- interruption reconciliation and explicit cleanup.

Provider adapters continue to own provider-specific launch and identity details.
The experiment layer coordinates declared inputs but must not duplicate or
weaken the existing review protocol.

## Verification strategy

The Phase 5 plan must include:

- exact equality of baseline commit, blob, digest, snapshot, context, and budgets;
- undeclared-variable detection before and after arm execution;
- isolated worktree, branch, session, participant, and evidence paths;
- concurrent arms respecting Phase 2 retained-ref seals;
- evidence collection without complete FUR copies;
- arm acceptance that cannot alter canonical lifecycle or indexes;
- digest-verified selection and synthesis into a normal proposed successor;
- blind identity escrow, transform reproducibility, and reveal timing;
- quality, cycle, duration, token, cost, and missing-data receipts;
- interruption at every orchestration and collection transition;
- conflicting evidence and baseline-drift refusal;
- observation-only knowledge output; and
- cleanup refusal for active, divergent, or uncollected arms.

The issue-level targeted verifier is
`test/integration/provider-experiments.test.mjs`; the plan may split it while
preserving the named acceptance probes in #34.

## Acceptance criteria

Phase 5 is ready for implementation planning when peer review agrees that:

1. every arm starts from identical frozen controlled inputs;
2. only declared provider or model variables may differ;
3. worktrees, branches, sessions, evidence, and reviewer seals remain isolated;
4. coordinator collection never creates duplicate complete artifacts;
5. no arm or comparison can approve or deliver canonical bytes;
6. selection or synthesis is a new digest-verified normal author operation;
7. blind comparison is technically enforced or explicitly reported unavailable;
8. metrics retain source, units, uncertainty, and missing values;
9. outcomes remain observations until separately governed learning accepts them; and
10. drift, interruption, or conflict preserves evidence and fails closed.

## Final decision

Phase 5 provides controlled evidence about review pairings, not an automatic
artifact-selection system. Experiment arms may explore competing revisions, but
only the normal author-controlled lifecycle can produce an approved or delivered
artifact, and only Phase 4 governance can turn observations into active lessons.
