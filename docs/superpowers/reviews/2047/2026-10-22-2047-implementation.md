# Issue 2047 implementation and admission

## Authority and scope

Task 22 at active-plan commit `0ad57329a5eb4e3aec395adb06a6216178e45c87`
delivers the freezer/template slice of original technical Task 8 at
`f2894455a97bb80f6afb82ce5ff722cad2a46c2b`. Governing specification:
`docs/superpowers/specs/2026-10-19-2039-local-estimation-guarded-publication-design.md`
at `dafb1d276036ddc17490f76329f6aa2c09732a15`.

Dependencies #2059, #2061 and #2065 are native Done. Epic #2039 has 21 of
32 direct children Done. This wave-12 child remains in Develop pending
independent source review, complete exact-head CI and native acceptance.
Source base: `f2391676abbfc1f6bde44260259b5b12b2c668d3`.

Execution uses the actual owner app checkout b187 on `codex/2039-draft`,
serial inline implementation with TDD and fresh independent GPT-6.1 Sol /
medium review. All original branches and worktrees remain preserved. No
foreign-worktree override, actor impersonation or production hook change is
part of this work.

Native Start 10705 completed as agent with confirmed relocation and binding
`a81914bc-1a3a-485f-a33f-06741bf6a145`. Plan 53379 completed with all eight
tails; supplied-local estimate 17632 completed through compatibility mode.
The accepted allocation remains S / 3.5h, rubric 0, with no cloud estimation
history; its legacy whole-hour appendix projection does not change that
allocation. The deep dive was posted and mirrored from
[comment 6353200714](https://github.com/kburson/ai-task-manager/issues/2047#issuecomment-6353200714).
Full-Auto Plan approval 76029 completed with audit at
`2026-10-22T23:03:26Z`; promoter 34646 completed Plan to Develop with all
eight tails. Current binding entry is `2026-10-22T23:04:57.780Z`.

Post-context recovery reloaded current guidance, preferences and the complete
live body v38, confirmed issue/worktree/branch/timer identity, and obtained
fresh Explain 93662, exit 0. It reports blocked promotion: unticked AC,
unclassified code-complete and commit-trail guards, with manual-investigation
human-decision fields. These are retained; no Test promotion was attempted.

## Frozen contracts and rulings

`freezeStoryBatch({generation,transition,effects,capabilities})` consumes the
complete verified store record `{manifest,generation,payloads}`. It snapshots
ordinary data and payload bytes before validating the exact native manifest,
transition, actor, visit, baseline and retained working intent. Accessors and
overridden map iteration cannot change approved intent during freezing.
Conflicts and pending batches refuse rather than allocating new intent.

Every dirty resource must have a declared effect. Exactly one final issue
update and the exact native timing candidate are required. Owned comment
updates and creations retain native ownership grammar and exact target,
before/candidate digests and bytes; duplicate logical ownership refuses.
Configured field effects preserve exact item/field/type and typed values,
including null versus explicit absence. Undeclared, self-referential and
cyclic dependencies refuse. The final issue depends on every non-body effect.
The timing effect retains its native empty dependency list so the accepted
persistent confirmation writer can validate it unchanged.

A pure freeze returns one immutable deterministic batch and the next safe
publication generation. It does not persist, dispatch, acknowledge a timing
cursor, or complete a lifecycle transition. The coordinator must atomically
persist the batch and generation before transport. Batch identity hashes
canonical frozen intent and never derives allowances from observed traffic.

The original plan specifies verified-ID and effect-digest slots without
serialization. Ruling: use the closed versioned template schema
`aitm.story-final-body-template/v1` with body, title, declared slots and all
non-body effect bindings. Each slot has an explicit unique token, kind and
effect key. Creation IDs are allowed only for creation effects. All other
bytes remain exact. Reject unused, ambiguous, undeclared and final-body
self-digest slots. Cost if wrong: downstream integration refuses; independent
review and coordinated activation must expose incompatible contracts.

The detached template digest is retained in approvedInputDigests. The final
issue effect has null intendedDigest until actual realization, avoiding a
circular final-body hash. Materialization requires the original detached
hash, the exact full non-body effect set, confirmed outcomes, matching
candidate digests, provider identities and native revision metadata. It
substitutes only declared tokens in one pass, preserves every other byte,
and returns the realized body/title and actual body digest. It never grants
proof or lifecycle authority. The downstream coordinator must validate the
composite again, persist those exact realized bytes/digest and dispatch once.

Native `validateStagedComposite` receives the original opaque operation
references. No capability is reconstructed from JSON, stored in the batch,
or replaced by a permission flag. Only scope input digests are retained.
A genuine native reviewed-scope fixture proves an accepted capability works;
a forged object still refuses. The fixture captures the real coordinator's
minted reference and delegates to its unchanged writer through a temporary
Node test module loader hook. This is test-only, uses explicit offline ports
and controlled unit roots, and does not alter AITM/Codex hook routing.

Ruling: retain observed read-only metadata for issue and comment snapshots.
Native observation deliberately classifies raw content conservatively; the
accepted staging writer authorizes issue changes through native identity and
composite checks, and owned comment codecs establish actual ownership.
Requiring the neutral raw observation to claim ownership would reject valid
native staged work. No foreign comment is adopted. Cost if wrong: ownership
and provenance defects must fail the native codec/composite tests and review.

Ruling: exactly two new runtime modules require an explicit +2 package
inventory allowance. The strict old ceiling failed with measured 974 versus
972 before the update. Both new required paths are also asserted; no
classification or existing comparison is relaxed. Necessary test fixtures
remain outside the production package. Cost if wrong: package inventory and
independent review expose missing or excess runtime content.

Ruling: extract setup into two test-only helper files while preserving every
assertion in the exact named verifier. The final verifier is 701 physical
lines and receives a new soft 400-line advisory (675 code lines in the first
full lint); it remains below the hard cap. This is not an inherited advisory.
Cost if wrong: the named verifier and strict test-reach/package checks expose
broken fixture isolation; readability remains an independent review concern.

## Verification and retained failures

The exact named verifier contains 28 tests. Coverage includes exact frozen
intent, one allocation, original input preservation, title changes, actual
owned comment codecs, five configured native field types, null/absence,
dirty coverage, malformed/foreign targets, dependencies, pending batch and
conflict refusal, genuine native capabilities, accessor/map mutation,
detached template fencing and verified outcome substitution. A refusing
PATH gh and throwing fetch cover freeze, actual durable batch persistence
and the real timing confirmation writer: only the acknowledged timing cursor
advances, while the final issue outcome stays null and the batch stays frozen.

Initial missing module/API failures preceded implementation. Resource-type
failures preceded support for owned comments and typed fields. Genuine
accessor and map-iterator regressions were observed failing before snapshot
hardening. Failed trials remain separately retained, including fixture syntax
and import mistakes, which are not claimed as behavioral RED evidence.
The first implementation incorrectly required raw issue observation ownership;
source-grounded correction used the already accepted staging contract.
The native capability fixture initially loaded too late, then correctly
encountered legacy-version refusal; setup now mirrors the accepted native
scope fixture and excludes only a transport body-version stamp from the
checked base. No production validator was weakened.

Completed pre-final checks include 27 named tests and scoped ESLint, both
exit 0. The last title case was added after that named run. The initial final
logs report 167 focused tests, all 1000 fast files, clean lint and formatting,
but their four exit receipts were lost during context compaction. They remain
archived with exit unknown, never inferred from log tails. Four unchanged-source
receipt runs were necessary to obtain actual exits; their results are recorded
in the evidence manifest and the acceptance addendum below.

The focused command covers batch, timing-candidate, timing-stage,
stage-capabilities, stage-body, stage-comment, manifest and package-boundary.
Full lint includes all canonical inventories, story tags, test reach, doc
anchors, action refusals and guidance release checks. The complete suite
inventory is 1328 files, with 1000 in the fast lane. Existing baselined
advisories remain distinct from the new named-test size advisory.

## Guard refusals and remaining boundaries

In Plan, a combined Python document writer was classified WRITE_CODE and
refused before execution. A literal Markdown-only deep dive used the allowed
WRITE_DOCS activity. A Plan ledger append was separately refused and deferred
until actual Develop. In Develop, a fixture containing an uncontrolled
fictional absolute path was refused before writing; the real test now uses
its existing controlled unit root. Saving a recovery Explain JSON response
was refused as WRITE_OTHER; that file remains unwritten and the native read
was consumed directly. No refused mutation was routed through another writer,
actor, policy, hook or transport override.

This leaf does not implement provider dispatch, recovery, completion receipts,
coordinator activation or current-reader migration. Future issues #2066, #2067, #2048, #2068 and #2071 own those boundaries. Supplied confirmed journal data
is an input contract, not proof that the pure renderer independently queried
a provider. New creation uniqueness and full expected-vector authority still
belong to the native publisher/coordinator. Timing observation internally
samples unused provenance time; no new timing event clock or authority is
introduced.

No local post-candidate slow-suite success, exact-head CI, native Test,
Review, Close or epic completion is claimed here. All remain required after
independent source acceptance and the final review-record commit.

## Initial candidate acceptance addendum

The four unchanged-source receipt runs completed with actual exit 0:
focused 167 tests (session 29998), full fast 1000 files / 114.1 seconds
(session 8979), full lint (86857), full formatting (1577). The focused run
includes all 28 named tests and the strict 974-entry package check. Canonical
test reach scanned 1328 files with 30 baselined offenders and zero new ones.
These prove local candidate verification; they do not replace the pending
independent review, complete exact-head CI or native acceptance.
