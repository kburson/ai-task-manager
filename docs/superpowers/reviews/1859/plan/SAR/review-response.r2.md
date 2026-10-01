# Issue 1859 implementation plan: SAR response r2

- Author/reviewer: same GPT-6 Astra agent, medium reasoning.
- Input: [plan.r1.md](plan.r1.md).
- Input SHA-256: `edf9b0a4f63918968fb51750bf4509c31c9e2b80cc64ff49c2ea318ec96119f4`.
- Source baseline: `4c8cb8a6`; accepted spec unchanged.
- Verdict: revise; two additional findings accepted into r2.

## Full-document review

Reread all sections and all six tasks, not only the first-pass corrections.
Checked schema/interface consistency, manifest and artifact lifetimes, runtime
binding versus write authority, comment recovery/size bounds, mutation retries,
legacy/directory adoption, typed refusal registration, normalization rendering,
guidance source and verification mapping against the accepted specification.

## Findings and dispositions

### PSAR-04 — P1: recording-only manifest freshness leaks into readiness

R1 strengthens raw manifest revalidation but offers only that combined validator.
Readiness's durable record contains the manifest content, not its original local
input path. Requiring the ephemeral input manifest at readiness would undermine
the complete durable comment and introduce an undocumented extra dependency.

Disposition: split shared validateArtifacts from recording-only
validateLocalEvidence/readBoundManifest. Readiness uses the comment-retained
validated manifest and actual artifact bytes. Recording and every retry still
compare the original raw manifest bytes. Add the interface and call site rule.

### PSAR-05 — P2: verifier predicate return shape is inconsistent

The pure API and tests use boolean true/false, but implementation prose requests
an ineligible result with a reason. Mixing object and boolean semantics risks
truthy false cases and inconsistent consumers at the eligibility boundary.

Disposition: every recognized verifier form, including malformed prefixes,
returns boolean true. Callers supply the named ineligible refusal. False remains
narrative only. Also clarify the generated fixture distinguishes a live policy
marker from an inert example rather than banning all example text.

## Prior finding closure and limits

PSAR-01 typed registry integration, PSAR-02 raw byte/ID bounds and PSAR-03 guidance
source/generator corrections remain present. No runtime implementation or tests
have been performed. This is the same author/reviewer loop; r2 requires another
full-document review before convergence can be recorded.
