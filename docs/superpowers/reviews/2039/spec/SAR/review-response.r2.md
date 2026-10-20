# #2039 specification SAR — round 2

- Reviewer: persistent native SAR agent, requested `gpt-6-astra` / `high`.
- Exact input: [spec.r1.md](spec.r1.md), SHA256 `6488fa3df4ac81a8633a7b061c32988a3e694ec7f48ed6f5bb8a7eceb55ed7ff`.
- Result at the time: revise one remaining finding, F9; output [spec.r2.md](spec.r2.md), SHA256 `bc1490f406244c4beb33ee97404790300c6fc907241905096d1d0c3f8476d73d`.
- Scope boundary: the owner changed the publication design before a terminal review of r2. No convergence verdict was issued for r2. See [scope-change.md](scope-change.md).

## F9 — Separate the bounded body primitive from required guard transport without hiding calls

**Severity:** moderate.

The full r1 reread confirmed the eight round-1 dispositions but found that its three-call successful-body fixture could be misread as including arbitrary asynchronous fresh-base checks. The parent independently flagged this ambiguity. `versioned-issue-write.mjs:versionedWriteBody` invokes `validateFreshBaseAsync` after fetching the body; that callback is not inherently pure. Moving it outside the helper cannot remove its calls from a whole-command budget.

**Disposition:** addressed in r2. The no-op/conflict/success body fixtures require prepared guard observations and pure mutation validation. Native guard preparation remains charged to the enclosing invocation. Preserve the guard and refuse or seek design review if extra transport is required. Explicitly state that neither the six-operation fixed allocation nor adapter feasibility has been proved by document review; source-shaped failing/passing implementation tests must establish the evidence. Clarify that `M` is the fixed manifested maximum rather than a value computed from observed traffic.

The canonical draft and r2 snapshot were formatted before hashing and were byte-identical. No product test, Git action, lifecycle mutation or additional GitHub call ran in this round. F1–F9 describe the superseded initial design; they remain historical evidence and do not override the owner's later cache/manifest/native-revision requirements.
