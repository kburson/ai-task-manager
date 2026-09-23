# Human approval triad with explicit agent delegation

Date: 2026-09-22. Issue: #1764. Status: proposed for user review.

## Goal

Keep AITM's three independent human-gate settings: Plan to Develop, PR delivery, and final Review to Done. A disabled human gate uses Full-Auto without stopping. An enabled human gate stops at that boundary and asks the local user to **Approve**, **Delegate to agent**, or **Reject**. Delegation is a human decision to rely on the agent and AITM's existing checks; it is neither a claim that the human inspected the artifact nor an unattended Full-Auto decision.

The choice is made for one issue, one gate, and one current artifact. A choice on epic #1764 does not implicitly cover its children, and a choice on one gate does not cover another. A previously recorded choice may be reused on retry only while its artifact and authority remain current.

## Existing behavior and change boundary

`gateAnalysisToDevelopment`, `gatePullRequestReview`, and `gateReviewToDone` currently resolve from session override, then project config, then a Full-Auto default (`scripts/task-tracker/lib/gate-resolve.mjs`). Preserve their booleans and precedence. `false` means Auto; `true` means stop for a human decision. Do not add `delegate` as a standing gate setting.

Plan approval currently writes `aitm-plan-approved` with `human` or `full-auto` mode. Final approval writes `aitm-review-approved`, sometimes with `full-auto` audit properties. The manual PR gate currently seeks a GitHub `APPROVED` review from a configured reviewer on the exact head. That PR mechanism cannot serve the local user when AITM pushes as the user's GitHub identity: GitHub does not allow the PR author to approve their own PR. Replace **AITM's local manual PR decision** with the triad below. A GitHub review submitted by another required team member remains separate repository evidence.

The canonical flow reviewer, Agent Review, Test receipt, required CI, delivery intent, expected-head provider action, verification receipt, ownership, and all other existing protections still apply. Neither Approve nor Delegate waives a failed check or a workflow-policy requirement. A separate, explicit workflow exception remains the only route for a waivable requirement.

## Decision model

| Effective human gate | Local user choice | AITM outcome      | May advance when                                                                                |
| -------------------- | ----------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| Off                  | None              | `autonomous`      | Existing automated evidence and authority pass.                                                 |
| On                   | Approve           | `human-reviewed`  | The user states they reviewed the presented current artifact, and existing checks pass.         |
| On                   | Delegate to agent | `human-delegated` | The user explicitly assigns judgment to the agent, and the same eligible automated path passes. |
| On                   | Reject            | `rejected`        | It may not advance; the reason and revision route are recorded.                                 |
| On                   | Dismiss/no answer | None              | It remains paused; no choice is inferred.                                                       |

The prompt uses those exact three labels and identifies the issue, gate, artifact, and evidence summary. **Approve** means the human claims to have reviewed that artifact. **Delegate to agent** says the human has not supplied a substantive artifact-review judgment and trusts the agent's result and AITM controls. **Reject** requires a reason before the rejection is recorded. The CLI never converts silence, prior trust statements, checked boxes, a peer-review verdict, or an agent's assertion into a human choice.

The gate resolver is authoritative. Environment variables, CI, and TTY state may identify an execution context, but they cannot turn an enabled human gate into an autonomous approval or turn a disabled gate into a fabricated human approval. This also resolves the provenance defect tracked by #1721: session Full-Auto must record `autonomous` without requiring a separate `TT_FULL_AUTO=1` export.

## Prompt and recording contract

Introduce a shared `approval-decision` boundary for the three gates. `prepare` is read-only: it evaluates the current gate, builds a bounded summary of the exact artifact and completed checks, and returns a challenge containing repository, issue, gate, artifact digest, issue-state visit, a unique operation ID, and a 24-hour expiry. The challenge expires earlier if the bound artifact, gate setting, or state visit changes. It grants no authority. A manual gate emits `PROMPT_REQUIRED` with this challenge; the host presents the three choices. An unattended host without a verified user-response channel pauses rather than choosing.

`record` accepts only one of `approve`, `delegate`, or `reject`, the challenge, and a host-verifiable reference to the user's response. It verifies that the response came from a user role in the current interaction, names the same choice and challenge, and is not agent text, a request file, a forged CLI flag, or a copied response from another issue. The host adapter supplies the verification; unsupported or ambiguous sources fail closed. Codex can build on its existing verified user-message loader. Other supported interactive hosts need equivalent adapters before they can record a manual choice; their existing Auto path remains available. The recording actor, user-message reference, verification level, timestamp, challenge ID, and choice are audit data. A GitHub comment posted using the agent's credential is not proof that the human chose it.

The canonical decision has an exact schema and one current projection per gate in the issue record: `decisionId`, `repository`, `issueNumber`, `gate`, `choice`, `artifact`, `actor`, `authorityReference`, `recordedAt`, and `reason` for rejection. The decision is recorded through the governed fresh-body writer with a readable audit comment; the body projection names the audit record and its digest. Readers reject unknown choices, malformed or conflicting records, missing audit correlation, and stale artifacts. A later decision supersedes the prior one without erasing its audit comment. Body markers remain compatibility projections, not a way to manufacture a human response.

Existing `aitm-plan-approved` and `aitm-review-approved` readers must accept historical records without rewriting them. New records expose `human-reviewed`, `human-delegated`, or `autonomous` explicitly; no new record labels delegated work `human-approved` or ticks a `Passed final human review` claim without clarifying that judgment was delegated. The visible issue summary and terminal output show the distinction. A rejected decision is an active blocker for the same artifact until that artifact changes or a later explicit human choice supersedes it; switching the gate to Auto does not silently override a rejection.

## Artifact identity and freshness

| Gate  | Bound artifact                                                                                                                                                       | Freshness rule                                                                                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan  | Linked plan path and content digest, Story Intent/story binding, and forecast record ID (or the corresponding authoritative deep dive when there is no linked plan). | Plan or story changes require a new choice. A trunk move alone may refresh the Plan transition projection after revalidating unchanged approved content and current guards; it does not manufacture a new human decision. |
| PR    | Repository, issue, PR number, base ref name, and exact accepted head SHA.                                                                                            | A changed head, PR selection, or target base ref requires a new choice. CI and flow review are rechecked even when the choice remains current.                                                                            |
| Final | Issue, accepted Test head SHA, and the current completed Agent Review identity.                                                                                      | Code revision, Test receipt replacement, Review demotion/re-entry, or review-evidence change requires a new choice.                                                                                                       |

Every transition or provider action re-reads the current gate setting and decision, then revalidates its artifact and normal guards immediately before mutation. A decision from a manual gate cannot be borrowed for a different issue, child, phase, PR, or head. A past `autonomous` record does not satisfy a gate later switched to Manual. Retry after a transport ambiguity reconciles the persisted decision by operation ID and digest rather than posting a second decision.

## Gate-specific behavior

### Plan to Develop

When the Plan gate is Auto, `plan-approve` records autonomous provenance after the existing linked-plan, story, forecast, deep-dive, and epic-child checks. When Manual, it returns the shared prompt until a current Approve or Delegate decision is recorded. Both choices allow the normal `aitm-plan-approved` transition marker only after those checks pass. Reject leaves the issue in Plan, records the reason, and requires plan/story revision or a later explicit choice before another promotion. Preserve the established Plan marker and orchestration-plan compatibility; add distinct decision provenance rather than repurposing `mode="human"` for delegation.

### PR delivery

The manual PR choice belongs to AITM metadata, not a GitHub self-review. Offer it after the exact PR head, required CI, and applicable agent/flow review evidence are available, before merge intent or provider action. **Approve** records local human review of that current PR. **Delegate** records local human reliance on the agent's completed review. Both permit the same existing delivery preflight to continue; neither creates or claims a GitHub `APPROVED` review. Reject stops delivery for revision and records the reason. The current `manualCodeReviewer=@me` request/approval path is retired as AITM's local human gate for new decisions; preserve historical review evidence as history, not as a fabricated triad choice.

Repository protection is independent. Required team or CODEOWNERS reviews, mergeability, and other hosted restrictions remain GitHub's authority. AITM reports a protected or refused merge, preserves its pending delivery transaction for reconciliation, and never treats the local Approve or Delegate record as satisfying a missing GitHub reviewer. The sanctioned expected-head merge action remains the only delivery action.

### Final Review to Done

The Review action and Test evidence complete before the final prompt. With Auto, final approval records autonomous provenance and the governed close flow continues without a human stop. With Manual, Approve records the user's review; Delegate records reliance on the completed agent review; Reject uses the existing revision route back to Develop with a reason. New issue templates use `Final approval decision recorded` in place of `Final Review Passed`; the `aitm-review-approved` projection and legacy-checkbox compatibility rendering show whether the outcome was delegated, human-reviewed, or autonomous. A delegated or autonomous outcome never claims the human passed final review. No choice bypasses the close checklist, timing flush, delivery receipt, or other Review-to-Done requirements.

## Compatibility and rollout

New decision provenance is additive. Legacy `human`, `full-auto`, and pre-mode Plan/final markers remain readable with their original meaning; never relabel an old marker as delegated. In-flight manual PR gates that already have a GitHub exact-head approval may finish under their original contract or be explicitly migrated with a new human choice; do not silently infer Approve or Delegate from that review. A controlled migration must not leave two competing current PR authorities.

The accepted #1512 design and current `skill/shared/rules/full-auto.md` describe GitHub PR review as the local manual authority. This specification supersedes only that local-authority clause once implemented. The pending #1520 PR approval bridge must be revised or closed as superseded before it ships, since its exact-head GitHub self-review requirement conflicts with this design. #1721's effective-session-gate provenance fix remains necessary and should be absorbed or coordinated, not implemented as a competing mode resolver. The still-pending #1219 continuous-delivery amendment must retain mandatory flow review and external protection while adopting the AITM PR decision record.

Documentation and command help must use **Auto** for policy and **Approve / Delegate to agent / Reject** for a stopped human choice. They must say that Delegate is a human decision and that neither local choice is a GitHub review. A `--human` flag or legacy command syntax alone must never create a new delegated decision.

## Verification

1. Unit tests cover gate precedence, Auto's unattended path, the three manual choices, no-answer pause, per-gate independence, and truthful provenance for Plan, PR, and final decisions.
2. Authority tests reject agent-authored or unreadable source, wrong challenge/issue/gate/choice, replay, duplicate/conflicting records, stale plan/head/review evidence, and a changed gate setting. A transport retry reconciles one durable decision.
3. Plan integration covers linked-plan and forecast binding, an unchanged plan after a trunk movement, child independence, rejection, and #1721 session Full-Auto behavior.
4. PR integration covers exact-head CI and flow review, human Approve and Delegate without GitHub self-review, head drift, external team-review protection refusal, rejected delivery, and no provider action on an unresolved prompt.
5. Final integration covers completed Agent Review, delegated versus human-reviewed versus autonomous issue text, rejection/demotion, stale Test/review evidence, and close gates.
6. Compatibility tests read historical markers and in-flight GitHub PR review evidence without rewriting or laundering their meaning. Run the normal fast, integration, slow, lint, format, and package lanes before release.

## Out of scope

No standing `delegate` project/session mode, inherited child or epic-wide delegation, automatic approval of rejected artifacts, waiver of agent review or other guards, fabricated GitHub reviews, changes to CODEOWNERS or branch protection, direct shell merge fallback, or retrospective rewriting of historical approvals. This design does not approve #1764 implementation; it defines the behavior to plan and review before coding.
