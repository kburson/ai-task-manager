<!-- ai-peer-review-template version="1" digest="sha256:f81da1894a46ceb20866070833b4e99ef536ef633542b418783d29e6a981dbd8" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-9db94a29416795699db536014299a9a6"
role: "author"
turn: 1
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/superpowers/plans/2026-09-27-1830-mutation-guard-context.md"
artifact_commit: "fd37bb0427d9e2e876084110b2fc5a8aaf13c664"
artifact_blob: "873e5be211682e8a7698e9176c2e59d4eeee913d"
artifact_digest: "sha256:0001d47ccbceefff30559be86bac66e6fb26abd09228a71bc7cff953369885c7"
agent:
  host: "codex"
  provider: "openai"
  model_id: "gpt-6-astra"
  model_display: "GPT-6 Astra"
  session_fingerprint: "sha256:b7c12ea05fed456bbb58ffde2c284c3281bda5fcdebfbacf3429061d11d9a13c"
  identity_source: "runtime"
started_at: "2026-09-27T20:53:00.459Z"
submitted_at: "2026-09-27T21:36:06.434Z"
finding_ids: []
answered_finding_ids: ["R1-F001","R1-F002","R1-F003","R1-F004"]
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

Revised the plan from r3 to r4 after validating every required finding against
the current source and the live issue. All four required findings are accepted
and addressed in the document; all four optional suggestions are also addressed.
The revised plan SHA-256 is `b381fb29a67f0cf482a38a5ba9c02fb908cfb59d69ad3a3af8865bf11f085aad`.
This is a plan revision, not a claim that the runtime defects have been fixed.

## Finding dispositions

### R1-F001 — Accepted and addressed

Confirmed that `activity-policy.mjs::isAllowed(null, 'COMMIT_DOCS')` currently
returns true; an unknown non-null state already returns false. R4 names that
exact seam and chooses the minimally scoped repair: add `COMMIT_DOCS` to the
null-state refusal set without changing other activity classes. The plan now
requires direct null/undefined/unknown tests and hook-level never-bound, paused,
and unknown-state session tests, distinct from missing binding in Plan.

The review also prompted an ordering check: the activity guard's blanket
chore-mode return currently precedes `isAllowed`. R4 explicitly requires the new
class's binding/state denial before that return, and a chore-plus-unbound negative,
so editing the pure function alone cannot leave a parallel bypass. Existing
chore behavior for other classes remains outside the new allowance. These cases
are in AC4's proof column and implementation step 3.

### R1-F002 — Accepted and addressed; chose the explicit interlock deliverable

Confirmed that activity-guard already enforces the #659 interlock ahead of
scratch/chore, while source-edit's pure decision returns `chore-mode-bypass` for
an installed guard target. R4 explicitly preserves the activity guard ordering
and adds the shared lexical/physical installed-target interlock to source-edit
before chore/scratch returns. The hook resolves all targets first; its pure
decision consumes the validated result.

This is deliberately a new refusal in source-edit considered independently,
consistent with the combined chain's existing installed-guard prohibition. It
is now implementation step 4, an AC4 negative, and assigned to the existing
source-edit and activity tests plus combined-hook integration. Installed links
and scratch aliases are negative controls; ordinary scratch and the package's
own non-installed checkout are positive controls. Chore mode still permits
ordinary targets according to its existing contract.

### R1-F003 — Accepted and addressed; chose existing VC1 test files

R4 resolves the ambiguity without modifying the issue's verification command.
Every direct shared-helper regression table will live inside the existing five
VC1 test files; no separate helper test file is part of this repair. The plan
names all five exact paths and assigns parser/policy, patch, activity/index,
source-edit/ancestry, and combined binding cases to them. It explicitly rejects
suite-wide discovery as a substitute for evidence from the cited `vc:1` run.

All six live ACs still cite `vc:1`. Verified that VC1 contains exactly these five
existing files and that the revised plan names each. No AC was stamped or ticked.

### R1-F004 — Accepted and addressed

Confirmed the baseline `classifyEdit` includes root Markdown and accepts a
widened `docGlobs` policy. R4 defines the new commit predicate as a fixed contract
in the shared guard helper, independent of `activity-policy.json`, including
`docGlobs`, `docGlobsExtra`, and any other policy key. Existing edit classification
remains separately configurable. AC3 and the named helper tables now require
negative tests proving that broad replacements or extras do not admit root
instructions, source/configuration, or executable files as `COMMIT_DOCS`.

## Changes made

The canonical plan is r4. Its revision provenance links to the sealed reviewer
response and retains the committed SAR r3 snapshot as its predecessor. Historical
SAR snapshots and verdicts remain unchanged and apply only to their reviewed
bytes. The four required changes appear both in the relevant policy sections
and in the implementation/verification mapping.

Optional suggestions addressed:

1. Review-stage tracked collateral follows governed rework to Develop and fresh
   Test/Review evidence; there is no new Review commit exception.
2. AC4's intended pre-Develop allowance means exactly Plan for this issue.
3. Conflicting-field rejection is labeled a deliberate behavior change. Identical
   duplicate fields are allowed. Supported adapter fixtures must establish real
   field semantics; if an adapter legitimately carries different metadata, define
   its explicit extraction contract and compatibility tests before switching.
4. The activity-policy header's deferred Epic W2 (#67) note must distinguish the
   Git discovery covered here from broader shell write-target extraction still
   deferred; this issue does not claim completion of that epic.

## Declined changes and rationale

None. For the review's offered alternatives, selected the explicit source-edit
interlock and existing-five-files VC1 approach. For null state, selected the
specific new-class refusal instead of changing the allowance of every existing
activity class. No acceptance authority, runtime success, or human Plan approval
is inferred from this author response.

## Verification

- Read the entire sealed reviewer response and the current plan, then inspected
  the named source seams and existing target test files before revising.
- Ran read-only baseline probes: null-state `COMMIT_DOCS` returned true;
  unknown-state returned false; root `CLAUDE.md` and widened-policy source paths
  classified `WRITE_DOCS`; installed-target source-edit with chore mode returned
  `chore-mode-bypass`. These reproduce old behavior, not passing repair tests.
- Verified the live issue's six `vc:1` references, its five targeted test paths,
  file existence, and exact coverage of those paths in r4.
- Checked every local Markdown link in the revised plan resolves.
- `prettier --check` passed for the revised plan; `git diff --check` passed.
- Preserved protected response frontmatter. No source/test implementation files,
  lifecycle approval markers, or SAR historical evidence were changed.
- The package's author submit will seal this response and commit only its owned
  paths. Reviewer acceptance and finalization have not yet occurred.
