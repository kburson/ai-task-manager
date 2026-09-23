# Manual peer review: author response, round 1

- Issue: #1768
- Reviewer source: `docs/peer-reviews/spec/2026-09-23-2026-09-22-1768-review-lifecycle-design-review-80c813f0f96ca4e89434a7012676243b/review-80c813f0f96ca4e89434a7012676243b-reviewer-response-1.md`
- Reviewed spec: `docs/superpowers/specs/2026-09-22-1768-review-lifecycle-design.md`, version 3 at `59e63f591045c839b35a155e6d33f322b8fd1e03`
- Revised spec: same path, version 4 at `c01a0620eceb22b1652b320da22886dac28fb9b1`
- Review method: manual file exchange; this is not an `ai-peer-review` protocol submission or acceptance
- Author decision: request another reviewer pass on version 4

## Required findings

### 1. Hydration ordering and digest baseline — accepted

The spec now places the aggregate hydration SAR **after** all children finish
Refine and reach R4P. Refinement may revise previously hydrated children; any
affected child completes its normal Refine gates again. The aggregate receipt
captures the semantic digests at acceptance. A later semantic change or child
inventory change before epic Plan exit triggers a full aggregate SAR over the
current inventory. See the spec's “Plan review and epic hydration” section.

### 2. Master-plan revision cycle — accepted

`Source-plan*` bookkeeping is excluded from the child semantic digest. A
master-plan revision before epic Plan exit still requires a newly accepted plan,
source-field reconciliation, and a fresh aggregate SAR against that plan. The
linked plan-and-hydration cycle has a shared ten-round budget, so a plan edit
does not silently reset the review loop. Exhaustion leaves the epic in Plan for
an explicit planning decision. See “Plan review and epic hydration.”

### 3. Risk evaluator and unknown signals — accepted

The AITM SAR reviewer now supplies structured yes/no/unknown values with
evidence for every signal. AITM checks completeness and applies the versioned
rubric. An unclear signal gets another SAR round. If it remains unknown, AITM
records the reason, pauses Full-Auto work on that issue, and refuses selection;
it does not silently choose a lower review level. See “Specification review in
Refine.”

### 4. Provider loss after preflight — clarified

The availability snapshot determines the initial ceiling, as intended. AITM
also checks the selected provider immediately before each hosted launch. If it
fails after a healthy preflight, the chosen hosted path remains required. AITM
records the failure, preserves SAR evidence, blocks promotion, and uses the
governed recovery policy. There is no mid-run downgrade to SAR-only. See
“Specification review in Refine.”

### 5. GitHub issue revision — accepted

The spec no longer requires a nonexistent GitHub revision counter. The
Deep-Dive receipt binds the issue number and digests of the reviewed section,
scope, ACs, verifiers, dependencies, and estimate. Relevant changes before
child Plan approval require another SAR. See “Plan review and epic hydration.”

### 6. Artifact version authority — accepted

The Git commit and blob now identify authoritative bytes; `version` is a
human-readable ordinal. AITM checks monotonicity at governed write, review
entry, and approval gates. Duplicate, skipped, or regressed versions block
review or promotion and require a corrected commit with an anomaly record. See
“Artifact versions and provenance.”

## Optional suggestions

1. **Rubric bands:** clarified that a single high-impact signal deliberately
   selects XPR, while SPR-only means two lower-impact signals accumulate.
2. **Operation ID location:** specified a protected `Story Origin` body marker,
   preserved by the issue-body mutator.
3. **Search latency:** specified paginated issue API reconciliation rather than
   the eventually consistent search index. Zero or multiple matches block
   another create until reconciled.
4. **Pre-issue self-review bytes:** the idea record stores the reviewed draft's
   digest; a changed draft requires another self-review before promotion.
5. **Acceptance criteria:** added the peer-review attempt limit and the existing
   WBS fields with no additional per-child provenance fields.

## Verification

The version-4 spec passed `npx prettier --check`, `npx markdownlint-cli2`,
`npx cspell --no-progress`, and `git diff --check` before its commit. No
implementation code was changed in this review round.

## Next reviewer action

Read the version-4 spec at commit `c01a0620eceb22b1652b320da22886dac28fb9b1`
and check whether the six required findings are resolved. Write the round-2
review as a separate manual response file. Do not run `peer-review join`,
`submit`, or `finalize` for this file exchange.
