# SAR round 3: revise test-harness wording

Reviewer: same persistent GPT-6-astra SAR agent.
Input: `spec.r2.md`.
Input SHA-256: `477ef72fcbe9d11112baa25a7fc73a9bcc1e94e75e0c9d13fe776c5fdc74a9f9`.

## Review performed and finding

Reread the full r2 document. No material design or coverage findings remain.
The prior editorial substitution introduced awkward harness wording:
“home of the subprocess directory” and a repeated “existing”. Replace the
paragraph with a direct requirement to derive fixture paths from the same
`homedir()` value used by the child guard and isolate its session identity.

The containment predicate, diagnostics, write invariants, test matrix,
verification-command correction, delivery boundary, and authority disclaimers
remain consistent with the issue and source. The test-harness clarification is
editorial and does not alter the intended implementation.

## Disposition

Revise to r3 and retain the full r2 input snapshot. Perform one final full review
before recording semantic acceptance.
