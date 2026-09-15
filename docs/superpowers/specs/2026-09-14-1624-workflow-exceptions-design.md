# Explicit workflow exceptions and execution preflight

Date: 2026-09-14
Target repository: `kburson/ai-task-manager`
Status: Implementation specification requested by the user; no AITM issue has been assigned by this task.

## 1. Problem and required outcome

AITM must support an explicitly authorized deviation from planning or review requirements without fabricating evidence, bypassing its state machine, or disabling unrelated safeguards. The same policy decision must govern lifecycle transitions, source-edit hooks, resident actions, evidence validation, and completion.

The initiating incident is ai-peer-review #57. The user authorized direct implementation of #57–#61 with NO PLAN and NO REVIEW, prohibited reviewer/provider launches, and retained tests, truthful evidence, issue tracking, and safe serial delivery. The authorization was recorded in issue prose. AITM moved #57 sequentially into Plan, then refused Plan → Develop because its gates have no representation for this exception.

The permanent solution is a reusable, issue-scoped exception mechanism plus read-only workflow preflight. There must be no special code for issue 57, repository ai-peer-review, or label `incident:peer-review-56`.

Success means AITM can explain the effective requirements before execution, perform only the authorized activities, and record which requirements were satisfied or waived. Preflight cannot guarantee future tests, CI, permissions, or delivery; it must disclose unresolved future conditions.

## 2. Observed failure and source anchors

On 2026-09-14, the installed `@kburson/ai-task-manager` package reported version `1.0.0`. The following checks were reproduced against live #57 body/comments using individual guards, without running a state mutation:

| Check | Observed result |
| --- | --- |
| Planned Estimate appendix | `planned-estimate-appendix-missing` |
| Deep-dive posted marker | `plan-develop-deep-dive-posted-marker-missing` |
| Deep-dive section | `plan-develop-deep-dive-section-missing` |
| Deep-dive complete marker | `plan-develop-deep-dive-complete-marker-missing` |
| Plan Metadata | `plan-develop-plan-metadata-empty` |
| Plan approval | Separate guard also refuses the absent approval marker |

Supplying disabled approval-policy settings did not change these results. The promote wrapper intentionally omits the plan-approval refusal from initial reporting; the central state-change path enforces it. Source editing in Develop independently requires the deep-dive markers. Later body validation requires Plan Metadata and Deep Dive sections.

Revalidate these repository-relative anchors against current AITM trunk before implementation; filenames and behavior can change:

- `scripts/task-tracker/states/{plan,test,review}.mjs`
- `scripts/task-tracker/verbs/promote.mjs`
- `scripts/task-tracker/lib/plan-approved-guard.mjs`
- `scripts/task-tracker/lib/plan-exit-{planned-estimate,deep-dive,plan-metadata}-guard.mjs`
- `scripts/task-tracker/lib/{deep-dive-gate,refine-estimate-comment,gate-resolve,session-store}.mjs`
- `scripts/task-tracker/lib/move-state/guard-execution.mjs`
- `scripts/task-tracker/source-edit-gate.mjs`
- `scripts/task-tracker/lib/agent-review/validators/body-sections.mjs`
- Test/Review body gates, review resident actions, approval/delivery/close consumers, and their evidence writers.

The source investigation must trace actual consumers, not rely on comments claiming that a gate is configurable.

## 3. Scope and non-goals

In scope: a finite requirement catalog, durable exception lifecycle, shared evaluator, consistent enforcement, read-only preflight, truthful evidence/reporting, offline regression coverage, CLI/help/skill documentation, and the supported package release/update path.

Out of scope: a general policy language; redesigning the eight-state workflow; automatic emergency-mode inference; global disable switches; external branch-protection changes; paid provider experiments; implementing ai-peer-review #57–#61; or migrating historical evidence into invented exceptions.

The state chain remains Backlog → Refine → Ready for Planning → Plan → Develop → Test → Review → Done. Waived activities do not authorize arbitrary state jumps. Existing default behavior must remain intact for issues without an exception.

## 4. Requirements and policy semantics

Use stable requirement IDs, independent of error text and marker syntax. The initial catalog must distinguish at least:

| Requirement family | Exception behavior |
| --- | --- |
| Planning outputs | A finite named bundle may waive deep-dive content/markers, planning metadata, and the Planned Estimate appendix, including applicable plan-only forecast evidence. Refine fields and substantive scope/acceptance criteria remain required. |
| Plan approval | Separate explicit scope. A planning waiver alone must not silently grant approval. A no-plan bundle must explicitly disclose its treatment of approval before authorization. |
| Design/implementation/peer review | Individually identified activities, with a documented finite no-review bundle. Include automated semantic review resident actions and reviewer launch paths. |
| Human delivery/completion approval | Separate from all review activity. Preserve existing supported human/Full-Auto authorization rules unless independently and explicitly excepted under an allowed policy. Never infer this from “no review.” |
| Provider execution | A restrictive `deny` constraint on AITM-managed provider/reviewer launches. It does not terminate the user's current interactive agent or claim control over arbitrary external processes. |
| Tests, verification evidence, ownership, dependencies, issue binding, state contiguity, commit provenance, CI, safe delivery | Not waivable through this feature. Existing independent mechanisms, if any, retain their own scope and authority. |

Bundles are user-facing conveniences that expand to an explicit versioned list of requirement IDs. They are not wildcard waivers, and new requirements are never automatically included. Unknown requirement IDs or unsupported bundle versions refuse activation.

Separate policy applicability from evidence results. For each requirement report `satisfied`, `waived`, `missing`, or `not-applicable`. Preflight additionally needs an orthogonal evaluation state such as `evaluated` or `pending-future-evidence`; a test that has not yet run is not satisfied or waived. Waived and not-applicable outcomes must include the rule or authorization that caused them.

Existing failed reviews remain historical failures. An exception changes current applicability; it never rewrites a failure into success or removes unresolved acceptance criteria.

## 5. Durable authority and exception lifecycle

Use GitHub-native authority associated with the issue and the repository's existing safe mutation/evidence mechanisms. Local session files, environment variables, labels, and rendered Markdown summaries are not exception authority. A machine-readable record may be stored using existing issue evidence conventions; its mutable projection must not be the sole audit history.

Required logical fields:

- Schema version, unique record ID, revision, and active/revoked/superseded disposition.
- Exact repository and issue identity; one record per issue. Series operations enumerate issues explicitly and report each result.
- Explicit requirement IDs, restrictive execution constraints, and human-readable reason.
- Authorization reference and preserved relevant statement; authorizing principal where verifiable; recording actor separately; evidence origin and verification level.
- Creation time, optional expiry, and links to superseded/revoked records.
- Scope identity covering the authorized work and criteria, excluding ordinary timing/progress metadata, with documented validity rules.

Recording is idempotent. An identical retry returns the existing result; changed scope or requirements require a new authorized revision. Revisions and revocations preserve history. Ambiguous concurrent active records refuse use rather than combining their waivers. Partial series creation is reported per issue and can be retried without duplication.

Authorization must be explicit and must identify its scope. An agent may record an already supplied user instruction through a supported adapter; recording is not authority to invent or expand it. Full-Auto, issue labels, copied prose, a boolean `authorized:true`, caller-selected names, or ordinary GitHub token ownership are insufficient by themselves to prove human approval.

Use an existing supported human-approval/evidence mechanism if suitable. If chat authorization is accepted, specify the trusted host boundary, how the source user message is identified and bound to the record, and the limitations of verification. An agent-authored quote must not be labeled platform-verified human evidence. If the environment cannot establish the required provenance, return an authorization-resolution blocker and identify the supported human confirmation route. Do not invent cryptographic assurances or repeatedly request permission when an existing supported source already suffices.

This is an auditable application policy boundary, not a security boundary against an operator with unrestricted credentials who can rewrite GitHub history or patch the runtime. Reject malformed or unauthenticated inputs within the supported interfaces without overstating that threat model.

## 6. One shared evaluator

Build or extend one evaluator that accepts a coherent issue/evidence snapshot, state/activity, project/session policy, runtime capability version, authorization records, and current time. It returns requirement decisions, reason codes, authority references, and remaining blockers. Callers must not implement their own waiver interpretation.

Evaluation order:

1. Identify baseline requirements from existing workflow policy.
2. Validate exception provenance, scope, revision, expiry, and revocation.
3. Apply only explicitly supported requirement waivers.
4. Apply restrictive execution constraints; provider denial cannot be relaxed by Full-Auto or a launch flag.
5. Evaluate remaining evidence, dependencies, and delivery restrictions.

Existing human approval settings remain distinct from planning-output requirements. Fix or explicitly reconcile the observed approval resolver/guard inconsistency with regression tests against documented behavior; do not quietly relax baseline requirements while adding exceptions.

Preflight is advisory. Before any dependent mutation, source edit, or managed launch, revalidate the applicable authority using existing boundary locking/snapshot mechanisms. A stale preflight receipt never authorizes later work. Revocation or material scope change blocks subsequent affected actions without undoing already completed work or destroying evidence.

Caches must be disposable and tied to authority revision. If freshness or authority cannot be established, fail closed for exception-dependent work and explain recovery. Ordinary progress updates and branch rebases must not unnecessarily invalidate an issue-scoped exception; source-code approval evidence retains its existing commit-specific rules.

## 7. Enforcement and completion integration

Every applicable transition guard, edit hook, resident action, reviewer launcher, validator, and completion consumer must use the shared decision. Establish a catalog-to-consumer coverage check so a newly added requirement needs an explicit applicability declaration; unmapped requirements remain required.

- Plan entry/resident/exit paths must not generate prohibited planning output to advance an excepted issue.
- Source edits must accept a valid planning exception instead of requiring fabricated deep-dive markers. Other edit restrictions remain enforced.
- Test/Review entry and body validators must recognize the exception without requiring fake plan/review sections. Pure evidence/schema checks and verification remain active; semantic review execution is distinct and suppressible.
- Review and closure must record that review was waived, preserve real test/delivery receipts, and respect remaining human approval requirements. No `REVIEW_COMPLETE`, plan-approved, deep-dive-complete, or review-passed signal may be emitted if its established meaning falsely claims the skipped activity occurred.
- If an existing event is also used to advance state, introduce or extend a truthful disposition and update all consumers. Do not overload a success marker with a prose disclaimer.
- AITM-managed provider launch paths must enforce provider denial before spawning a process or submitting a request. Adapter coverage and external enforcement limits must be explicit.
- GitHub required checks/reviews cannot be waived by local policy. Report a protection conflict; do not change protection or claim delivery is possible.

The implementation must document a complete supported path from the current issue state to closure under each supported exception bundle. This describes policy compatibility, not a promise of successful future verification.

## 8. Supported commands and read-only preflight

Expose sanctioned CLI operations for recording, showing, revoking/superseding an exception and inspecting the effective workflow through a requested target state. Integrate with the existing command conventions rather than adding raw state mutation instructions. Exact command spelling is an implementation choice; help and tests must agree, and proposed examples must not be advertised as existing commands before delivery.

Preflight must work by explicit issue number without starting/resuming a timer, binding a session, altering issue comments/body/project state, writing repository artifacts or persistent policy caches, or launching providers. It may perform read-only GitHub/git inspection. Temporary in-memory computation is allowed.

Report both human-readable and versioned JSON output containing:

- Repository, issue, current/target state, runtime capability/version, and inspected authority revisions.
- Effective requirements, waivers, prohibitions, and their provenance.
- All currently discoverable policy conflicts, including downstream edit/validation/closure conflicts, without stopping at the first gate.
- Future evidence still required, external conditions not inspectable, and concrete supported remediation for each current blocker.
- Distinct outcomes for policy-compatible, blocked, and indeterminate. Policy-compatible is explicitly conditional on future evidence and state remaining valid.

A requested but unsupported policy must be reported before state changes begin. Integrate the same read-only check into task pickup when an exception/requested execution policy is present; subsequent actions still revalidate at their boundaries. No natural-language heuristic should silently activate an exception.

## 9. Compatibility, packaging, and operations

Do not backfill exceptions from old issue prose, rename existing passed evidence into waivers, or rewrite completed tasks. Existing tasks without exception records retain their behavior.

Advertise a capability/schema version that preflight and adapters can inspect. Unsupported records must produce a clear error in updated consumers. Old installed packages cannot be retroactively made aware of the schema: verify and update every consumer used for an excepted workflow before activation, using the supported dependency release/install process. Do not patch consumer `node_modules` as delivery.

Update CLI help, task skill, state-walk/full-auto rules, pickup directives, and example completion reports. Explain that automatic approval settings are not blanket planning/review waivers, and that labels or ordinary issue prose do not activate policy.

## 10. Acceptance criteria and verification

Use deterministic fixtures, mocked GitHub/process adapters, and existing test infrastructure. No paid providers are required.

1. Without an exception, an issue matching #57 reproduces the five planning errors and the separate approval requirement; the complete preflight reports downstream constraints too.
2. An explicitly authorized, valid exception permits the applicable ordinary transitions and source edits without generating plan/deep-dive/review success evidence. Retained tests, ownership, dependencies, approval policy, and delivery checks still apply.
3. The fixture travels from Backlog through Done under the supported exception policy, supplying real simulated test/delivery evidence and any separately required approval. It also covers resuming an issue already in Plan.
4. Tests fail, CI is missing, a dependency remains open, binding is wrong, or commits are undelivered: relevant gates still refuse despite the exception.
5. Expired, revoked, wrong-repository, wrong-issue, materially stale, malformed, unknown-version, ambiguous, and unsupported-authority records never relax gates.
6. Idempotent retries, concurrent records, partial multi-issue registration, and revocation preserve evidence and deterministic outcomes.
7. Preflight and execution agree on requirement decisions from the same snapshot. A revocation/scope change between preflight and action blocks the action. Unknown future CI is shown as pending/indeterminate, never passed.
8. Provider-denied scenarios launch zero managed reviewer/provider processes and make zero provider requests, including resident-action and retry paths. Full-Auto cannot override denial.
9. No-plan, no-review, human approval, and provider-denial settings are exercised independently and together. A review waiver never silently grants human delivery approval.
10. No-exception ordinary workflows and documented Full-Auto/manual behavior remain covered. New gate registrations cannot silently escape applicability coverage.
11. Preflight and show operations produce zero persistent mutations, timer/binding changes, or provider launches; verify with write/spawn spies and disposable fixtures.
12. Delivery/closure reports distinguish waived work from performed work and retain preexisting failed-review history. Protected-review conflicts remain blockers.
13. Installation smoke coverage verifies the released artifact contains the evaluator, commands, schema support, hooks, and updated documentation; source-only tests are insufficient to establish consumer readiness.

Run focused red/green regressions plus repository-required verification. Report exact commands/results and supported package identity. Do not claim the historical 216 unit/15 golden baseline was rerun; those numbers describe the earlier ai-peer-review #57 baseline, not AITM verification.

## 11. Incident rollout boundary

Deliver this capability as governed AITM work. Do not create a private bypass inside ai-peer-review or expand its #57 fix to repair AITM.

After the AITM release is available, a separately authorized consumer task can update the dependency, verify runtime capabilities, record the existing incident authorization through the supported route, run read-only preflight, and resume #57 normally. If human completion approval or external protection still conflicts, report it explicitly instead of broadening the authorization.

The preserved #56 worktree must remain untouched. No provider should be launched merely to validate this workflow capability.

## 12. Definition of delivery

The feature is delivered when the supported AITM artifact contains the mechanism; ordinary and exception lifecycle tests pass; audit/CLI/help semantics agree; all relevant consumers use the shared policy; and a clean installation passes the offline incident fixture. Live #57 is not considered unblocked until its installed runtime and actual policy preflight establish that independently.
