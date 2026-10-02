# Reviewed narrative Scope evidence and truthful Review refusals

- Issue: [#1859](https://github.com/kburson/ai-task-manager/issues/1859).
- Status: XPR revision 1 after Astra SAR r2; no implementation or workflow approval.
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

Resolve exactly one live checkbox in one root `## Scope`, ending at the next
root heading; nested narrative headings remain in Scope. Exclude fenced code and
HTML-comment examples from heading and checkbox detection. Refuse duplicate root
Scope headings and duplicate live visible labels anywhere in the issue. Share
this parser between the reviewed writer and its readiness validator. Support the
existing root `- [ ]` / `- [x]` checklist grammar; refuse unsupported target forms.
Use the existing marker-stripped, whitespace-collapsed visible-label comparison.
Separately hash target source content excluding its glyph and reviewed-history
markers; changes to other target content invalidate the record. ACs, Verification Commands, all DoD subsections,
lifecycle items and directory Delivery Contracts are ineligible. Directory-backed
issues receive an explicit unsupported-route refusal; no new contract operation.
Use one pure `isVerifierBearingScopeTarget` predicate in the writer, mutation
validator and readiness guard. Refuse consolidated `aitm-verified` declarations
or proof (including cmd, vc-list, ts, sha or evidence fields), legacy
`aitm-verified-by` / `aitm-verified-at`, AC/DoD execution markers, vc-list attributes,
and standalone `vc:<positive integer>` citations in visible text. Recognized
marker prefixes with malformed payloads refuse rather than becoming narrative.
This conservative boundary includes markers already carrying execution proof;
those remain in their existing execution route. Mere prose/backtick examples
without a recognized verifier/citation do not create an executable declaration. Permit this recording in
Develop and Test with current binding, singleton assignment and activity authority.
Other stages refuse with the owning stage action. Evidence needing refresh in
Review requires the operator to use the existing demotion/re-entry workflow to
return to Test, record it, and re-establish Review authority. No automatic demotion
or Review-stage recording exception is introduced.

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
The manifest itself must resolve within the bound worktree. Recording and
Test-to-Review evaluation must run in that bound operator checkout, identified by
canonical physical realpath plus its non-detached branch and HEAD. Another linked
worktree at the same branch/HEAD does not match. Pass the authoritative projectDir
explicitly to Git and artifact readers; never use an unrelated ambient cwd.
Refuse a non-bound/main/sandbox checkout before evaluating local evidence, naming
the bound checkout as the recovery location, rather than suggesting re-recording
there. Detached Test sandboxes produce exact-SHA Test receipts, not reviewed Scope
records; consume their accepted receipts back in the bound operator checkout.
Keep attachments available there through readiness; ignored files are allowed but
must be retained. Recommend recording after the final Develop commit, in Test. Never fetch remote
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

Persist the complete canonical validated record in a dedicated durable GitHub
issue comment on the same repository/issue, not scratch. Include a recognizable
schema envelope, record digest, binding, provenance, rationale, target identity,
actor/time, stable lineage and predecessor comment-ID/digest. Comments are
append-only through this capability. The same-line `aitm-reviewed-scope-evidence`
marker stores only the current comment ID, record SHA-256 and lineage ID. Verify
comment issue membership and canonical record digest on every read; never fetch
an arbitrary URL. The immutable record retains artifact paths and digests, not
attachment contents. Old comments retain historical payloads without growing the
issue body. Generic body writes cannot mint, replace or remove this pointer.

Bound canonical record JSON to 8 KiB and its encoded comment to 12 KiB; bound the
pointer to 384 ASCII bytes. Six targets therefore occupy at most 2,304 body bytes
regardless of refresh count: 20 complete HEAD refreshes create at most 120 record
comments (at most 1,440 KiB), while the six current pointers remain bounded.
Preflight the resulting body against a conservative 60,000 UTF-8-byte budget
before creating a comment. If unrelated body content consumes that budget, refuse
with the exact byte excess and an operator instruction to move ordinary long-form
prose to a linked durable issue comment through existing editing tools; preserve
all governed sections/markers. Then retry the same recording. No history pruning,
attachment deletion or new generic archive command is introduced. Provider comment
limits/rate failures refuse truthfully and can be retried after recovery.

This family never counts as `hasExecutionProof` or synthesizes exit=0. Inspection
attests the recording actor's judgment plus validated attachments, not objective
truth or exact-SHA Test success. Runtime reads validate the current record and its
predecessor descriptor, not the full historical chain. Full historical traversal
is an audit operation; deleted/changed current comments block, and historical
comments remain available for audit without making readiness grow with history.

## Transaction and readiness

Use `mutateIssueBody` with a narrow typed reviewed-evidence capability, never
`evidenceStamp: true` or `allowUnverifiedTicks: true`. Validate the entire delta:
only one eligible Scope target may change. Initial recording persists one comment then installs its pointer and checks the
glyph; refreshing a checked target persists a superseding comment and replaces
only the current pointer without changing the glyph. Rechecking an unchecked target with current
evidence changes only its glyph after validation. An already-checked equivalent
request is a byte-identical no-op. Preserve unrelated bytes except the existing
body-version increment on actual writes. Protect this new
family against generic introduction, modification, duplication, relocation and
loss. AC and DoD stampers retain exclusive ownership.

On each fresh-base retry, resolve target and section again, rehydrate binding,
actor and assignment authority, and rehash manifest and attachments. Changes to
request bytes, binding or target refuse before that push. Use existing body CAS;
never replay earlier body bytes. Read back and verify target, pointer and exact comment record. Comment creation
and body CAS are separate operations: create/read back the immutable comment
before installing its pointer. On a failed/uncertain body write, preserve the
unreferenced comment and reconcile by request digest, predecessor and lineage
before retrying. If a comment creation outcome is uncertain, search/read existing
same-issue records before any second create; ambiguous duplicates refuse. A
concurrent successor invalidates the old expected predecessor; never overwrite
its pointer. Bound body preflight and runtime authority checks precede comments,
and fresh binding/artifact checks repeat before the body push.
Uncertain writes or readback failure must remain uncertain; retry reconciles the
existing exact record before another mutation.

Compute a stable request digest over canonical validated manifest, target and
binding, excluding runtime actor/time. Equivalent requests reuse the current
comment and its original metadata after full validation. The first record creates
a stable lineage ID; successor records name the expected current comment/digest.
Only the single body pointer identifies current authority; unreferenced comments
are historical or orphaned attempts, never automatically selected as current.
Conflicting matching attempts require explicit reconciliation, not timestamp
ordering. Target content edits may stale the pointer while retaining lineage;
a new validated record supersedes it. Moving/copying lineage to a different
checkbox is forbidden. `ensureUnchecked` retains the current pointer. New HEAD
requires a new validated request. The content digest excludes only glyph and the
reviewed pointer; adding any other same-line marker deliberately stales it.

## Compatibility and readiness boundaries

New split-plan child Scope output includes exactly one immutable
`<!-- aitm-scope-evidence-policy:v1 -->` within root Scope. Only these explicitly
versioned legacy bodies require every checked eligible narrative Scope target to
have valid reviewed evidence or its established execution-proof route, and every
unchecked eligible narrative Scope target to block even with accepted Test.
Protect policy introduction/removal/duplication in governed mutation; only the
child-generation route introduces it. Do not infer adoption from dates, body
versions, old Generated-by text, or retroactively add it to existing issues.

Unversioned legacy bodies retain their existing unchecked-only completeness and
accepted-Test short-circuit for targets without reviewed pointers. Existing honest
hatch ticks (with audit markers) and proofless web-UI ticks therefore keep existing
legacy behavior; they are not relabeled as reviewed evidence. Explicitly recording
one old target opts only that target into current-record validation. Every present
reviewed pointer is validated independently of accepted-Test skips, even on an
unversioned issue; malformed/stale pointers never fall back to glyph authority.
Do not synthesize records or claim historical inspection occurred. Fixtures cover
legacy hatch ticks, web ticks, old generated bodies, individually adopted targets,
and new policy-versioned children.

Use the shared pure parser and complete Test-to-Review evaluator for Review,
promotion and explanation, including fresh retries. Resolve legacy/directory lane
first: directory contracts retain existing rules with no new narrative proof
obligations. In legacy bodies, reviewed pointers on ineligible live targets or
outside live Scope refuse. Marker-like text inside fenced examples remains inert.

Live binding and attachment validation applies to recording, its readback and
Test-to-Review readiness. It is not a new terminal Close gate requiring the
original checkout, branch, HEAD or files. Close retains existing accepted
Review/delivery authority and completeness semantics; its changes here concern
normalization diagnostics only. This avoids invalidating legitimate
post-integration and local-trunk close paths. Reviewed records are durable audit
claims, not portable replacements for terminal delivery authority.

At live-validation boundaries, missing, changed, stale, conflicting or malformed
evidence blocks with labels and the supported recording command plus required
stage recovery. Never silently uncheck, erase history, rerun historical commands
or move the board. Changed target content, issue, repository, worktree, branch or
HEAD makes reviewed evidence stale; unrelated body edits do not. Ignored
attachments become unavailable on another worktree rather than trusted from
their old digest alone.

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
In Close's `evaluateCloseProjection`, convert the explicit authority-drift throw
for known unchecked-item/lifecycle prechecks into complete blocked decisions
carrying the original labels and reasons. Arbitrary thrown exceptions remain
errors. Validate every evaluator result, even with no pending normalization:
status, matching ok, refusal cardinality, humanDecision shape and warnings follow
the existing complete-guard contract. Indeterminate with an empty refusal array
is malformed, not a supported non-ready decision.

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

| Issue AC | Required implementation cases                                                                                                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1      | check unit suite: both provenances, runtime binding and actor, artifact digests, separate execution/recording commits, no machine-proof classification, idempotence                                                                                                           |
| AC2      | check unit suite: invalid manifests, missing/changed/escaping/symlink artifacts, wrong binding, duplicate labels, AC/DoD/VC/directory and verifier-bearing Scope targets, batch/hatch combinations, generic fabrication, retry races; no unauthorized writes                  |
| AC3      | Review renderer in `verbs/review.mjs` must consume preserved `decision`; derive-rescan unit and normalization integration suites: original blocked/indeterminate decisions before write, during retry, after successful write; genuine HEAD/projection drift remains distinct |
| AC4      | integration: generate child Scope using actual split-plan renderer, record each step honestly, supply accepted exact-SHA Test evidence and reach readiness; checked stale/missing records still block; shipped CLI help exposes route                                         |

Use the issue's vc:1–3 test files. Add focused body-invariant, proof-marker, Review
and Close tests at changed seams. Exercise legacy and directory refusal paths.
Assert semantic decisions and item lists, not only one error string. Cover
fenced examples, duplicate Scope headings, machine-proof compatibility,
accepted-Test skips, all four mutation outcomes, stable uncertain retries,
comment/body partial failures and duplicate reconciliation, bounded pointer
replacement over 20 six-target refreshes, content refresh in one lineage,
compatibility policy, non-bound checkout refusals, shared verifier predicate,
lane routing, misplaced markers and body-capacity recovery. Cover known Close prechecks as blocked and
malformed envelopes as errors. Assert that delivered/local-trunk Close does not
acquire a dependency on the original reviewed-evidence checkout or files. Implementation
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
