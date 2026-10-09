## Deep-Dive Analysis — #1882

### Story Intent

- **Beneficiary:** A maintainer delivering an approved child change into its parent integration branch
- **Capability:** Verify child integration through the project's configured verification policy and retain its completion checkout
- **Need:** The child merge-back CLI currently launches full host suites regardless of a project's CI receipt provider and removes the workspace before exact-head completion
- **Value or failure prevented:** Complete verified integration without violating CI-only suite execution or losing the workspace needed for truthful approval and closure

### Observed defect and boundaries

The concrete consumer is ai-peer-review #140, an approved Review-state child of #107. PR158 has green complete CI with all ten workers and fifty actual lane receipts. Its registered deliver command correctly returns not-provider-delivery because child lineage must integrate into its authoritative parent branch. No provider merge has occurred. The user chose preserving this graph relationship and repairing merge-back, with full host suites prohibited and affected tests allowed locally. This issue repairs the upstream runner; it does not implement more HTTP features, change the graph, waive any verification gate, or change historical receipts.

### Source investigation and cause

The shipped merge-back.mjs validates authoritative graph-derived branches, recorded child path and checked-out branch, resolves the immediate epic and grandparent, optionally rebases the epic, rebases the child, verifies it and performs a fast-forward merge. Its injected core runner is synchronous and accepts only a boolean result. The real CLI ignores verificationProvider and uses a hardcoded list of test:unit, test:integration and test:slow. It then removes the worktree, detaches an upstream and deletes the child branch. Tests cover graph authority, conflict refusal, failed tests and cleanup. The project verification provider already validates command syntax through the common allowlist and yields deterministic Test plans, including issue-declared targeted commands. Consumer cloud verifier commands validate genuine current-head CI artifact provenance and fail on stale or missing receipts. Reuse that contract rather than introducing a parallel receipt format or weakening validators.

### Design and execution plan

Keep the existing Node default suite sections for projects without an explicit provider. For an explicit project provider, resolve a Test plan against the child checkout configuration and its live issue declarations. Execute the validated argv in the child's worktree, refuse rejected commands or unsuccessful exits, and propagate verifier refusal to the existing no-merge/no-cleanup path. A stale cloud receipt must produce failure; it is never relabeled to a rebased SHA. Setup should follow the provider's declared npm-ci contract where applicable. Add an explicit preservation option to the registered CLI and injectable core so an owning session can finish Test, Review, approval and close from the same worktree. Default cleanup remains compatible unless inspection shows the lifecycle requires a safer default. Validate option grammar before mutation.

Write failing behavioral regressions first: configured project commands run without default suites; verifier failure blocks parent merge and cleanup; checkout preservation retains branch and upstream after successful integration; default Node commands and default cleanup remain protected. Cover invalid provider configuration and rejected commands before Git mutation when possible. Use a real temporary project and actual configured Node verifier to prove success and stale-evidence failure rather than asserting only source text or mocked calls. Existing injected graph tests remain the authority-regression floor. Then implement the minimum correction and run only these affected files on the host. Full suites and receipts are handled by delivered CI support. Lint, format and exact-head verification run through canonical workflow; no fabricated receipt or installed runtime patch is permitted.

### Integration risks and review focus

Rebase changes the child SHA, so a provider may legitimately refuse until the branch is pushed and CI rerun. Parent worktrees may already hold the integration branch; inspect actual Git placement and preserve safeguards rather than force-checkout. A verifier must not mutate HEAD or leave source dirt that could invalidate integration proof. Review the sequence of option validation, graph/path checks, provider setup, command failure, fast-forward and cleanup. The user prohibited delegated agents, so this owner performs a separate final review and records it honestly. Supporting tooling must reach actual trunk before repacking for #140; unmerged source is never adopted as installed operational authority. No main or foreign source checkout will be edited during implementation; create the dedicated worktree after Develop admission.

### Estimate and stakeholder review

This is one coherent operational safeguard, estimated at two human hours including regression coverage and CLI integration. All seven story questions pass: the maintainer is a real beneficiary; desired behavior and missing condition are concrete; the avoided failures are host-policy violation and lost completion state; claims come from observed source and the consumer delivery refusal; this scope is distinct from full-suite sharding #1872 and declaration repair #1873; the story stands alone. CI waiting can add wall time without changing the human implementation estimate.
