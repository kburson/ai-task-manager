# Reviewer Review — Round 4 — #1219 Continuous Agent Delivery Amendment (specification only)

Reviewer: `claude` (independent NAVIGATOR/REVIEWER)
Protocol: `c1655cdd-f0c8-48fd-95e3-57af190d9f0c`
Artifact reviewed: `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md`
Reviewed commit: `1375edfd4b29c98e407ae428a15f992dbdff2cd6`
Reviewed blob: `c7f340fc3cfa020be08c8023bac9c7077e263bfb`
Comparison baseline: `origin/trunk` = `07984e5137ba53f56fe062a351e5dd4111fb87bd`
Prior review: `round-2-reviewer-review.md` against `3370ccb8cafb42b629de1561094310f72d2b35a4`
Author response: `round-3-owner-response.md`

Scope note: I reviewed only the specification above, at the exact handed-off
commit, reading the complete 768-line document rather than the diff, and
evaluating interactions among the accepted corrections. I read no implementation
plan and issue no findings against one. Required supplements: none are active
(`status.activeSupplements = []`), so there is no `[supplement:S-n]` marker to
acknowledge.

---

## 1. Verdict

**ACCEPT**

No blocking findings remain. All eleven round-2 findings are corrected in
committed bytes, each with text that verifies against live repository evidence
rather than restating the objection. The corrections interact cleanly: the
recorded-branch definition, the collapsed-tier close lane, the exclusive
implementation-record variants, and acceptance tests 25-27 reinforce one another
instead of opening new seams. The specification is internally consistent and
executable as design authority for #1219.

Two non-blocking follow-ups are recorded below. Neither changes the design's
meaning and neither should hold acceptance.

---

## 2. Blocking findings

None.

---

## 3. Disposition audit — round-2 findings

I verified each correction against the committed specification and against
`origin/trunk`, not against the response text.

| Prior | Author disposition | Verified | Evidence |
| --- | --- | --- | --- |
| F-001 | accepted | Yes | Line 461 emits `aitm.delivery-receipt/v2`; lines 489-491 reserve v1 as closed legacy that "is never emitted for an enrolled candidate and is never accepted as delivery authority for one." `aitm.delivery-receipt/v2` appears in no file under `origin/trunk:scripts`, so the collision with `delivery-records.mjs:8` and its `RECEIPT_KEYS` exact-key validator is gone. |
| F-002 | accepted | Yes | Lines 136-138 define recorded branch as "the issue's latest valid, unambiguous `aitm-worktree-location` authority record" and exclude synthesized fallback. Lines 341-348 make enrollment fail closed on missing/malformed/ambiguous authority, pin both literal refs and the classification in the digested manifest, and state that "a later collateral edit cannot create, remove, or reclassify its delivery boundary." That closes both directions of the round-2 failure mode. |
| F-003 | accepted-with-modification | Yes, and the modification is stronger than requested | Lines 322-327 add the narrow collapsed-tier close lane bound to terminal child receipts plus one `aitm.no-commit-delivery/v1` authorization, with "No issue with a real repository delivery boundary may use this exemption." Lines 518-522 go further than I asked by making the two implementation-record variants mutually exclusive and requiring a **non-empty** `childReceiptIds` set. I accept the modification: the non-empty constraint is the part that prevents a childless issue from reaching Done through the exemption. |
| F-004 | accepted | Yes | Lines 732-735 now target `docs/guides/workflow.md` → "Full-Auto Doctrine (autonomy boundary)" and `scripts/tests/unit/task-tracker/core/full-auto-doctrine-doc.test.mjs`. Both exist on `origin/trunk`; the heading string matches `workflow.md:661` exactly, and the test path matches the file that asserts on it. No `skill/shared/rules/full-auto.md` is named anywhere in the document. |
| F-005 | accepted | Yes | Lines 727-729 add `skill/shared/rules/state-walk.md` and the Review guidance in `skill/shared/rules/functional-dod.md`, scoped to "prohibit enrolled Review-to-Develop demotion while preserving the declared legacy path." Both files exist on `origin/trunk`. The legacy carve-out is the right scope: `state-walk.md:33` must keep documenting demotion for unenrolled issues. |
| F-006 | accepted | Yes | Lines 409-414 and 420-426 define `aitm.runtime-capability/v3` as a strict successor that "preserves the version 2 identity fields and adds an execution-root digest," with v2 "never extended in place." Lines 561-563 repeat the binding. This resolves the round-2 problem that `runtime-capabilities.mjs:52-67` closes v2 by `exact(...)` and seals it with `capabilityDigest = hash(identity)`. `aitm.runtime-capability/v3` appears in no file under `origin/trunk:scripts`. |
| F-007 | accepted | Yes | Lines 580-584 name the incumbent pre-amendment runtime on the designated `authorityHostId`, identified by a valid `aitm.runtime-capability/v2` capability and installed execution context, as the genesis authority, and confine it: "Its sole new-protocol authority is to validate the protected-ref delivery and append the first activation record; it cannot authorize an enrolled candidate." That is exactly the narrow bootstrap the chain needed, and it preserves acceptance test 20. |
| F-008 | accepted | Yes | Lines 556-559 now require that "After resolving symlinks, the trusted runtime refuses when either root contains the other; mere path inequality is insufficient." That is strictly stronger than `execution-context.mjs:171`'s `toolRoot === sourceRoot` alias check and matches the rehearsal path's `containedBy` discipline at `execution-context.mjs:120-126`. The realpath clause matters in a dogfooding checkout where `node_modules/ai-task-manager` is a self-symlink. |
| F-009 | accepted | Yes | Lines 759-762 add hosted CI workflow and exact required contexts on every literal pilot target, observed on a non-authoritative rehearsal PR, as a prerequisite separate from protection, with both failing closed. |
| F-010 | accepted | Yes | Acceptance test 24 at lines 703-705 proves each gate can be enabled alone without enabling either other, and that all three default to disabled. That matches the shipped `gate-resolve.mjs` defaults and the `CHOICE_PATCHES` additive choices on `origin/trunk`. |
| F-011 | accepted | Yes | Lines 13-21 name #1512 in the authority clause, keep it authoritative for the three human gates, and state the amendment's change precisely: "adds the mandatory flow-review step before its manual-code-review decision and does not redefine an enabled gate's human authority." |

Acceptance tests 25, 26, and 27 (lines 706-715) give the three structural
corrections their own proof obligations, which is the right place for them.

---

## 4. Answers verified

I checked the author's four answers against live evidence rather than accepting
them:

1. **Recorded-branch authority source.** Correct. `aitm-worktree-location` is the
   real marker name
   (`origin/trunk:scripts/task-tracker/lib/issue-worktree-location.mjs:7-8`), and
   the spec's "latest valid, unambiguous" phrasing matches the resolver's actual
   semantics precisely: `resolveCurrentIssueWorktreeBranch` takes the last record
   (line 79), throws on a malformed record (lines 68-74), throws on an ambiguous
   same-timestamp conflict (lines 80-88), and returns `null` when absent (line
   77). The only behavior the specification changes is the `null` case, where
   `resolve-epic-lineage.mjs:68` currently falls back to a synthesized name and
   the specification now requires refusal. That is a minimal, well-targeted
   change.
2. **Collapsed tier reuses `aitm.no-commit-delivery/v1`.** Correct and consistent
   with `origin/trunk:scripts/task-tracker/lib/no-commit-delivery-record.mjs:8`
   and its consumption in `verbs/close.mjs`. No new aggregation schema is needed.
3. **`aitm.runtime-capability/v3` as strict successor.** Correct; see F-006 above.
4. **#1219 and #1220-#1225 all record `cloud-test-automation`.** Verified live.
   Reading the latest `aitm-worktree-location` marker from each issue body:
   #1219, #1220, #1221, #1222, #1223, #1224, and #1225 all record
   `branch="cloud-test-automation"`. #1226 records `feature/child/1226`. So the
   collapsed-tier rule is written for the live topology, not a hypothetical one,
   and the rule's genericity is preserved because classification is proven by the
   enrollment snapshot rather than assumed from the family.

---

## 5. Non-blocking follow-ups

`[finding:F-012]` **A leaf story whose recorded branch equals the shared ref is
the live majority state, and the guard against mis-collapsing it is derivable
rather than stated in the enrollment paragraph.** Sampling the #1219 family's
childless stories, ten of eleven record the shared ref as their own branch:
#1227, #1232, #1236, #1237, #1238, #1239, #1240, #1242, #1244, and #1247 each
record `branch="cloud-test-automation"` with `subIssues.totalCount = 0`; only
#1226 records a distinct `feature/child/1226`. That is legitimate before a child
head is cut, and the specification does reach the right answer three ways: line
350 scopes collapse to "a nested epic"; line 353 requires a child story to hold
"a distinct governed head branch before it can open a PR to that shared target";
and line 521 requires a non-empty `childReceiptIds` set, which a leaf can never
satisfy. But the enrollment paragraph at lines 341-348, which is the passage that
pins classification for a generation, states the equality test's inputs without
restating that a collapsed classification also requires the tier to have
children. Given that enrollment happens at Backlog-through-Plan (line 622), when
this equality is expected and benign, one clause in that paragraph — a tier
classifies as collapsed only when it has at least one child and no candidate of
its own — would put the guard where the classification is computed. I am
explicitly not blocking on this: the three existing constraints already
determine the correct behavior, and I verified that no reading of lines 322-327
alone lets a childless issue close, because Done also requires a complete
implementation record and line 521 forecloses the collapsed variant for it.

`[finding:F-013]` **The runtime is referenced by two differently named
identifiers.** The candidate record binds the runtime by digest —
`"capabilityDigest": "64-hex"` and `"executionRootDigest": "64-hex"` (lines
410-412) — and line 420-421 states the reference is "by capability digest". The
delivery receipt instead carries `"runtimeCapabilityId": "opaque-id"` (line 477),
an identifier whose resolution to that digest is not defined, while acceptance
test 22 requires the receipt to bind "runtime identity". Naming the receipt field
for the same capability digest, or stating how the id resolves to it, would make
the binding verifiable end to end. This predates the round-3 revision; I did not
raise it in round 2 and it does not affect any accepted correction.

---

## 6. Optional improvements

None. The two items above are the complete residue.

---

## 7. #1486 sequencing verdict

**Unchanged and now recorded in the specification: advisable cleanup, not a
prerequisite.**

Lines 386-390 state the agreed verdict and add the load-bearing clause: "Whether
consolidated or not, every enrolled consumer must implement the single
fail-closed recorded-branch contract above." That is the right formulation — it
places the obligation on the contract rather than on the refactor, so #1486 can
land before, alongside, or after the enrolled merge-back work without changing
what correctness requires. #1486 remains OPEN and behavior-preserving by its own
scope.

---

## 8. #1512 compatibility verdict

**Compatible, and now explicitly reconciled.**

Round 2's verification stands unchanged: `origin/trunk` `07984e5` carries all
three gates as genuinely independent controls
(`gate-resolve.mjs:4-14` defaults all `false`; `session-store.mjs:81-93` supplies
the additive `manual-plan` / `manual-code` / `manual-task` and `auto-*` patches
alongside the legacy whole-policy choices), and the specification keeps spawned
flow-review evidence strictly separate from human exact-head approval at
Invariant 8 (lines 157-159), the terminology entries (lines 117-125), and the
merge-authorization paragraph (lines 251-255 equivalent, now at the same
boundary).

The round-3 revision resolves the one ambiguity I raised: lines 13-21 name #1512
in the authority clause, leave it authoritative for the three human gates, and
scope the amendment's change to adding the flow-review step before the
manual-code-review decision without redefining an enabled gate's human authority.
Acceptance test 24 now proves the independence property the specification claims.
Nothing in the revision weakens #1512's eligibility, exact-head, or
assignment-is-not-approval requirements.

---

## 9. Questions for the author

None. My four round-2 questions were answered and independently verified in §4.

---

## 10. Reviewed SHA and evidence inventory

**Artifact under review**

| Item | Value |
| --- | --- |
| Path | `docs/superpowers/specs/2026-09-04-1219-continuous-agent-delivery-amendment-design.md` |
| Commit | `1375edfd4b29c98e407ae428a15f992dbdff2cd6` |
| Blob | `c7f340fc3cfa020be08c8023bac9c7077e263bfb` |
| Lines | 768 |
| Author commit subject | `docs(spec): resolve delivery authority review findings [#1219]` |

**Author-turn discipline verified**

- `git show --stat 1375edfd` — one file changed, 92 insertions, 18 deletions,
  and that file is the authoritative specification. The round-3 turn changed only
  the artifact, as the protocol requires.
- `git rev-parse HEAD` = `1375edfd4b29c98e407ae428a15f992dbdff2cd6`;
  `git status --porcelain` clean; branch `cloud-test-automation`.
- I reviewed the complete document at that commit, including sections the diff
  did not touch, and checked the corrections against one another.

**Repository evidence consulted this round**

- `origin/trunk:scripts/task-tracker/lib/issue-worktree-location.mjs` (lines 7-8,
  55-57, 63-90) — recorded-branch semantics for §4.1.
- `origin/trunk:scripts/task-tracker/lib/resolve-epic-lineage.mjs:68, 86-88` —
  the synthesized fallback the specification now prohibits.
- `origin/trunk:scripts/task-tracker/lib/delivery-records.mjs:8, 53-67, 247-251` —
  confirming the v1 collision is resolved by the v2 rename.
- `origin/trunk:scripts/task-tracker/lib/no-commit-delivery-record.mjs:8` and
  `verbs/close.mjs` — confirming the collapsed-tier lane reuses a real record.
- `origin/trunk:scripts/task-tracker/lib/evidence-v2/runtime-capabilities.mjs:52-70`
  and `.../execution-context.mjs:120-126, 168-171` — F-006 and F-008 confirmation.
- `origin/trunk:scripts/task-tracker/lib/gate-resolve.mjs`,
  `.../session-store.mjs:78-100` — §8.
- Schema collision sweep over `origin/trunk:scripts`:
  `aitm.runtime-capability/v3`, `aitm.delivery-receipt/v2`,
  `aitm.runtime-activation`, `aitm.flow-review`, `aitm.delivery-candidate`, and
  `aitm.implementation-record` each appear in zero files. Every schema identifier
  the specification introduces is now free of collision.
- Documentation-target existence check on `origin/trunk`:
  `skill/shared/rules/state-walk.md`, `.../functional-dod.md`, `.../close.md`,
  `.../deliver.md`, `.../review.md`,
  `scripts/tests/unit/task-tracker/core/full-auto-doctrine-doc.test.mjs`, and
  `docs/guides/workflow.md` all present. Every path named in Documentation
  Changes now exists, except `skill/shared/rules/test.md`, which the document
  correctly marks "create".
- `docs/guides/workflow.md:661` — heading text matches the specification's
  citation verbatim.

**Live GitHub evidence**

- Latest `aitm-worktree-location` branch per issue: #1219, #1220, #1221, #1222,
  #1223, #1224, #1225 = `cloud-test-automation`; #1226 = `feature/child/1226`;
  #1227, #1232, #1236, #1237, #1238, #1239, #1240, #1242, #1244, #1247 =
  `cloud-test-automation` with zero sub-issues each. Supports §4.4 and F-012.
- Repository protection unchanged from round 2: one active ruleset,
  `Protect trunk` (id `20694244`), scoped to `~DEFAULT_BRANCH`, so the pilot
  prerequisites at lines 753-762 remain necessary and correctly fail closed.

**Review conduct**

I made no edits to any repository-tracked file, no commits, no pushes, no issue
or project mutations, and created no follow-up issues. The only file I created
this round is this review, under the ignored protocol runtime. I did not edit or
reuse my round-2 review.

**Decision:** `accepted`
