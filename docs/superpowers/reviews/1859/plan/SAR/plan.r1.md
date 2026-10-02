# Reviewed Scope Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record truthful reviewed evidence for individual narrative Scope steps and preserve original blocked Review diagnostics without expanding execution-proof or terminal delivery authority.

**Architecture:** A small reviewed-scope module family owns parsing, validation, immutable same-issue comments and bounded body pointers. The existing checkbox writer invokes it through a narrow mutation capability; a Test-exit guard validates adopted targets independently of accepted Test skips. Normalization returns complete non-ready decisions to existing workflow renderers.

**Tech Stack:** Existing Node.js ESM (Node >=24), node:test, node:crypto/fs/path, current GitHub client and body CAS. No new dependencies or native modules.

**Spec:** [Accepted specification](../specs/2026-10-01-1859-reviewed-scope-evidence-design.md), SHA-256 `696b7483439a92a87ad3264508c9070fb7e9c599279beaa3f782ed126652380a`; artifact commit `2147677a1b3ac44fc735850b3a8b85aac9071cb8`; XPR `review-26997eff0c0ae32bf519416e6fa943fa`, finalized in `4c8cb8a6`.

**Issue:** [#1859](https://github.com/kburson/ai-task-manager/issues/1859). This plan authorizes no implementation by itself. Source baseline is the spec-finalization checkout; runtime source is unchanged from `1b495236e9b9651c5ffd5ad67d4c7f43238ed44f`.

## Global Constraints

- Single positional label on `ensureChecked` or deprecated `check` with `--reviewed-evidence <path>`; reject batch, labels-file, ensureUnchecked, special labels, unknown flags and unverified-tick combinations before any remote write.
- Develop/Test recording only, bound realpath/non-detached branch/HEAD, authenticated actor, singleton assignment and WRITE_ISSUE authority; no caller-selected identity or foreign-checkout override for this route.
- Root live Scope only. AC, DoD, Verification Commands, lifecycle items, directory contracts and verifier-bearing targets remain owned by their existing routes.
- Comment records are at most 8 KiB canonical JSON / 12 KiB encoded envelope; pointers at most 384 ASCII bytes; resulting body at most 60,000 UTF-8 bytes.
- Current pointer/record and artifacts are checked at authoring, readback and Test-to-Review. Full history is audit data; Close gains no dependency on old checkout/files.
- Keep accepted exact-SHA Test evidence, approval and terminal delivery authority separate. No fabricated exit code, generic marker editor, migration asserting inspection, downstream reset or runtime dependency expansion.
- Preserve original refusal diagnostics; genuine authority/projection drift remains a fence. No stale-body fallback or implicit lifecycle transition.

## File map and dependency order

New files under `scripts/task-tracker/lib/reviewed-scope/`:

| File            | Responsibility                                                                        |
| --------------- | ------------------------------------------------------------------------------------- |
| `model.mjs`     | Constants, strict schema/canonical JSON, request/record digests and pointer envelopes |
| `targets.mjs`   | Live Scope lexer, normalized label/content identity and shared verifier predicate     |
| `runtime.mjs`   | Fresh binding/assignment/actor snapshots and bounded physical file hashing            |
| `comments.mjs`  | Exact same-issue comment read/create and uncertain-create reconciliation              |
| `record.mjs`    | Recording transaction and narrow reviewed body capability                             |
| `readiness.mjs` | Policy/adoption-aware pure orchestration of current-record validation                 |

Modify `verbs/check.mjs`, `lib/body-invariants.mjs`, `lib/issue-body-mutate.mjs`,
`lib/split-plan.mjs`, `states/test.mjs`, `lib/action-decision/review.mjs`,
`lib/action-decision/evaluate.mjs`, `lib/action-decision/normalization.mjs`,
`lib/review-derive-rescan.mjs`, `verbs/review.mjs`, `verbs/close.mjs`, and
`verbs/help-data.mjs`. Paths in this paragraph are relative to
`scripts/task-tracker/`. Add one dedicated Test-exit guard
`lib/test-exit-reviewed-scope-guard.mjs`. Guidance sources are `instructions/aitm-guidance.yml` and supplemental
`skill/SKILL.md`; regenerate the catalog release manifest through `scripts/maintenance/generate-guidance-release.mjs`.

Tasks 1–4 establish the evidence route; Task 5 repairs normalization; Task 6
integrates the generated-child scenario and shipped guidance. Keep the two fixes
in one issue because AC4 exercises the evidence route through the formerly masked
Review refusal, but do not couple their internal validators.

## Data contracts

All hashes are lowercase 64-hex SHA-256. Git commits are lowercase full 40-hex.
Numbers used for issues are positive safe integers. GitHub database IDs are
positive decimal strings of at most 20 digits (no Number conversion). Every object rejects unknown
keys. Text must be well-formed Unicode without NUL; byte limits use UTF-8.

### Manifest and canonical record

Input is UTF-8 JSON (optional one final LF), canonical key order/compact encoding
as produced by `canonicalRecordJson` from
`lib/github-records/canonical-json.mjs`. Require parsed reserialization to equal
input after stripping that one LF: this rejects duplicate keys, noncanonical
numbers and hidden ambiguous representations without a second JSON parser. CLI
help supplies a Node canonicalization example. Schema keys are exactly:

```js
const manifest = {
  schema: 'aitm.reviewed-scope-evidence/v1',
  repository: 'owner/repository',
  issue: 1859,
  worktree: '/canonical/physical/path',
  branch: 'codex/issue-branch',
  head: 'a'.repeat(40),
  label: 'Exact normalized visible Scope label',
  provenance: { kind: 'operator-inspection' },
  rationale: 'What the attachments establish and what remains unproven.',
  artifacts: [{ path: '.scratch/evidence/step.txt', sha256: 'b'.repeat(64) }],
};
```

`historical-command-output` replaces provenance with exactly `{kind, command,
executedAt, sourceRepository, sourceIssue, sourceCommit, unknownCommitReason,
reportedOutcome}`. ISO timestamps must round-trip through `Date.toISOString()`.
`sourceCommit` is null only with nonempty `unknownCommitReason`; otherwise full
40-hex with null reason. `reportedOutcome` is attributed nonempty text, not a
verified success flag. Never execute command text.

| Bound                                                    | Value                                                             |
| -------------------------------------------------------- | ----------------------------------------------------------------- |
| Manifest file                                            | 8,192 bytes                                                       |
| Artifacts                                                | 1–16, sorted lexicographically by normalized path                 |
| One artifact / aggregate artifact bytes                  | 4 MiB / 16 MiB                                                    |
| Relative artifact path / branch / visible label          | 512 / 256 / 1,024 bytes                                           |
| Canonical worktree path / rationale / historical command | 1,024 / 2,048 / 2,048 bytes                                       |
| Historical outcome / unknown-commit reason               | 512 / 512 bytes                                                   |
| Repository name                                          | 256 bytes, canonical configured owner/name                        |
| Encoded comment / canonical record / pointer             | 12,288 / 8,192 / 384 bytes                                        |
| Comment reconciliation pages                             | 100 pages of 100 comments; exhaustion is uncertain, never absence |
| Resulting body                                           | 60,000 bytes including next body-version marker                   |

The aggregate record limit is independent of field limits; a manifest whose
expanded record exceeds 8 KiB refuses before creating a comment. No truncation.

```js
// All interfaces here are exports to implement, not existing APIs.
parseManifest(bytes); // -> validated manifest; throws ReviewedScopeError
requestDigest({ manifest, targetDigest }); // -> SHA256(canonicalRecordJson(...))
makeRecord({ manifest, targetDigest, requestDigest, lineage, predecessor, actor, recordedAt });
// -> {schema:'aitm.reviewed-scope-record/v1', manifest, targetDigest,
//     requestDigest, lineage, predecessor, actor:{id,login}, recordedAt}
encodeRecord(record); // -> {json, sha256, commentBody}
parseRecordComment(commentBody); // -> {record, sha256}; exact canonical envelope
parsePointer(line); // -> null | {commentId,sha256,lineage}; malformed prefix throws
serializePointer(pointer); // -> bounded ASCII string
```

Comment envelope is exactly `<!-- aitm-reviewed-scope-record:v1 sha256="<hex>"
data="<base64url canonical JSON>" -->` on one line, no additional text. Pointer is
exactly `<!-- aitm-reviewed-scope-evidence comment="<decimal>" sha256="<hex>"
lineage="<hex>" -->` on one line. Attribute order is fixed and duplicate/unknown
attributes refuse. The line breaks above explain grammar; serializers emit none.
`predecessor` is null or `{commentId,sha256}`. First lineage is SHA-256 of canonical
`{repository,issue,targetDigest}`; later records retain the line's lineage.
The request digest excludes actor/time, lineage and predecessor; reconciliation
also compares lineage and expected predecessor, so same content on a different
history is not automatically reusable.

Deleted/tampered current comments block readiness. Fresh recording may supersede
one using its syntactically valid predecessor descriptor from the body pointer,
without trusting/fetching the missing payload; preserve predecessor and lineage.
A malformed body pointer requires explicit repair investigation and no write.
Read comment membership from the returned issue URL/node, and require GitHub
comment author database ID to equal `record.actor.id`; retain login as audit
metadata (account renames do not invalidate the stable ID). Record creation uses
the authenticated account, never a caller-supplied actor. These resolve the
accepted spec review's optional recovery/provenance clarifications.

## Task 1: Pure schema, target and compatibility model

**Files:** Create `reviewed-scope/model.mjs`, `reviewed-scope/targets.mjs`;
create `scripts/tests/unit/task-tracker/lib/reviewed-scope-model.test.mjs` and
`reviewed-scope-targets.test.mjs` beside it. Modify `lib/split-plan.mjs` and
`scripts/tests/unit/task-tracker/verbs/split-plan.test.mjs`.

**Interfaces:** `scanScope(body)` returns `{policy,targets,pointers}`, where policy
is `legacy` or `v1`; each target includes `{lineIndex,label,contentDigest,checked,
raw,pointer,verifierBearing}`. `resolveScopeTarget(body,label)` requires one live
matching label issue-wide and exactly one root Scope heading. `isVerifierBearingScopeTarget(raw)`
is shared across all consumers.

- [ ] Write failing pure fixtures before implementation:

````js
assert.equal(isVerifierBearingScopeTarget('- [ ] Verify `vc:3`'), true);
assert.equal(isVerifierBearingScopeTarget('- [ ] Read the command example'), false);
assert.throws(() => resolveScopeTarget('## Scope\n- [ ] A\n## Scope\n- [ ] B', 'A'));
assert.equal(scanScope('## Scope\n```md\n- [ ] example\n```\n- [ ] real').targets.length, 1);
assert.throws(() => parseManifest(Buffer.from('{"issue":1,"issue":2}')));
````

- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/reviewed-scope-model.test.mjs scripts/tests/unit/task-tracker/lib/reviewed-scope-targets.test.mjs`; confirm missing exports/behavior fail.
- [ ] Implement schema constants and serializers using `canonicalRecordJson` and
      `createHash('sha256')`. Validate every nested object and discriminate the two
      provenance shapes. Require exact canonical input bytes and bounds before use.
- [ ] Implement a line-state lexer: fenced blocks opened by at least three matching
      backticks or tildes (up to three leading spaces) end at an equal/longer matching
      fence; multi-line HTML comments are inert. Preserve inline marker comments on
      real checkbox lines for parsing. Root headings are ATX `##` followed by space;
      nested headings stay inside Scope. Root `- [ ]` / `- [x]` only; unsupported
      indented/bullet/uppercase forms cannot be selected for recording. Count duplicate
      live normalized labels over the whole issue. Normalize via existing `stripMarkers`.
      Content hash excludes glyph and reviewed pointer only, not other comments.
- [ ] Implement verifier predicate as conservative recognition of `aitm-verified`
      declaration/proof prefixes, `aitm-verified-by`, `aitm-verified-at`, AC/DoD evidence
      prefixes, `vc-list` attributes and token-delimited `vc:[1-9][0-9]*` in visible
      text, including inline backticks. Malformed recognized prefixes return ineligible
      with a reason; do not turn unresolved declarations into narrative evidence.
- [ ] Update `renderScope` to emit exactly one
      `<!-- aitm-scope-evidence-policy:v1 -->` after the root Scope wrapper's prose.
      Old Generated-by text, body versions and dates do not imply this marker.
      Add actual `buildSplitProposals` fixtures verifying new marker, no accidental
      marker in fenced source examples, and legacy fixtures without automatic adoption.
- [ ] Re-run the two new suites plus `node --test scripts/tests/unit/task-tracker/verbs/split-plan.test.mjs`; expect all pass, including boundary ±1 byte/count cases.
- [ ] Commit only Task 1 files with `[#1859]` in the subject after checking status.

## Task 2: Runtime authority, files and durable comment transport

**Files:** Create `reviewed-scope/runtime.mjs`, `reviewed-scope/comments.mjs`;
create unit suites `reviewed-scope-runtime.test.mjs` and
`reviewed-scope-comments.test.mjs` under `scripts/tests/unit/task-tracker/lib/`.

**Interfaces:**

```js
readRecordingAuthority({ projectDir, invokingDir, issueNumber, cfg, deps });
// -> {repository,issue,worktree,branch,head,actor,state,assignees}
validateLocalEvidence({ manifest, manifestBytes, manifestPath, authority, deps });
// -> {manifestDigest,artifactDigests}; manifestDigest hashes original raw bytes
readCurrentRecord({ repository, issue, pointer, deps }); // -> record or named refusal
ensureRecordComment({ repository, issue, record, expectedPredecessor, deps });
// -> {commentId,sha256,lineage,reused}; uncertain outcomes throw with descriptor
```

`deps` supplies `pexec`, `fs`, `nowIso`, comment REST methods and assignment reader;
production wrappers use repository helpers, tests use explicit fakes.

- [ ] Write fixtures for foreign invoking checkout, detached HEAD, wrong issue,
      branch/HEAD drift, missing/ambiguous assignment, actor mismatch, Review stage,
      path escape, intermediate/final symlinks, directories/devices and changed bytes.
      Use real temporary filesystem fixtures for path checks; fake only GitHub/Git.

```js
await assert.rejects(
  () =>
    validateLocalEvidence({
      manifest,
      manifestBytes,
      manifestPath,
      authority,
      deps: { fs: fixtureFsWithSymlink },
    }),
  { code: 'reviewed-scope-artifact-path' }
);
await assert.rejects(
  () => readCurrentRecord({ repository, issue, pointer, deps: wrongCommentAuthor }),
  { code: 'reviewed-scope-comment-author' }
);
```

Fixture builders above are declared in their test files, implementing the exact
production dependency interface with deterministic fixed bytes and account IDs.

- [ ] Run the two suites and confirm the new behaviors fail.
- [ ] Resolve actual session binding with `resolveCurrentSessionWorktreeBinding`,
      `readWorktreeIdentity`, `readBoundState` and `fetchAssignmentSnapshot`. Compare
      both invoking checkout and resolved projectDir to canonical recorded worktree;
      do not honor foreign-worktree overrides. Read HEAD with explicit cwd projectDir.
      Fetch authenticated user via `gh api user` through `pexec`; require its canonical
      login to match `singletonOwner(assignees)` and live project state Develop/Test.
      Call the existing `isAllowed(state,'WRITE_ISSUE')` state matrix; its API does not
      accept a policy argument. Retain the command's existing activity authority
      preflight rather than inventing a second custom policy evaluator. Fail on any
      unreadable/mismatched authority before comments. Repeat on each transaction attempt.
- [ ] Hash files using lstat on each path component, lexical containment, physical
      realpath containment and regular-file descriptors; reject symlinks, devices and
      directories before opening. Use no-follow open where supported, verify fstat and
      compare descriptor/path identity before/after streaming at most limit+1 bytes.
      Manifest and artifacts cannot be absolute or contain `..`, empty components,
      backslashes or a leading slash; reject physical duplicates/hardlink aliases in
      one request. Preserve external-writer race limitations from the spec.
- [ ] Use `gh api repos/{owner}/{repo}/issues/{issue}/comments` with JSON stdin for
      create and pagination; use `issues/comments/{id}` for read, validating membership.
      Commands are argument arrays; no command text evaluation or remote artifact fetch.
      Read back the exact comment and compare canonical bytes/digest and author ID.
      A successful matching current record is reused before searching orphan comments.
      Reconciliation scans up to 100 pages, with stable duplicate-ID detection and
      repeat final matching-candidate verification. Zero candidates after a complete
      scan permits creation; one exact request/lineage/predecessor/actor candidate is
      reused; multiple candidates or incomplete scan refuses with an uncertain result.
      Preserve orphan comments and never edit/delete comment history.
- [ ] Re-run suites with zero remote writes asserted for preflight failures,
      create-timeout-after-persist followed by reuse, wrong-issue and edited comments,
      duplicate orphan refusal, rate errors and pagination exhaustion. Expect pass.
- [ ] Commit only Task 2 files with `[#1859]` after checking status.

## Task 3: Narrow governed body transaction and CLI route

**Files:** Create `reviewed-scope/record.mjs`; modify `verbs/check.mjs`,
`lib/issue-body-mutate.mjs`, `lib/body-invariants.mjs`. Tests:
`scripts/tests/unit/task-tracker/verbs/check.test.mjs`,
`scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs`, and new
`reviewed-scope-record.test.mjs` in that lib test directory.

**Interfaces:** `recordReviewedScope({ctx,label,manifestPath})` orchestrates Tasks
1–2. A module-private branded capability carries immutable `{targetDigest,
expectedPointer,nextPointer,expectedGlyph}`; only the recording coordinator can
construct it after comment validation. `validateReviewedDelta(base,next,capability)`
permits exactly the target glyph/pointer delta. Generic callers cannot pass a
boolean to admit this family. Preserve capability and body checks on every retry.

- [ ] Write failing tests for all four outcomes (initial, refresh, validated recheck,
      checked no-op), invalid CLI mixtures before I/O, no-op stale-file refusal,
      generic pointer fabrication/removal/move, comment-created/body-failed recovery,
      unrelated fresh body edit and same-target concurrent successor.
- [ ] Run `node --test scripts/tests/unit/task-tracker/verbs/check.test.mjs scripts/tests/unit/task-tracker/lib/body-invariants.test.mjs scripts/tests/unit/task-tracker/lib/reviewed-scope-record.test.mjs`; verify expected failures.
- [ ] Parse reviewed-mode args before batch, directory writes, special-label routes
      and current early checked no-op. Exact one positional token is required; accept
      the deprecated alias through the same function. Reject unsupported directory
      route before `writeDirectoryContractOperation` can mutate a contract.
- [ ] Implement coordinator ordering:

```js
// Conceptual ordering; functions are the exports defined in Tasks 1–3.
const authority = await readRecordingAuthority(runtimeInput);
const manifestBytes = await readBoundManifest(manifestPath, authority);
const manifest = parseManifest(manifestBytes);
const local = await validateLocalEvidence({
  manifest,
  manifestBytes,
  manifestPath,
  authority,
  deps,
});
const target = resolveScopeTarget(await readLiveBody(), label);
const request = requestDigest({ manifest, targetDigest: target.contentDigest });
// Validate existing current pointer; reuse equivalent current request if valid.
// Otherwise construct record using expected pointer predecessor, preflight body
// with maximum-length pointer + next version, then ensureRecordComment.
// Only then issue mutateIssueBody with branded capability and fresh validation.
```

`readBoundManifest` is an export in runtime.mjs using the same physical regular-file
checks and 8,192-byte limit; `readLiveBody` uses the existing issue-body read port.
The request carries original manifest bytes/path and `local.manifestDigest`
privately. Every fresh validation reopens the manifest through the same physical
reader and compares its raw digest before reparsing; canonical equality alone
does not waive byte-change detection within an attempt.
Preflight uses a 20-digit comment ID and exact 64-hex hashes; repeat actual body
size check before every push, including the body-version stamp.

- [ ] Extend `mutateIssueBody` to validate reviewed deltas before its ordinary
      checkbox proof check. Exempt only the validated target from that check; never
      use `evidenceStamp` or `allowUnverifiedTicks`. Keep ordinary AC/DoD guards intact.
      Add policy marker to `findLostMarkers`; forbid generic policy introduction,
      duplication and relocation, while allowing its initial creation through the
      existing split-plan issue-creation path. Detect malformed reviewed prefixes as
      protected too, so edits cannot launder a bad pointer into an unchecked text line.
- [ ] In `validateFreshBaseAsync`, reparse target/section, compare expected pointer,
      refresh authority and rehash files/manifest; compare the rebased next body to the
      freshly derived permitted delta. Note `versionedWriteBody` rebases on retry and
      does not rerun `mutate`; the validator must reject a stale rebased edit. Existing
      `stripBodyVersion` normalization is transport behavior; target mutation preserves
      unrelated bytes of the version-stripped base. Do not broaden CAS or skip checks
      for no-op returns. Read back body and current comment/files after return.
- [ ] Preserve uncertain persistence facts. Do not create another comment after an
      unknown outcome without complete reconciliation. A concurrent changed target or
      pointer refuses, preserving the orphan. Uncheck keeps the pointer; pure recheck
      requires the reviewed route and fresh validation rather than generic proof bypass.
- [ ] Re-run focused suites; assert exact remote-write counts, pointer bytes,
      immutable unrelated markers and retained orphan comment. Commit Task 3 files.

## Task 4: Adoption-aware Test-to-Review readiness

**Files:** Create `reviewed-scope/readiness.mjs`,
`lib/test-exit-reviewed-scope-guard.mjs`; modify `states/test.mjs` and
`lib/action-decision/review.mjs`, `lib/action-decision/contract.mjs` and
`lib/action-decision/legacy-refusals.json`. Add the guard's inventory entry and
registered typed refusal definitions; thread explicit projectDir/binding ports
through `verbs/promote.mjs`, `verbs/review.mjs` and `scripts/gh/move-state.mjs`. Add `scripts/tests/unit/task-tracker/lib/reviewed-scope-readiness.test.mjs`;
extend `scripts/tests/integration/task-tracker/lib/action-review.test.mjs`.

**Interfaces:** `evaluateReviewedScope({body,repository,issue,projectDir,
invokingDir,lifecycleEvidence,deps})` returns `{ok,blockers}`. Guard ID
`test-exit-reviewed-scope` maps blockers to existing registry envelopes with
labels and codes. Return `typedRefusals` from the guard with producer
`test-exit-reviewed-scope`, required args `{label,reason}` (both strings) and
`noAutomaticRemediation:{reason:'operator-reviewed-evidence-required'}`. Register
blocked-only codes `reviewed-scope-current-missing`, `reviewed-scope-stale`,
`reviewed-scope-comment-invalid`, `reviewed-scope-wrong-checkout`; use a distinct
indeterminate-only `reviewed-scope-read-unavailable` for failed authoritative reads.
All codes permit Test-exit phase only. Keep human decision prompts absent. Update
contract/registry tests and run `npm run lint:action-refusals` so a new guard cannot
silently become an unregistered generic refusal. It is a separate Test-exit guard, so accepted-Test completeness
short-circuit cannot bypass it. Directory lane returns existing semantics before
legacy parser/attachment I/O.

- [ ] Write table-driven tests: unversioned hatch/web/old-generated ticks with
      accepted Test preserve behavior; explicit pointers always validate; policy-marked
      unchecked/proofless targets block; machine-bearing targets remain in the existing
      machine route; wrong-section/verifier-target pointers refuse; directory lane
      performs zero artifact/comment reads; non-bound checkout refuses with bound path.
- [ ] Run `node --test scripts/tests/unit/task-tracker/lib/reviewed-scope-readiness.test.mjs scripts/tests/integration/task-tracker/lib/action-review.test.mjs`; confirm failures.
- [ ] Implement the guard using the shared scanner/predicate and current-record
      reader. Read-only authority validates bound checkout and current evidence without
      requiring recording stage or current actor to equal the historical actor; it
      still verifies comment author ID against recorded actor ID. Do not traverse old
      comments. Use separate `readEvidenceContext` export in runtime.mjs for this
      read-only path, leaving `readRecordingAuthority`'s Develop/Test/owner-write checks
      intact. Both share physical checkout and explicit-cwd Git collection.
- [ ] Register in Test's exit guard list for all transition consumers. Audit Review,
      promote and explanation context construction; thread projectDir and invokingDir
      explicitly rather than defaulting to process.cwd inside library calls. Missing
      authoritative context on an adopted target is indeterminate/refused, never ready.
      Reuse existing valid machine evidence checks without redefining them in this guard.
- [ ] Refusals name labels and codes (`reviewed-scope-current-missing`, `-stale`,
      `-comment-invalid`, `-wrong-checkout`), with the reviewed recording command and
      explicit return-to-Test recovery if necessary. Preserve the difference between
      unavailable reads and observed stale evidence. No automatic board edits.
- [ ] Re-run suites plus `node --test scripts/tests/unit/task-tracker/core/guard-registry.test.mjs`; commit Task 4 files.

## Task 5: Preserve complete blocked normalization outcomes

**Files:** Modify `lib/action-decision/evaluate.mjs`,
`lib/action-decision/normalization.mjs`, `lib/review-derive-rescan.mjs`,
`verbs/review.mjs`, `verbs/close.mjs`; extend
`scripts/tests/unit/task-tracker/lib/review-derive-rescan.test.mjs`,
`scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs`,
`action-review.test.mjs` and `action-close.test.mjs` in that integration directory.

**Interfaces:** Export `completeGuardResult(result)` from evaluate.mjs without
relaxing it. `NonReadyNormalization` carries `{decision,body,persisted}` and is
used only to abort a fresh-base attempt; public `persistReadyNormalizations` and
`deriveAndRescan` return complete decision plus actual persistence state. Invalid
results throw a distinct `normalization-decision-invalid` error.

- [ ] Add exact-decision assertions with a valid refusal:

```js
const blocked = {
  status: 'blocked',
  ok: false,
  refusals: [
    {
      id: 'test-exit-pre-close-completeness',
      code: 'test-to-review-incomplete',
      args: { labels: ['Step A'] },
      blockers: ['test-to-review-incomplete: Step A'],
    },
  ],
  humanDecision: null,
  warns: [],
};
assert.deepEqual(result.decision, blocked);
assert.equal(result.persisted, false);
assert.equal(pushes, 0);
```

Include valid indeterminate, no-normalization path, retry turns non-ready, readback
non-ready after successful write, concurrent HEAD drift plus block, malformed
`indeterminate` with zero refusals, unexpected throw and missing readback.

- [ ] Run the unit derive-rescan and integration normalization commands (issue
      vc:2–3); confirm new preservation assertions fail against baseline.
- [ ] Validate envelopes before testing readiness on every path. Initial non-ready
      returns original live body with persisted=false, regardless of pending projection.
      On fresh retry re-evaluate after HEAD check; valid non-ready throws the typed
      carrier before push. Catch only that carrier outside mutation and return its
      decision/body. Unknown exceptions remain distinct errors. On successful write,
      validate projection integrity, then re-evaluate; preserve persisted=true if
      non-ready and stop workflow. Remaining normalization checks and true HEAD/body
      drift retain fence priority over guard failures.
- [ ] Thread decision through `deriveAndRescan`. Change Review's destructuring at
      its normalization call; render the returned non-ready decision immediately using
      its original completeness item list/timing row/exit 4 or existing generic refusal
      renderer. Do not rerun a second evaluator and discard the original cause. Stop
      before transitions, reviewer launch or approval prompts.
- [ ] In Close `evaluateCloseProjection`, construct complete blocked envelopes for
      unchecked and lifecycle failures instead of the explicit drift throw. Retain
      existing reason list, then consume non-ready normalized decisions before close
      side effects. Do not alter force semantics, delivery checks, accepted SHA or
      local-trunk authority. Test delivered/local-trunk fixtures with removed original
      reviewed attachments to show no new dependency.
- [ ] Run vc:2–3 plus action-review and action-close integration suites. Assert
      original humanDecision/warns/code/args survive; no incorrect rollback claim after
      successful normalization. Commit Task 5 files.

## Task 6: Generated-child acceptance and shipped command guidance

**Files:** Extend `scripts/tests/unit/task-tracker/verbs/check.test.mjs` and
`scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs`;
modify `scripts/task-tracker/verbs/help-data.mjs`, `instructions/aitm-guidance.yml`,
`skill/SKILL.md` and `instructions/aitm-guidance.release.json`. Add `scripts/tests/integration/task-tracker/lib/reviewed-scope-flow.test.mjs`.

- [ ] Build a child using actual `buildSplitProposals` with a six-step plan fixture;
      compose the real child template, simulate binding/actor and immutable comments,
      record all six targets at one final HEAD, supply accepted exact-SHA Test evidence
      and assert complete Test-to-Review readiness. Change one attachment: readiness
      blocks with that label; refresh it and regain readiness. Repeat 20 HEAD refreshes
      and assert six bounded pointers, retained comments and no in-body history growth.
- [ ] Add no-write failure coverage for AC/DoD/VC/directory targets, verifier
      representations, wrong bindings, missing artifacts, stale raw manifest bytes,
      unknown CLI flags, pointer fabrication and ordinary blocked normalization with
      pending Functional DoD projection. Verify full records remain historical claims.
- [ ] Run `node --test scripts/tests/integration/task-tracker/lib/reviewed-scope-flow.test.mjs` and confirm the new integrated behavior fails until Tasks 1–5 are connected.
- [ ] Document canonical manifest creation, the exact CLI, both provenance shapes,
      record-after-final-commit timing, bound checkout, artifact retention, comment/body
      partial failures and capacity recovery. Update both ensureChecked and check help;
      state ensureUnchecked does not take this flag. Example canonicalization:

```js
import { readFileSync, writeFileSync } from 'node:fs';
import { canonicalRecordJson } from './scripts/task-tracker/lib/github-records/canonical-json.mjs';
writeFileSync(
  '.scratch/evidence/step.json',
  canonicalRecordJson(JSON.parse(readFileSync('.scratch/evidence/step.draft.json', 'utf8'))) + '\n'
);
```

- [ ] Regenerate guidance with `node scripts/maintenance/generate-guidance-release.mjs --write`;
      run `npm run lint:guidance-release-consumer` and inspect generated-only drift.
      Do not edit the operational peer-review setup files or hook changes in this task.
- [ ] Run all issue commands and focused tests below. Record actual results,
      counts and commit SHA in implementation evidence; this planning document does
      not claim those tests have run. Commit only Task 6 deliverables with `[#1859]`.

## Acceptance map and final verification

| AC  | Deliverable and decisive tests                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1 | Tasks 1–3: both provenances, exact binding/runtime actor, real digests, strict schema, four outcomes, never execution proof                |
| AC2 | Tasks 1–4: owner boundaries, physical escapes, stale/missing/wrong evidence, invalid options, retry/no-op races, generic marker protection |
| AC3 | Task 5: original full blocked decisions in Review/Close, retry and successful-write truth, malformed output and actual drift separated     |
| AC4 | Tasks 4/6: actual split-plan policy child, six honest records, accepted Test, stale refusal and shipped CLI/help/consumer release          |

Exact issue verification commands (run during implementation):

```bash
node --test scripts/tests/unit/task-tracker/verbs/check.test.mjs
node --test scripts/tests/unit/task-tracker/lib/review-derive-rescan.test.mjs
node --test scripts/tests/integration/task-tracker/lib/action-normalization.test.mjs
npm test
npm run test:slow
npm run lint
npm run format:check
git log --oneline -1
```

The three first commands are vc:1–3; the remainder are vc:4–8. Also run every new
unit/integration suite named by Tasks 1–6 and `npm run lint:guidance-release-consumer`.
Add `// @story #1859` to new runtime/tests where repository story-tag rules require
it. No downstream repository reset, external native dependency or live production
comment mutation is needed for these test fixtures.

Plan validation is limited to Markdown/format/link/hash/source checks and the
requested SAR/XPR. Implementation follows separate approval and workflow gates.
