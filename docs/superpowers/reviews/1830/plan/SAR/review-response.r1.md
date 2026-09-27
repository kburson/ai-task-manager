# Issue 1830 plan: review response r1

- Review method: single author agent, full-document self-review.
- Reviewed revision: r0, preserved in [plan.r0.md](plan.r0.md).
- Reviewed SHA-256: `69dc96df584fe56a4f35c58414b78a985aa5014263c42daf9bacaf49a169517a`.
- Source baseline: `32fc3a04b0cc3f738902aea0f1e6430e4888d579`.
- Verdict: changes required; four P1 findings.

This response carries forward the actual first-pass findings from
[self-review-r1.md](self-review-r1.md). That earlier artifact was a review-only
handoff and did not complete SAR. This file begins the user-defined review,
revision, and repeat loop; it does not claim another independent review.

## Findings and required changes

1. **SAR-01, P1 — Index inspection precedes compound-command effects.** A
   documentation-only index can acquire source changes through a preceding
   `git add` before the inspected commit executes. Reject the documentation
   allowance for compound or opaque execution, and state the concurrency limit.
2. **SAR-02, P1 — Alias and shell ownership checks do not enforce lifecycle.**
   Current alias and nested-shell paths may validate the owner while activity
   remains `READ_*`. Share commit discovery across activity and ownership
   consumers; unsupported commit-capable execution must refuse.
3. **SAR-03, P1 — Path globs do not prove an artifact is documentation.**
   `docs/run.mjs` and `docs/package.json` currently classify as documentation.
   Specify eligible formats, modes, rename/deletion handling, and negative cases.
4. **SAR-04, P1 — The document edit path still refuses in Plan.** Specify Plan
   document edits and commits together, with an exact state matrix and explicit
   singleton ownership. The generic early-state ownership policy accepts an
   unassigned issue, so its `ok` field alone cannot authorize this allowance.

The detailed source anchors, current-code probes, and limits remain in the
original report. Its blocked temporary-index demonstration is not test evidence.

## Revision instructions

Write revision r1 of the canonical plan. Include executable implementation seams,
an AC-to-test mapping, expected-versus-observed branch comparison, actual
snapshot semantics, and explicit distinctions between SAR convergence and
workflow approval. Then review the entire r1 document again, including new
interactions introduced by these corrections. No runtime implementation is
part of this review loop.
