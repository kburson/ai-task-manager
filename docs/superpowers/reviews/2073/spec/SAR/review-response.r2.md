# #2073 specification SAR — round 2

Reviewed input: [spec.r1.md](spec.r1.md), SHA256 `f39c366da1dab5cb9e8994822ec27a74ee77715a387b29eec860cadbd903c9a7`.

Verdict: **Revise.** Full-document reread completed. F1–F8 are addressed as document requirements; two new actionable findings follow. No earlier finding is deferred or rejected. Scope remains specification only.

## F9 — P1: Keep extra target identity out of sealed authority schemas

The new contract correctly requires issue-node identity, but says to obtain it from authorized evidence without defining where it may live. `decomposition-assessment.mjs:81,194` seals subject keys to repository, issue, projectId and projectItemId. `resolveEstimateWriterSubject` currently drops the issueId returned by `projectItemForIssue`; native manifests, operation identity and context digests depend on the old subject. Adding issueId to that subject or replacing existing source observation shapes can invalidate durable prior records and retry reconciliation. That contradicts the no-saga/schema-redesign boundary.

Required revision: carry additional issue/repository node IDs only as invocation-local transport validation metadata, bound to the unchanged sealed subject, with fresh capture on each recovery. Retain the four-key subject, existing digest inputs/effect targets and persisted manifests/before-record schemas. Do not treat metadata as permission. Use the existing membership result's issueId where possible; validate its binding and budget any extra read. Add old-format saved-manifest recovery fixtures so this is testable. If immutable issue-ID ownership across old command attempts is desired, it requires a separate schema decision; this optimization cannot claim it.

## F10 — P2: State finite targeted-read limits and fail closed without a weaker fallback

Section 1 retains numeric hook pagination limits, but new project-definition/value observations only say bounded enumeration. The existing general membership resolver permits 1,000 pages, the hook permits three, and `GH_API_TIMEOUT_MS` is a per-command 30-second timeout. A helper can therefore claim boundedness while spending a new 30-second budget on every page. In addition, “retain safe complete reads” is ambiguous when the existing full collector does not prove configured field definition existence: that fallback could erase the stricter absent-definition guarantee.

Required revision: define a finite per-logical-target observation page/deadline/response envelope (or a mandatory preimplementation numeric plan gate) and refusal on exhaustion. A conservative full fallback must satisfy the exact same identity/type/absence contract; otherwise refuse. Report extra fallback requests rather than hiding them. For deterministic baseline comparison, pin clock/IDs where possible or specify precisely which volatile report fields can differ; whole-manifest equality should not fail only because the two runs have distinct timestamps. Do not normalize away operation/subject/effect identity or before/intended/permitted digests.

## Source-backed reread results

Re-read the complete r1 document. Rechecked migration and reevaluation callers: migration performs additional nested owner checks and unchanged-path verification; reevaluation can prepend an audit effect. This supports the per-invocation scope and shared-caller test requirements. Rechecked the subject schema, owner reconciliation path and project-membership pagination; these establish F9 and F10. The admission table now resolves absent-marker ambiguity, observed phase drift refuses, scalar null rules are explicit, baseline input/source retention is required, and leaf shape versus field-publication dispatch claims are separated. The four-hour allocation remains unvalidated with an explicit future gate; no split has been enacted. These are not unresolved defects in the revised document, nor evidence that feasibility has already been proved.

Verification remains document/source review only. No product tests, Git commands, cloud reads, task-state changes or source edits were performed. Next action: author revision and another full reread.
