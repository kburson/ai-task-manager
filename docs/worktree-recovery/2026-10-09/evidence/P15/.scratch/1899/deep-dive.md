### Story Intent
- **Beneficiary:** AITM delivery operator.
- **Capability:** Explicitly fulfill declared whole-suite commands through authenticated CI coverage while preserving affected local verifiers.
- **Need:** The project provider currently appends npm test and test:slow after its cloud verifier, executing full host suites contrary to the TIA-only constraint.
- **Value or failure prevented:** Preserve real full-suite assurance and native lifecycle receipts without an unintended second execution on the host.

### Observed Root Cause
The public resolveVerificationProvider plan at a7ad2b45 reproduces both full host commands as targeted steps after test-cloud-complete. Native #1897 ran 954 fast-suite files; its interrupted evidence is preserved and is not a passing Test receipt. Current project behavior intentionally appends commands and lacks an explicit coverage contract; assuming cloud verification covers them was the integration mistake.

### Bounded Design
Add optional test.declaredCommandCoverage as an array of closed {command, requires} entries. Normalize command through the existing allowlist to canonical argv text; require nonempty unique configured Test classifications whose kind is test, reject collisions with an actually executed Test command, duplicate command aliases and unknown keys before execution. Coverage is opt-in, not inferred from test-cloud-complete naming. Only matching declared commands become derived test-covered-N results requiring all actual prerequisite results to pass. Matching uses the same tokenizer as configured command normalization. Preserve uncovered declared commands and current defaults. Keep canonical commanded receipt records only for actual executed or already validated reused commands; derived suite results must not become fake npm execution records. Reuse the existing native Test derivation seam.

### Implementation and Verification
Modify verification-provider-registry.mjs to normalize/validate coverage, and verification-providers/project.mjs to partition mapped declarations into derived outcomes. Add affected registry cases and Test-verb runtime regressions at its existing dependency-injection boundary. First run tests against unchanged production for genuine RED; then implement the minimal mapping and verify GREEN. Exercise cloud failure, missing/invalid/duplicate references, multi-prerequisite all-pass, no-configuration behavior, exact duplicate execution and uncovered affected tests. Document the project trust boundary and configure this repository's actual cloud verifier explicitly. No approved downstream Scope or CI source artifacts change. Host runs only these affected tests and static checks; full exact-head unit/integration/slow coverage runs in CI.

### Semantic Review
Stakeholder, capability and need are explicit and grounded in an actual native failure. Without the capability native Test violates the declared host constraint or lacks native completion evidence. The change is distinct from #1897 AC lookup and #1872 CI sharding: neither offers project-provider declared-command coverage. The issue is standalone with reproduction, trust boundary and verifier IDs. Root implements this one bounded task and owns lifecycle; genuine independent whole-branch review precedes delivery. No review, approval, evidence or command-validation gate is waived.
