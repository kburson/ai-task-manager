# #1861 JIT Plan review and kernel contract admission

Reviewed plan digest: `sha256:cb48cd6858736be885bf533a12c7955f7d122c97c1903231c7f6d2686688dec7`.
Reviewed design digest: `sha256:23c53cb2487e9f04f04b5bcd6e8d548438dd525247260818d07d8cd232d712af`.

This is the current implementer's semantic/design review for the normal Full-Auto Plan gate, not independent SAR/XPR or final code review. Historical parent acceptance remains historical. Lifecycle approval is recorded only by the registered command.

## Semantic stakeholder-value review

1. Stakeholder: yes. The operator recovering an interrupted runtime command receives the safeguard; the implementation agent is not the beneficiary.
2. Capability: yes. Complete recoverable publication and ordinary-read refusal are observable behavior, not issue completion.
3. Need: yes. Current saveState writes binding, actor and global authority separately; a killed process can interrupt the sequence.
4. Counterfactual value: yes. Mixed authority cannot silently drive later lifecycle commands.
5. Grounding: yes. Existing child ACs, accepted R3 contracts, inspected writer/storage/lock code and new JIT design support each claim.
6. Sibling distinctness: yes. C1 supplies the kernel; C2 adopts it at consumer boundaries, C3 proves cleanup, C4 ships guidance and C5 verifies/adopts the combined release.
7. Standalone readability: yes. The persisted Connextra story names the operator, interrupted publication gap and prevented contradictory reads.

## Findings resolved before implementation

The initial JSON-only batch sketch was insufficient for capture binary payloads and question-marker removal. The saved design now defines a raw-byte primitive with explicit deletion, a JSON adapter, proposed-sibling catalog checks and optional exact expected-before assertions. No caller callback grants arbitrary record authority.

A completed receipt must not replay old payloads over later writes. The contract now makes completed retries non-publishing. Recovery remains exact observed replay for unfinished transactions, with whole-conflict-set validation before writes and protected coordinator ownership.

Canonical Story Intent now uses the four required labeled fields. Shared registration hunks have one editor. The new test path is declared, retained inherited WIP is protected, and C1's first full-unit failure attribution is explicit. No independent child review or passing new implementation is claimed here.

## Verification and budget

Fresh preimplementation consolidation: six existing kernel files, 24 tests passed, zero failed/skipped, 14.377 seconds. Source syntax checks for the two resolved overlap modules passed earlier. These observations do not satisfy final ACs, full unit/aggregate/slow/lint/format or final review.

Adopted planning allocation: kernel 5h, real crash verification 3h, full-unit classification and attributable repair 2h, planning/review repair 2h. Registered Plan estimate convergence produced forecast `01M3ZCCN5D9T5HAW6F8XDH61RX`; its live record remains authority. The 12h allowance is judgment-based, not measured engagement. Reassess material interface expansion or threshold overrun. Epic coordination remains separately tracked.

## Interface disposition

The saved design freezes C1's candidate batch/read/refusal/observation/recovery contract and registered grammar for later child planning. C2/C3/C4 must record their consuming contract and test ownership before adoption. Verification may expose necessary changes; such changes reopen this review and affected dependent acceptance. Live runtime migration and destructive selections remain separate operator admissions.

## Approval provenance correction

The first agent invocation omitted the documented `TT_FULL_AUTO=1` selector. The delivered control consequently wrote a human-mode marker without human approval. No source implementation or state advance followed. The agent used sanctioned `cancel-plan` with an explicit correction reason, moving Plan back one edge and invalidating the marker/forecast/deep-dive signals. Re-entry into Plan and renewed signals/estimation use normal commands. Session Full-Auto was explicitly recorded by `auto both`; corrected approval must use the documented selector and read back `provenance=full-auto`. The cancelled human marker is not acceptance evidence.

## Fresh decomposition reassessment before source implementation

Corrected approval at 2026-10-02T22:49:09Z read back `provenance=full-auto; Full-Auto audit=posted`. A fresh Explain nevertheless returned blocked on `plan-exit-decomposition`, requesting human investigation. No source implementation or Develop transition has occurred.

The actual registered convergence is XL/20.5h, not the input L/12h allowance. With two independently verifiable plan tasks, the existing guard produces `must-split` from `xl-verification-groups`; estimate 20.5h also triggers review. The saved 12h allowance is a separate remaining agent-engagement judgment and cannot replace or relabel the converged field.

Concrete recommended disposition: retain the existing C1 child and its exact XL/20.5h estimate through a human-approved Decomposition Waiver, with the following scope. Rationale: batch publication and its killed-process recovery proof form one kernel outcome; neither is acceptable without the other, and the accepted epic already assigns five remaining delivery children. Expected focused duration: 12h remaining agent engagement, subject to reassessment; the human baseline remains 20.5h. Checkpoints: complete exact batch contracts and focused verification, then complete crash inventory and full-unit attribution; reassess at either material contract expansion or 12h actual child engagement. Why no nested children: retain the explicitly accepted C1–C5 graph and avoid separating implementation from necessary crash proof. All ACs, verifiers, review/delivery gates, preservation and operational admission requirements remain in force.

Approval is pending. No Approved-by/Approved-at fields, waiver, exception record or user decision has been fabricated. Alternative disposition is to revise the accepted graph and decompose #1861 through the sanctioned dry-run/review/hydration workflow. Implementation remains held until the human resolves this explicit planning-policy boundary.

## Local versus cloud verification correction

The user clarified that this machine runs lint, format and TIA-selected tests only; complete suites belong to PR/cloud execution. That explicit instruction supersedes older planning assumptions about execution location. No complete suite has run locally in this continuation; only the six focused consolidation files ran.

Source of the erroneous local run: the accepted parent decomposition, line 107, assigns C1 the first complete post-kernel unit lane and attribution; C1's section repeats it. The child issue inherited this requirement and declares full unit/aggregate/slow commands. The newly authored child plan incorrectly placed `npm run test:unit` directly in Task 2's local implementation sequence. Ownership of verification and regression repair does not require local execution.

Current Node verification provider separates Develop iteration (affected-path lint/format and test-impact selection), Develop finalization (lint-full, format-full), and Test complete lanes. CI runs full unit and integration lanes on PRs; the slow lane requires ci-slow, dispatch or schedule. However the current `/task test` implementation still executes complete lanes in a sandbox on the invoking machine. Merely deleting full-suite commands from a plan or issue does not make that local workflow compliant, because the provider adds complete lanes independently.

Required correction before implementation admission: local checks are lint/format plus canonical TIA selection and necessary owned contract tests; C1 retains ownership of full-lane classification/repair using cloud exact-head PR evidence. Keep full verification requirements, move execution to cloud, and use supported evidence consumption without fabricated local receipts or changing runtime authority to unblock. Reassess the child plan/estimate and decomposition disposition after that correction. The prior waiver question is premature while this testing allocation is being corrected; no waiver has been approved or recorded.

## Corrected candidate review

Current plan digest: `sha256:3628275a6cc7e61ea598e11864ebe9ddd67bfbc1cc790528fd92a063226be896`.
Current design digest: `sha256:383821963915edd3f8ffc9ad0f0a2e587530c26d1f62feb67097be569e1d85cb`.

Ruling: treat crash proof as steps of the same kernel implementation outcome and move complete-suite execution to PR/cloud acceptance, rather than retaining a separate local full-suite implementation task. The original two-task draft split one required contract between implementation and proof. All substantive crash work, verifiers, regression attribution and budgets remain; none is removed or weakened. Cost if wrong: dependent child interfaces or cloud evidence cannot pass acceptance and the child must be replanned. This is a substantive plan correction grounded in the user's local execution boundary, not a size/estimate relabel, hidden exception or approved waiver.

Read-only classification with the unchanged actual XL/20.5h field now yields `needs-decomposition-review`, one task and one local verification group. XL and estimate >=16h still require review. The implementer reviewed the corrected coherent boundary: no independently acceptable crash-proof-only deliverable exists; C2 production adoption, C3 cleanup and C4 installation remain distinct existing children. One local TIA path covers the kernel edits and owned RED/GREEN tests; cloud lanes retain complete acceptance coverage. The seven-question stakeholder review remains valid and the four Story Intent fields are unchanged. Exact new estimation evidence distinguishes the kernel from dependent proof/repair and cloud execution. A fresh live Explain and renewed genuine Full-Auto approval still own admission; this document does not declare the gate passed.

The earlier pending waiver proposal is superseded by this corrected plan. No human waiver or authority record was written. The unsupported local/cloud Test evidence path remains an explicit later-stage limitation to resolve through supported workflow, not permission to run complete suites locally.

Final pre-admission plan digest after the explicit TIA baseline ruling: `sha256:0e529e3914c809eef1c5445009ee6bd86a57c7638f05d4b7e1b1a8494b8bf06d`. Fresh corrected estimate remained XL/20.5h, forecast `01M3ZFER30CEVCDQP51CRH9PH5`. Renewed registered approval read back 2026-10-02T23:34:21Z, mode full-auto, canonical audit posted. The review accepts one cohesive kernel outcome with bounded continuation TIA, full restored-candidate verification in cloud, and unchanged ACs. No size reduction or human waiver was used. TIA preflight selected 1,248 tests with full three-lane escalation from inherited scratch-dir work and was not executed. Iteration uses the byte-verified recovered baseline and records that limited coverage explicitly; cloud retains complete candidate acceptance.
