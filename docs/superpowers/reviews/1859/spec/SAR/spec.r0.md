# Reviewed narrative Scope evidence and truthful Review refusals

- Issue: [#1859](https://github.com/kburson/ai-task-manager/issues/1859).
- Status: draft r0; Astra 6 SAR pending; no implementation or workflow approval.
- Source baseline: `1b495236e9b9651c5ffd5ad67d4c7f43238ed44f`.

## Problem and source evidence

Generated child issues contain narrative execution checkboxes under `## Scope`.
The generic body writer requires same-line proof, while AC and Functional DoD
stampers own different sections. Generic issue-body writes cannot introduce proof.

The issue reports downstream ai-peer-review #132 at
`dba9c05ea15f9e23c8b704647a8d9c36c811efe5`, Test receipt
`01M3W3RQ0J1CJSP45BMFJA1HGX`, and six blocked Scope steps. These are reported
facts, not a fresh downstream reproduction or independently certified receipt.

Current source confirms the seams:

- `scripts/task-tracker/lib/split-plan.mjs` renders child Scope from plan tasks.
- `scripts/task-tracker/verbs/check.mjs` owns label resolution and `ensureChecked`,
  but provides no reviewed Scope evidence producer.
- `scripts/task-tracker/lib/issue-body-mutate.mjs` guards ticks, introduction of
  proof, marker loss, and fresh-base retries.
- `scripts/task-tracker/lib/proof-marker.mjs` treats ts/sha/evidence as execution
  proof. Inspection must use a distinct family.
- `scripts/task-tracker/lib/action-decision/normalization.mjs::requireReady`
  maps all non-ready decisions to `normalization-authority-drift`.
- `scripts/task-tracker/verbs/review.mjs` invokes `deriveAndRescan` before its
  completeness renderer; blocked normalization masks the actual refusal.
- `scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs`
  currently expects that misleading code for blocked readiness and retry cases.

## Decision and alternatives

Extend the single-item checkbox writer with a typed reviewed-evidence input,
separate from executed proof. Keep the existing mutation transaction and guards.
Carry original non-ready decisions through normalization to workflow rendering.
Deleting steps loses history; universal stamping expands authority; the unverified
hatch loses the required provenance. None of those alternatives is selected.

## Proposed CLI and eligibility

```text
npx aitm ensureChecked "Exact visible Scope label" --reviewed-evidence ./evidence/step.json
```

This is proposed syntax, not currently supported. Permit one positional label
on `ensureChecked` and its deprecated `check` alias. Reject batch labels, labels
files, `ensureUnchecked`, special marker labels, unknown options, and combination
with `--allow-unverified-ticks` before writes.

Resolve exactly one visible-label checkbox in root `## Scope`, ending at the
next root heading; nested narrative headings remain in Scope. Duplicate labels
anywhere in the issue refuse. ACs, Verification Commands, all DoD subsections,
lifecycle items and directory Delivery Contracts are ineligible. Directory-backed
issues receive an explicit unsupported-route refusal; no new contract operation.
Scope lines declaring machine verifiers are ineligible. Permit this recording in
Develop and Test with current binding, singleton assignment and activity authority.
Other stages refuse with the owning stage action.

## Typed evidence and provenance

Use strict JSON schema `aitm.reviewed-scope-evidence/v1` with required repository,
positive integer issue, canonical worktree, branch, full 40-hex HEAD, exact visible
label, provenance, rationale, and nonempty artifacts. Runtime authority must
independently match every binding field. Reject unknown properties.

Provenance is `operator-inspection` or `historical-command-output`. Rationale
explains what attachments establish for this step and their limits; empty text
refuses. Artifacts are worktree-relative paths with expected SHA-256 hashes.
Read actual bytes and compare independently. Refuse missing/unreadable files,
directories, devices, symlinks, physical escapes, duplicate paths and invalid hashes.
The manifest itself must resolve within the bound worktree. Never fetch remote
URLs or interpret text as instructions.

Historical output also records command text, original execution time, source
repository/issue/commit, and reported outcome. These are attributed historical
claims, not executable instructions or a newly verified success code. Recording
HEAD and historical execution commit remain separate. An explicitly unknown
execution commit is null with an explanation, never guessed. Old execution commits
are permitted only as historical provenance.

Authenticated runtime supplies recording actor and timestamp. No caller-supplied
actor identity. Establish documented limits for manifest size, file count,
individual and aggregate bytes, rationale, and encoded record size; test boundaries.
No silent truncation or embedded attachment contents in GitHub bodies.

Persist the complete canonical validated record, its SHA-256, and artifact paths
and digests in a deterministic encoded same-line `aitm-reviewed-scope-evidence`
comment. The record includes binding, provenance, rationale, target identity,
actor and timestamp. A digest-only pointer to ephemeral scratch is insufficient.
This marker family must not count as `hasExecutionProof` or synthesize exit=0.
Inspection attests an operator's judgment plus validated attachments; it does not
prove that substantive judgment true or replace exact-SHA Test evidence.

## Transaction and readiness

Use `mutateIssueBody` with a narrow typed reviewed-evidence capability, never
`evidenceStamp: true` or `allowUnverifiedTicks: true`. Validate the entire delta:
exactly one eligible Scope evidence introduction and one target tick, preserving
unrelated bytes except the existing body-version increment. Protect this new
family against generic introduction, modification, duplication, relocation and
loss. AC and DoD stampers retain exclusive ownership.

On each fresh-base retry, resolve target and section again, rehydrate binding,
actor and assignment authority, and rehash manifest and attachments. Changes to
request bytes, binding or target refuse before that push. Use existing body CAS;
never replay earlier body bytes. Read back and verify target plus exact record.
Uncertain writes or readback failure must remain uncertain; retry reconciles the
existing exact record before another mutation.

Identical current evidence is idempotent only after full validation, including
already-checked targets. An explicit new recording may supersede stale evidence
but preserves prior records as history. `ensureUnchecked` retains history. Define
one current record by validated binding and target identity; conflicting current
records refuse. Re-attestation after new HEAD cannot reuse a stale record.

The proof guard admits this family only on eligible Scope lines through its
sanctioned writer. Readiness consumers must validate checked reviewed Scope items,
not merely their glyph, including when an accepted Test receipt skips the current
legacy completeness guard. Missing, changed, stale, conflicting or malformed
records block with affected labels and the supported recording action. Never
silently uncheck, erase history, rerun historical commands or move the board.
Changed label/content, issue, repository, worktree, branch or HEAD makes evidence
stale; unrelated body edits do not. Ignored attachments become unavailable on
another worktree rather than trusted from their old digest alone.

Hashing and remote CAS are separate snapshots: check artifacts immediately before
push and during readback/readiness. Arbitrary external file writers cannot be
locked atomically with GitHub. Later changes become stale evidence, not a claim of
atomic cross-filesystem truth. Existing machine evidence, approval, delivery and
closure authority remain unchanged.

## Preserve original blocked normalization decisions

Separate well-formed blocked/indeterminate decisions from invalid envelopes and
measured authority drift. Preserve guard IDs, codes, args, missing-item lists,
warnings and human-decision requests. Original refusal rendering owns diagnostics.

Before any write, non-ready returns current body, persisted=false and the full
decision from `persistReadyNormalizations` and `deriveAndRescan`. Review and Close
consume it and stop before transitions or approval prompts. Completeness retains
its existing item list and exit behavior; other decisions retain their own.

A newly blocked/indeterminate conflict retry aborts that attempted push via a typed
decision-carrying refusal caught at the workflow boundary. Failed CAS is not a
successful write. If readback is non-ready after a successful write, block the
transition and report the real persistence fact; do not claim rollback or no write.
Preserve projection integrity and remaining-normalization checks throughout.

Retain `normalization-authority-drift` for changed execution HEAD, inconsistent
projection/body and actual authority revalidation failure. Keep readback and
persistence errors distinct. Malformed evaluator output and thrown exceptions
cannot become ordinary blocked or ready decisions. When drift and a guard block
coexist, drift remains the fence refusal with the guard as diagnostic context.
No stale-body fallback, stage move, or weakened readiness gate is introduced.

## Acceptance and verification

| Issue AC | Required implementation cases                                                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1      | check unit suite: both provenances, runtime binding and actor, artifact digests, separate execution/recording commits, no machine-proof classification, idempotence                                                                                          |
| AC2      | check unit suite: invalid manifests, missing/changed/escaping/symlink artifacts, wrong binding, duplicate labels, AC/DoD/VC/directory and verifier-bearing Scope targets, batch/hatch combinations, generic fabrication, retry races; no unauthorized writes |
| AC3      | derive-rescan unit and normalization integration suites: original blocked/indeterminate decisions before write, during retry, after successful write; genuine HEAD/projection drift remains distinct                                                         |
| AC4      | integration: generate child Scope using actual split-plan renderer, record each step honestly, supply accepted exact-SHA Test evidence and reach readiness; checked stale/missing records still block; shipped CLI help exposes route                        |

Use the issue's vc:1–3 test files. Add focused body-invariant, proof-marker, Review
and Close tests at changed seams. Exercise legacy and directory refusal paths.
Assert semantic decisions and item lists, not only one error string. Implementation
must also pass declared fast/slow suites, lint, format and commit checks (vc:4–8),
plus generated guidance release/consumer checks for shipped documentation.
Those implementation checks have not been run for this specification.

Draft validation covers formatting, Markdown, links and source-grounded SAR only.

## Boundaries and next step

No downstream reset or implementation edit, forced ticks, fabricated evidence,
generic marker-writing feature or native dependency expansion. No auto-migration
asserting that inspection happened. Exact-SHA Test, human approval and terminal
delivery authority remain separate. After spec approval, implementation planning
will define concrete schemas, bounds, seams and verifiers. SAR convergence means
document readiness, not Plan approval or implementation success.
