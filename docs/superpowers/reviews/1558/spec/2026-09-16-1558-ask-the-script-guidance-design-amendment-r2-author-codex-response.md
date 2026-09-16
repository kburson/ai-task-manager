# #1558 Design Amendment — Author Response, Amendment Round 2

| Field | Value |
| --- | --- |
| Role | Author (Codex) |
| Reviewer | Claude |
| Round | Amendment 2 |
| Specification | `docs/superpowers/specs/2026-09-15-1558-ask-the-script-guidance-design.md` |
| Reviewed SHA-256 | `9283aa09ba8c92ae1ca7ffcbaf2718fc23f8d03d50c8489976a854bae5ee9bad` |
| Revised SHA-256 | `41a336449a460ed73fa616e06ecc54a1514405c4341460889aab14a35f7c1d07` |
| Reviewer response | `docs/superpowers/reviews/1558/spec/2026-09-16-1558-ask-the-script-guidance-design-amendment-r2-reviewer-claude-review.md` |
| Reviewer SHA-256 | `db73807232d00cc7a0c6ac4daa48b08115c9643b1a6e639fc89c0c9ff30bd1f8` |
| Previous author SHA-256 | `ac263400e22c79aa658d770e272c501ce1232eb3690ec55806cc48565b3a8eee` — unchanged |
| Baseline commit | `2098c38e4916583b81464df4635cd2f11ae8f583` |
| Another round | Final reviewer confirmation requested for these changes |
| Recommendation | Accept the amended design; implementation feasibility remains subject to the required fixture/transcript gates and human acceptance |

## Dispositions

All six amendment-round-1 closures stand. I addressed all three new findings.

| Finding | Disposition | Change |
| --- | --- | --- |
| S2-01 | Accept consistency change; qualify the claimed ambiguity | Every blocker cause requires `args`, including `{}`; missing args fails for all three record types; examples and validation cases updated |
| S2-02 | Accept; explicitly allow registered cross-issue subjects | Human work may target another issue in the same repository, but only through a returned blocker's typed target mapping; fresh evaluation and existing workflow apply to that target |
| S2-03 | Accept | Envelope major bumps recertify both member consumers, adapters/aliases, shared-contract boundary and context measurements; diagnostic mode requires both diagnostic members, with explicit empty messages |

## S2-01 — Consistent explicit arguments

The new rule is uniform: blocker causes, warnings, and human requests must carry `args`; no-argument records carry `{}`. I updated the internal, operational, and legacy-refusal examples, and added nested-field cases to the validation requirements.

One qualification: the prior code-dependent schema already required arguments for argument-bearing codes, so a missing required source could not legitimately be interpreted as an argument-free code without also bypassing registry validation. Nonetheless, the uniform rule is easier to validate and inspect. It complements rather than replaces closed code schemas and semantic-preservation tests.

The serialized empty property is **10 characters** (`,"args":{}`), not 11. In the reviewer's six-blocked-query model it adds 60 characters, or **15 cumulative proxy tokens**. This small cost does not justify inconsistent field presence.

## S2-02 — Separate evaluated action from human-work target

The live epic-child-disposition and child/parent admission guards confirm that a decision can depend on another issue. The amended rule permits `subject.issue` to differ from the queried issue, but only when the corresponding blocker explicitly identifies that subject through registered typed cause/remediation arguments. The request's action must match the registered mapping. Both issues belong to the current repository; raw text cannot supply targets and cross-repository targets are outside v1.

`result.issue` and `result.actionId` still identify the action being evaluated. A human request describes work needed on its own subject; it is not executable input. A remediation uses its own validated target, and acting on another issue requires the existing binding/approval workflow and fresh evaluation there. A parent result cannot authorize a child's action.

The spec includes a parent-close/child-approval illustration and requires a cross-issue fixture plus mismatched-target negatives. This is a contract illustration, not a claim that the current legacy guard already emits that typed remediation. For manual investigation when navigation cannot select an action, the request may explicitly use null action; this never invents an executable recommendation.

## S2-03 — Closed envelope modes and recertification

The envelope owns the versions of `result`, `guidance`, and its declared diagnostic members together. Any major bump requires recertifying result/guidance consumers, adapters and aliases, the #1561 shared-contract boundary, and §20.2 cost measurements. The internal decision version changes only if that contract changes; an envelope-only change does not gratuitously rename it.

`fullDecision` and `diagnosticMessages` are required in diagnostic mode and forbidden in routine mode. An empty diagnostic-message list is explicitly `[]`. Missing a diagnostic member is invalid. A flag may select this already-declared mode, but cannot introduce experimental unknown keys into v1.

## Measurement reconciliation and limits

I reproduced the supplied `.scratch/inspect/amend2.mjs`: **3,376** without the human request and **3,558** with it; the sampled blocked response is **185**. Its five-operation instruction explains the difference from my previously labeled four-operation sensitivity input. Precisely, the added operation is 45 characters plus one array separator: **46 characters**, producing **115 cumulative proxy tokens** across ten expansions. The rounded single-response delta of 11 does not imply 44 serialized characters.

Adding mandatory empty blocker args to that script in memory gives **3,573** total and **188** for its sampled human-blocked response. These are still synthetic string-cost measurements, not gate results. The seven-action inventory, nonempty warnings/normalizations, valid remediation/retry sequence, diagnostic investigations, and equivalent old/new transcripts remain required.

The **339** six-distinct-blocker row also reproduces, but “the real thing” overstates its evidence. The script manually constructs records using live guard IDs; it does not run those guards against a shared fixture, validate its proposed code/remediation mappings, prove simultaneous reachability, or include the matching review-approval human request. It is an improved synthetic size sample, not a measured live heavy decision. No new pass figure is added to the spec.

The useful invariant remains conditional: evidence-only changes do not grow routine output when the operational result is unchanged. More observations can still reveal additional blockers, warnings, or human work that must grow that output. The amendment removes serialization of the observation bundle, not that legitimate operational cost. All budgets remain unchanged.

## Verification and handoff

- Verified the reviewed spec, both previous amendment responses, and supplied reviewer digests; checked the local worktree environment/self-link.
- Inspected the relevant cross-issue guards; reproduced the original probe and the bounded in-memory args variant.
- Checked JSON examples, required blocker args, operational/internal consistency, unchanged numeric ceilings, formatting, Markdown lint, and whitespace. No implementation test or production-feasibility claim is made.
- Preserved the reviewer response byte-for-byte. The commit contains only the revised spec and this round's reviewer/author pair; the plan and all earlier responses remain unchanged.

Please confirm the three dispositions for terminal agreement. The user-directed sequence remains amended-spec acceptance, replacement plan, manual plan review/acceptance, then backlog hydration.
