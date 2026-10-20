# #2073 plan SAR round 2

Reviewed input: plan.r1.md, SHA256 `3594e5182cb987c3d963f71613c254ac1f007fc558a3e4d685c012490af38f0b`. Full document reread in two ranges to avoid output truncation, with accepted spec requirements and source rechecks of kind enum, target configuration, transport, body parser, native plan-exit route, writer results, fixture composition and task classification.

## Prior finding verification

P2073-01 is addressed: controlled shim plus all ports permits real admission without the skip-mode refusal. P2073-02 is addressed for marker syntax, config and result shape. P2073-03 is addressed by three substantive deliverables; native policy is not waived and all work remains. P2073-04 explicitly defines envelope transport, targetGraphql and null behavior. P2073-05 now declares route and adverse ceilings, and resolves initial presence pagination. P2073-06 specifies delimiter inventory and scalar parsing. P2073-07 includes both old fixture adaptations. No prior finding is deferred or rejected.

## New actionable findings

### P2073-08 — High: fixture prose still calls for an invalid kind

The raw population description says legitimate marked solo issue. DECOMPOSITION_KINDS in decomposition-assessment.mjs:14–21 has code, docs-only, audit, research, spike and epic; solo is a creation shape, not a valid kind. A literal implementation would refuse the baseline. Specify explicit code marker in the progress section and an independent absent-marker fixture. Keep the unknown-kind negative case separate.

### P2073-09 — High: graph inventory comparison baseline is not explicit

The first epic presence read deliberately remains partial, but the fence step just says compare sorted child sets. It must use the complete graph-phase inventory, not first-phase IDs, or ordinary parents with more than 50 children refuse. Likewise repeated graph root id/body must be compared with initial root before accepting child evidence. Define the comparison baseline and add a 51-child case with a complete graph and fence, plus same-length child replacement. Spec section 1 explicitly requires this distinction.

### P2073-10 — Medium: executable examples need complete fixture setup and accurate shared helper placement

Code fragments reference fixture and snapshot plumbing but do not show a complete runnable test importing and constructing them. The writing-plans skill requires concrete red/green examples. Add complete hook, target and paired-run examples with exact imports, scratch setup/cleanup and native outcome assertions. Place createTargetFixtureGraphql in the provider helper rather than traffic-cases, because traffic-cases needs the existing body builder and existing estimation-publication would import traffic-cases back; avoid an unnecessary circular dependency. Put both compatibility fixture edits in the primary file map and retain all required test commands.

### P2073-11 — Medium: regrouping left duplicate task Story Intent headings

Targeted markdownlint returned MD024 at canonical lines192 and332. Each task should have one authoritative Story Intent covering its full deliverable. Combine admission baseline intent and recovery intent into their owning tasks and use unique supplemental headings. Preserve immutable r1 bytes with this historical lint failure; do not change lint configuration. The supplemental contracts also should use ordinary third-level headings under their second-level parent; only headings beginning Task N define implementation tasks in the inspected policy.

## Estimate and verdict

6.5h remains an owner-approved forecast with 6–9h risk, not a validated duration. The plan has not reduced safety or measurement to hide known complexity. The bounded publication measurement plus actual route proof avoids unnecessarily demanding full native lifecycle simulation as a savings prerequisite; whole-transition claims stay gated on actual success.

Verdict: revise four new actionable findings. Total unique findings11, seven addressed in r1 and four to address next. No product tests, live calls, Git actions or implementation performed. Targeted document lint was executed and its two failures are recorded above.
