# #1847 SAR round 1 — revision disposition

## Identity and artifacts

- Reviewer and revising author: GPT-6 Astra, the same agent for both activities.
- Effective reasoning-effort setting: not exposed to this reviewer.
- Original reviewed specification:
  `docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md`.
- Original reviewed commit:
  `b1c86bd8685910f6d172d876eb5a8ea8b3e8ab5d`.
- Round-1 review:
  `docs/superpowers/reviews/1847/SAR/1847-spec-review-r1.md`,
  persisted by the parent at commit prefix `c80fadaf`.
- Source baseline:
  `4187a64fae6319808ec350f3beb0f126fc36769b`.
- Revised artifact: the same specification filename.
- Revision commit: supplied by the mechanical persistence step and reviewed
  explicitly in SAR round 2; this record does not invent a commit SHA.

The parent transports, saves, and commits the authored document bytes. The
reviewing agent owns the findings, dispositions, and revised design.

## Round outcome

Round 1 produced four material findings. This revision addresses all four in the
specification. The dispositions below mean “addressed in the authored revision”;
they do not substitute for review of the committed revision.

The issue remains Backlog and the specification remains a draft pending Refine
acceptance. No implementation, Plan approval, downstream issue edit, new defect,
or prerequisite issue was performed or requested.

## SAR-1 — Canonical Plan-approval incompatibility

**Priority:** P1.
**Disposition:** Addressed in the revised design.

The original specification promised canonical revision followed by normal Plan
reapproval even though baseline `plan-approve.mjs` refuses directory-backed
authority.

The revision keeps canonical support within #1847 and explicitly includes the
missing adapter. The new “Canonical Plan approval” section specifies:

- Shared stage, planning-evidence, story/intent, linked-plan, provenance, and
  forecast evaluation.
- Canonical AC/VC resolution from the authority resolver.
- A registered canonical `plan-approval` capsule and closed
  `aitm.plan-approval-binding/v1` payload.
- Binding to current revision identity, semantic digest, contract epoch, and
  protected source inputs.
- Consumption by Plan exit and downstream revision guards.
- Real end-to-end canonical approval tests without injected success.

The stage table and reapproval rules now state that every semantic revision
invalidates Plan approval. Earlier stages proceed normally toward Plan;
Develop revisions require normal demotion and reapproval.

**Evidence used:** Baseline `verbs/plan-approve.mjs:150–162` and the inspected
canonical lifecycle-evidence resolver.

**Next-round check:** Confirm that the newly scoped adapter does not weaken
existing Plan requirements or conflate proposal authorization with Plan approval.

## SAR-2 — Authorization is not exclusive transaction admission

**Priority:** P1.
**Disposition:** Addressed by explicit bounded topology and serialization rules.

The revision no longer implies that a coordinator grant or GitHub prepared
comment atomically reserves a transaction.

The new “Writer ownership and serialization” section selects one cooperative
local writer domain: a registered Git common directory and its linked worktrees
on one host. Remote and independent-clone mutation is unsupported in version one.

It requires a shared strict repository/issue interlock before authoritative
mutation reads, held through verification, with:

- Atomic local acquisition.
- Common-directory placement across linked worktrees.
- No age-only theft of live or uncertain locks.
- Rechecked local-holder liveness for orphan reclamation.
- Exact runtime lock capability for reentrancy.
- Coverage of ordinary writers, stampers, transitions, approval, delivery,
  canonical operations, and repair paths.
- Explicit quiescence/admission requirements for deployment with older clients.

Legacy task/session ownership is kept distinct from canonical coordinator
authorization. No nonexistent canonical grant is attributed to legacy issues.

The prepared event remains a durable pending fence and recovery record. It is
not represented as a distributed mutex.

**Evidence used:** `coordination-authority.mjs`, `capsule-chain.mjs`,
`contract-source.mjs`, and the baseline issue-mutator lock implementation.

**Next-round check:** Verify that every proposed writer path uses the same
interlock/fence contract and that the documented supported topology is consistent
with recovery and the consumer inventory.

## SAR-3 — Recovery ownership and partial canonical states

**Priority:** P1.
**Disposition:** Addressed with explicit resource states and recovery authority.

The new recovery table distinguishes preparation, capsule-only progress,
canonical projection progress, body progress, terminal uncertainty, and
unrecognized drift.

Recovery now compares the full resource vector. It does not infer success from
the issue body alone. Planned record IDs and exact resource hashes support
idempotent continuation at a recognized write-set prefix.

A different executor or unavailable original authorization source requires a new
exact host-verified approval and a `recovery-authorized` event. The revision
preserves original and recovering executors separately.

The pending fence explicitly permits transaction-bound recovery, untouched abort,
authorized forward repair, and necessary governed coordinator restoration.
None of those operations silently clears the fence.

Expired or replaced canonical grants cannot be bypassed by revision recovery.
Current canonical authority must first be valid through its governed path.
Forward repair then binds the exact observed state and current authority.
The revision command does not invent coordinator authority or rewrite its
metadata to make recovery pass.

The earlier broad “another checkout” promise is now precise: another linked
checkout in the admitted local domain is supported. Cross-host pending recovery
is excluded from version one.

**Evidence used:** The capsule-before-projection ordering and interruption seams
in `github-records/contract-write.mjs`, plus coordinator authority validation.

**Next-round check:** Check terminal-event idempotence, recovery authorization
binding, and that recognized partial states cannot revive old proof or authorize
an unrelated body rewrite.

## SAR-4 — Selective preservation versus canonical reset

**Priority:** P2.
**Disposition:** Addressed by authority-specific invalidation policy.

The revised invalidation table selects conservative complete current-proof reset
for canonical amendments, consistent with `amendContract`.

Canonical accepted record IDs are cleared; lifecycle projections reset; old
individual evidence remains historical and must be regenerated for current use.
No carry-forward evidence protocol is introduced.

Selective preservation is limited to legacy individual proof where identity,
requirement text, declaration, resolved command bytes, and source bindings all
remain equal. Uncertainty retires the proof. Aggregate approvals and receipts
are invalidated in both formats.

The missing canonical semantic-amendment persistence operation is explicitly
included in #1847's scope.

**Evidence used:** `delivery-contract.mjs:449–467`,
`invalidateContractProof`, and `contract-write.mjs`'s operation set.

**Next-round check:** Verify that canonical end-to-end examples and tests no
longer promise selective carry-forward, and that legacy preservation cannot
survive a changed shared verifier.

## Other round-1 obligations addressed in the draft

| Obligation | Authored resolution |
|---|---|
| Authorization trust boundary | Reuses the existing trusted Codex user-message loader pattern; exact approval statement and source reference; unsupported adapters refuse |
| Named human attribution | Preserves host principal when available and records its absence otherwise; verified source reference supplies attribution |
| Wire schema | Defines closed top-level operation and proposal domains, shared nested validators, and server-derived archives/write sets |
| Command-data ambiguity | Explicitly permits inert replacement VC strings while prohibiting command execution during revision |
| Semantic digest | Defines ordered AC/VC/DoD domain, declaration and resolved-command content, source bindings, exclusions, and monotonic revision identity |
| Legacy criterion identity | Uses exact original body/occurrence identity and durable replacement mapping rather than short label keys |
| Consumer inventory | Adds concrete mutation, approval, execution, transition, delivery, repair, and read-only boundaries |
| Canonical stages | Adds explicit canonical Plan approval and preserves draft/sealed status during amendment |
| Archive compatibility | Requires complete original bytes, closed revision events, complete pagination, reference validation, and pre-write size/secret refusal |
| Scope | Keeps required canonical and locking changes inside #1847; excludes distributed coordination and new identity infrastructure |

The concrete runtime adapter validation, complete source-level consumer list, and
implementation sizing remain Refine obligations. The revised document defines
their required behavior; it does not claim they have been implemented or proven.

## Rejected expansion

A possible detached-signature/user-held-key approach was considered during
revision but not adopted. Existing repository host-verified user-message
patterns provide the relevant bounded authorization model.

The specification introduces no user-managed signing keys, PKI, external
identity product, or new prerequisite issue. Its trust statement is explicit
about host-controlled transcript integrity and unsupported adapters.

## Verification performed for this revision

Read-only source inspection established:

- The concrete canonical Plan-approval refusal.
- Canonical amendment's complete proof reset.
- Capsule append's optimistic checks and fork detection.
- Capsule-before-projection write ordering.
- Existing issue-lock limitations relevant to stronger serialization.
- The existing `aitm.authorization-source/v1` Codex user-message adapter pattern.

No code was changed and no implementation test result is claimed. The next
required SAR action is review of the mechanically committed revised
specification by this same agent.

## Authority statement

This round records review and authored revision only. It does not accept the
specification at Refine, approve a Plan, authorize implementation, satisfy an
implementation checkbox, or provide ai-peer-review protocol acceptance.

SAR continues with the committed revised artifact. It has not been stopped at
the initial findings.
