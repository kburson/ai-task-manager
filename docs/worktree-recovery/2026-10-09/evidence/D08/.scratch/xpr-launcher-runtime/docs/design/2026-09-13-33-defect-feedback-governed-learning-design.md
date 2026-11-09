# Phase 4: Defect Feedback and Governed Learning

<!-- cspell:words unlinkable supersession reranker counterevidence reconstructable -->

## Document status

- **Date:** 2026-09-13
- **Status:** Draft for written human and peer review
- **Owner:** `ai-peer-review`
- **Issue:** [#33](https://github.com/kburson/ai-peer-review/issues/33)
- **Parent feature epic:**
  [#29](https://github.com/kburson/ai-peer-review/issues/29)
- **Phase:** 4 of 5
- **Depends on:** Phase 3, [#32](https://github.com/kburson/ai-peer-review/issues/32)
- **Scope:** Design only; this document does not authorize implementation,
  automatic lesson activation, or mutation of external defect records

## Source authority

This specification atomically extracts Phase 4 from the accepted
[Project-Local Review Lifecycle and Learning Design](2026-09-12-project-local-review-lifecycle-and-learning-design.md),
whose accepted digest is
`sha256:0b65a538437dc2ef2bb86533e991c90b945dacb9fbc7cbe16ad277f8f709fd27`.
The umbrella design and the accepted Phase 1 through Phase 3 contracts remain
binding.

## Summary

Phase 4 closes the learning loop without making inference authoritative. A
defect audit resolves the available specification, plan, backlog,
implementation, verification, and review lineage; separates facts from
evaluator judgment; and may propose a bounded reusable lesson when evidence
supports both a recognizable failure pattern and a review obligation.

Candidates remain inactive until an independent evaluator or human authority
accepts them through append-only Phase 3 events. Evaluation unavailability does
not block ordinary review, artifact approval, delivery, or defect handling.

## Goals

- Produce durable, cited defect-to-review assessments.
- Distinguish where intent or verification failed across the delivery chain.
- Record unlinkable or insufficient evidence honestly.
- Convert only reusable, evidence-backed patterns into candidate lessons.
- Enforce creator/evaluator separation and prohibit self-approval.
- Preserve rejection, retirement, supersession, and human override history.
- Expose reproducible review-quality and escape queries.
- Keep learning evaluation outside artifact, backlog, and defect mutation authority.

## Non-goals

- Treating every defect or review finding as a reusable lesson.
- Claiming that no reported defect proves review quality.
- Automatically changing an artifact, backlog item, test, or defect.
- Automatically accepting a candidate because a model proposed it.
- Requiring cross-provider evaluation where policy or availability forbids it.
- Training a classifier or reranker in this phase.
- Copying protected external defect content into Git.

## Defect-audit inputs

An audit starts from one explicit host defect reference. The host adapter may
resolve evidence but receives read-only authority unless a future command is
separately authorized. Inputs may include:

- defect host, repository or project, and opaque defect ID;
- defect version, timestamp, and protected-content reference or redacted digest;
- known `chainId`, artifact IDs, review IDs, or delivery receipt IDs;
- candidate implementation commits and tests; and
- requested evaluator policy and privacy boundary.

The command snapshots every external value it relies on through a stable ID,
version, digest, or retrieval receipt. Unversioned remote prose cannot silently
become a durable fact.

## Lineage resolution

The resolver follows verified Phase 1 receipts and Git evidence to find:

```text
specification -> plan -> backlog -> implementation -> tests -> defect
       \---------- originating and downstream reviews ----------/
```

Resolution records each claimed edge, its source path or host receipt, digest,
commit, confidence, and verification result. It may conclude:

- `linked`, with a complete or explicitly partial chain;
- `ambiguous`, with conflicting candidates requiring intervention;
- `insufficient-evidence`, when a claim cannot be verified; or
- `unlinkable`, when no governed chain can be found.

An unlinkable assessment is still useful audit evidence under
`.peer-review/audits`, but it cannot create a knowledge candidate. Ambiguity is
never resolved by choosing the most convenient artifact.

## Assessment record

Each audit creates a date-sharded directory containing closed-schema
`assessment.json` and a deterministic human-readable `assessment.md`. The JSON
is authority; Markdown is a projection.

The assessment contains:

- audit ID, schema version, timestamps, and operation receipts;
- source defect reference, version, digest, and redaction status;
- resolved chain and every verified or rejected edge;
- relevant artifact paths, IDs, commits, and digests;
- review findings, dispositions, response and patch receipts;
- relevant backlog criteria, implementation commits, and tests;
- factual observations separated from evaluator inferences;
- stage attributions with evidence and confidence;
- candidate eligibility decision and reason; and
- evaluator identity, instructions, context digest, and provider diversity class.

Files are atomically created and immutable after terminal assessment. Corrections
append governed events or amendments; they do not rewrite the original audit.

## Stage attribution

The schema supports multiple causal stages:

- `design-omission`: approved specification omitted required behavior;
- `plan-translation`: specification covered it but the plan did not;
- `hydration-loss`: plan intent was absent from backlog acceptance criteria;
- `implementation-divergence`: backlog intent existed but code violated it;
- `verification-escape`: specified behavior existed but tests missed the defect;
- `reviewer-miss`: available review evidence should have produced a finding;
- `author-disposition-error`: a material finding was rejected or inadequately resolved;
- `insufficient-context`: review inputs did not expose the necessary fact; and
- `out-of-scope`: the defect is unrelated to the reviewed design boundary.

Each attribution states whether it is a directly verified fact, a bounded
inference, or unresolved. It cites exact evidence and counterevidence. Several
stages may be present when evidence demonstrates a causal sequence. A finding
that exists but was explicitly outside scope cannot be relabeled a reviewer miss.

## Observation and candidate generation

Every valid linked audit may append a factual Phase 3 observation event.
Candidate generation is stricter. It requires:

1. a verified link to governed artifact and review evidence;
2. a repeatable or plausibly recurring failure pattern;
3. a concrete obligation a future reviewer can perform;
4. bounded applicability and explicit exclusions;
5. source evidence sufficient for an independent evaluator; and
6. no secret or unrestricted external content in the tracked event.

A project-specific incident narrative without a reusable action remains only an
observation. A candidate never enters review prompts before acceptance.

The generated candidate records its creator, generator instructions, context
digest, evidence bundle, proposed obligation, applicability, exclusions,
confidence, and known counterexamples. Generation does not grant evaluation
authority.

## Independent evaluation

The evaluator receives a bounded immutable bundle containing the approved
artifacts, relevant review evidence and patches, assessment, candidate, and
explicit decision rubric. It cannot mutate the FUR, lifecycle, backlog, defect,
audit, or candidate file.

The evaluator returns exactly one of:

- `accept`, with evidence that the obligation is reusable and bounded;
- `reject`, with reason and counterevidence; or
- `needs-human`, with the unresolved decision identified.

Self-approval is prohibited. Creator and evaluator authority are compared using
provider identity, host identity, invocation/session identity, role, and
authority proof. A separate invocation is mandatory even when only one provider
or model is available.

Diversity is recorded as `cross-provider`, `same-provider`, `same-model`, or
`human`. Cross-provider evaluation is preferred but not required. Same-provider
and same-model decisions remain valid only with isolated context, a distinct
evaluator role, and enforced creator/evaluator separation.

An unavailable evaluator leaves the candidate inactive. The audit completes
with a pending evaluation status and does not block any delivery lifecycle.

## Human authority and lifecycle events

A separately authorized human may accept, reject, override, retire, or
supersede a lesson. The command captures human authority evidence without
inventing identity or silently treating an agent response as human approval.

All decisions append closed Phase 3 events. They preserve the candidate, prior
evaluations, accepted versions, and successor relationships. Materialization
rejects self-approval, invalid state transitions, cycles, ambiguous concurrent
successors, or edits to existing event bytes.

Retirement removes a lesson from new snapshots without denying that it was once
accepted. Supersession identifies the replacing case and effective event. Active
reviews retain their pinned earlier snapshot.

## Review-quality queries

Queries are deterministic projections, not authority mutations. They may report:

- accepted obligations and the evidence that established them;
- escape counts and rates by stage, artifact kind, scope, or time window;
- findings accepted, rejected, or later associated with defects;
- reviewer misses and author disposition errors with confidence bands;
- candidate evaluation latency and diversity class; and
- lessons retired or superseded after counterevidence.

Every result identifies the committed knowledge snapshot, audit set, query
version, filters, numerator, denominator, exclusions, and unavailable data. A
later defect is evidence of an escape; absence of a defect is not automatically
evidence of success. Reports must not rank providers or people beyond the data's
declared applicability.

## Failure and non-blocking behavior

The audit fails closed when evidence identities conflict, a source escapes its
allowed boundary, an immutable event is rewritten, attribution cannot separate
fact from inference, evaluator identity equals candidate creator authority, or
an acceptance transition is invalid.

These results remain valid and non-blocking:

- the defect is unlinkable;
- the chain is partial but every claimed edge is verified;
- no reusable candidate can be justified;
- the independent evaluator is unavailable; or
- the evaluator requests human judgment.

No failure authorizes mutation of external systems or deletion of evidence.

## Privacy

External defect adapters store stable references, source versions, digests, and
bounded redacted excerpts only when policy permits. Credentials, private session
handles, raw environment data, and unrestricted defect bodies are excluded from
tracked files and SQLite. A redaction that removes evidence required for a claim
lowers confidence or makes that claim unresolved; the evaluator may not invent it.

## Implementation seams

The plan should isolate:

- read-only defect-host adapters and snapshot receipts;
- artifact-chain resolver and evidence graph;
- audit JSON schema and deterministic Markdown renderer;
- factual observation and attribution model;
- candidate eligibility and bounded bundle compiler;
- evaluator isolation, identity checks, and decision parser;
- human decision adapter and append-only lifecycle writer; and
- review-quality query and report services.

Phase 4 builds on Phase 1 artifact receipts, Phase 2 materialization, Phase 3
events and snapshots, and the current provider identity and authority modules.
It must not embed host-specific issue mutation inside learning services.

## Verification strategy

The Phase 4 plan must include:

- complete, partial, ambiguous, insufficient, and unlinkable chain fixtures;
- exact evidence and counterevidence citations for every attribution class;
- multi-stage attribution with fact/inference separation;
- unrelated-defect refusal to create a candidate;
- reusable-pattern and bounded-obligation eligibility tests;
- creator/evaluator collision and self-approval rejection;
- cross-provider, same-provider, same-model, and human decision paths;
- unavailable evaluator and `needs-human` non-blocking behavior;
- immutable acceptance, rejection, retirement, and supersession events;
- active-review snapshot stability after lesson lifecycle changes;
- privacy and redaction boundary enforcement; and
- reproducible quality query numerators, denominators, and exclusions.

The issue-level targeted verifier is
`test/integration/defect-learning.test.mjs`; the plan may split it while
preserving the named acceptance probes in #33.

## Acceptance criteria

Phase 4 is ready for implementation planning when peer review agrees that:

1. every claimed lineage edge is verifiable and ambiguity is explicit;
2. unlinkable defects cannot contaminate the knowledge corpus;
3. attribution distinguishes evidence, inference, counterevidence, and scope;
4. candidates require a reusable pattern and bounded review obligation;
5. candidate creators cannot approve their own proposal;
6. unavailable evaluation leaves knowledge inactive without blocking delivery;
7. all decisions and lifecycle changes are append-only and reconstructable; and
8. quality reports state their snapshot, method, limits, and unavailable data.

## Final decision

Phase 4 permits the project to learn from verified review escapes while keeping
learning governance separate from delivery authority. Evidence may propose a
lesson; only an isolated evaluator or human authority may activate it, and only
a later committed Phase 3 snapshot may expose it to another review.
