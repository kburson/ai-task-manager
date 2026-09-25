# Issue 1787 Review Collateral

This index distinguishes archived review evidence from current acceptance.
Committing a generated response or invitation does not submit a protocol turn
or confer acceptance.

## Specification

- Review `review-5c1846703362de090f3843bf4a5f75e8` is the superseded GPT-5 author
  run. Its startup, invitation, submitted second reviewer response, and untouched
  unfinished second author-response template are preserved as historical
  collateral. The unfinished response has no author disposition or submission;
  it is not acceptance evidence and must not be completed retroactively.
- Review `review-341532c92eac97134dfede8a4f29fba6` is the subsequent Astra 6 /
  Opus 5 spec review. Its existing manifest is the acceptance record, not the
  startup or invitation files. It accepted spec blob
  `4a6fa02c2c951899117601caa47697d167a42b6d` at artifact commit
  `b02b4b2660caac4ca2df31570d2cee44a1c6a1b0`; finalization commit is `3358b074`.

Generated protocol collateral is preserved byte-for-byte. Scratch events,
provider session handles, and transient transport state are not included.

## Plan

The [implementation plan](../../plans/2026-09-24-1787-delivery-waiver.md) was
initially committed in `f3f27345`. Author SAR ran four rounds with finding
counts 2, 2, 2, 0. The [final SAR](plan/SAR/self-review-r4.md) reviews plan commit
`825cf5a750ccdf857c9da20f5e45f9104df1f59a`, SHA-256
`3d513a3943596389d27e283b93bdec93dd51638e3c502993947804ea4ce42618`.
SAR evidence was committed through `72d1ce79`.

The user authorized plan XPR with Claude Opus 5 after all existing collateral
was committed. That is a separate plan review, not an extension or alteration
of the finalized spec review. SAR convergence alone does not confer independent
plan acceptance or implementation approval. The new XPR's event authority and
eventual manifest determine its status.

### Finalized Plan XPR

Review `review-ceeecb3db9ae33154a3aa9cd648031fd` is now accepted by
reviewer consensus between GPT-6 Astra (runtime author identity) and Claude
Opus 5 (declared reviewer identity, launched as `claude-opus-5`, high effort).
The [manifest](../../../peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-ceeecb3db9ae33154a3aa9cd648031fd/review-ceeecb3db9ae33154a3aa9cd648031fd-review-manifest.md)
was committed in `24e50125`. It pins plan commit
`5b1a4d91e4340b2a828d0dcd9ee24430bb0304fc`, blob
`bfc352b5725916f1fbb465dcf1b3dba13ddb98bc`, SHA-256
`785478b50d21c6001388c6edabca76470d99569f5cdde11be5dc326f2d09a6c0`.

Round 1 requested four changes; the author addressed all four and the five
optional suggestions. Round 2 accepted with no findings or required changes.
Its three optional implementation refinements remain in the
[final reviewer response](../../../peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-ceeecb3db9ae33154a3aa9cd648031fd/review-ceeecb3db9ae33154a3aa9cd648031fd-reviewer-response-2.md):
an additional topology-error precedence fixture, explicit fresh-v1 input-key
selection, and renderer assertions for all terminal ambiguity fields. They are
not unresolved acceptance challenges and must not be described as changes
already made to the accepted plan.

The normal launcher reproduced the known turn-two response-routing defect
tracked in `kburson/ai-peer-review` #91. It returned `outcome-unknown` without
submitting. One recovery used the official same-session Claude resume command
with the current event-derived response path and package-generated exact
permissions. Claude submitted round 2 from that same registered session, with
no permission denials. No scratch state, protected metadata, reviewer identity,
reviewer response text, or Git boundary was rewritten by the author to recover.
This operational recovery is recorded here; the manifest's empty `recoveries`
array describes protocol recovery events, not transport attempts.

Acceptance is durable normal-commit review evidence, not human Plan approval:
the manifest reports `authority_assurance: unavailable` and no human signed
attestation. No lifecycle promotion, runtime implementation, real waiver,
publication, push, or merge was performed. The accepted specification is unchanged.

### Story Intent Amendment XPR

After the prior branch landed through PR #1789, the root Story Intent amendment
was committed in `f48cf94a`. A new, independent normal-commit review
`review-4547416fdb31d53d90c8c77ea4a8ba3a` now accepts the amended and
decomposition-ready plan. It does not rewrite or extend the earlier manifest.

The [new manifest](../../../peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-4547416fdb31d53d90c8c77ea4a8ba3a/review-4547416fdb31d53d90c8c77ea4a8ba3a-review-manifest.md)
was finalized in `6772b233` with reviewer consensus between GPT-6 Astra (runtime
author identity) and Claude Opus 5 (declared reviewer identity, launched as
`claude-opus-5`, high effort). It pins:

- Artifact commit: `a830796fc6dfae4f1c548224261ced6e8e91c172`
- Plan blob: `40c26773cee48ee14d66b2e1550122f43725ef53`
- SHA-256: `3cd2d2e87de671e93477a7271f278019631a329db28c981f6bae09844c94d9f0`

Round 1 requested root-clause corrections, parser-visible task headings, and an
explicit decomposition lane. The author supplied all three, including eleven
distinct task intents and labeled verifier fences for sequential dependent child
issues. Round 2 accepted with no findings or required changes. The author ran
the live root/task/proposal validators and 101 targeted contract tests; Claude
independently traced the artifact through source. His attempted validator shell
command was denied by the exact reviewer permissions, which were not widened;
he explicitly does not claim to have rerun those tests.

The known launcher turn-two routing issue was avoided using the official
same-session Claude resume command with package-generated exact permissions and
the event-authorized pending response. Claude submitted his own decision from
the same registered session. No protected metadata, private provider state,
identity, or reviewer Git boundary was altered.

The [accepted response](../../../peer-reviews/plan/2026-09-25-2026-09-24-1787-delivery-waiver-review-4547416fdb31d53d90c8c77ea4a8ba3a/review-4547416fdb31d53d90c8c77ea4a8ba3a-reviewer-response-2.md)
retains three optional execution notes. Carry these into the governed handoff
without silently changing the accepted artifact: the parent needs the sanctioned
epic/WBS topology and a pinned `Decomposition-plan` before its own Develop entry;
future splitting must use the final accepted artifact commit and exact task
selector; and the spec pin identifies its historical accepted bytes rather than
the later formatting-repaired live file. The live spec was already changed by
`47c70187` (table spacing and escaped issue references) and hashes to
`a2a45d49f2cc5142e339c9bdf1cdfb183393be9a49a340d091beab70ec06ff1b`;
its accepted historical digest remains `bcc6d2bf...` at `b02b4b26`.

The prior manifests and the current spec are unchanged by this amendment review.
No child issues, issue-body repair, lifecycle transition, or runtime implementation
was performed here. The new manifest still has `authority_assurance: unavailable`:
peer acceptance is not human Plan approval or authorization for a real waiver.
