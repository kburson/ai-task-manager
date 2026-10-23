### Story Intent

- **Beneficiary:** Maintainer refining governed work.
- **Capability:** Preserve an existing issue rank when optional rank is omitted while retaining exact publication retry identity.
- **Need:** Interrupted publication retries must keep their original arguments, but Refine currently overwrites persisted rank with null.
- **Value or failure prevented:** Refinement completes without losing rank or replacing a sealed pending operation.

### Semantic review

All seven questions pass from live #2091 Scope, Acceptance Criteria and source inspection. The beneficiary is the maintainer, the capability is optional-rank preservation, and the need is concrete interrupted publication recovery. The counterfactual failure is loss of existing rank followed by a required-rank snapshot refusal. The claims are grounded in runRefine and the real publication composition. This standalone repair contributes a distinct safeguard from DATE repair #2089 and timing correction #2090. Its user story can be understood without a plan file.

### Root cause and current behavior

The accepted source is 4069e3cbc06b7d89139c2ef3d7d4820132667d65. In scripts/task-tracker/verbs/refine.mjs, argument normalization sets rankNum to null when rank is omitted or empty. The board tether arguments and rationale omit optional rank. However applyBody supplies rank: rankNum to ensureIssueFieldDb and always includes rank in overrideKeys, in both changed-publication and unchanged-publication paths. Therefore the fresh persisted rank is replaced with null. With fetchLabels enabled, the real stampRefinementSnapshot then refuses refinement-snapshot:field-rank. That required-field refusal is correct and must remain for issues whose rank is genuinely absent.

The publication key includes rank: rankNum. Null in that key expresses the original omitted-rank intent. Substituting the current rank into the key would create a different operation and break sealed pending retry identity. The fix must leave the key untouched and change only body field input and override selection.

### Bounded implementation and test design

Supply rank to field refresh only when explicitly provided and append rank to overrideKeys under the same condition. Keep the fresh mutation base authoritative for omitted rank. Production ownership is only refine.mjs; no new module, stage rule, guard policy, publication coordinator, config or historical data change is needed. Explicit supplied rank must still update board and body. Source remains unedited until Plan approval and verified Develop admission.

Extend existing project-tether-publication.cases.mjs, imported by project-tether.test.mjs. Use real runRefine, actual tether, real publication ownership and real snapshot by enabling fetchLabels. Cover changed publication preserving rank, explicit rank replacement, unchanged Estimate/Size preservation, exact interrupted pending retry retaining operation ID, and genuine absent-rank failure. Existing cache tests use an isolated publication fixture, while existing real composition supplies rank 3 and omits fetchLabels; that combination missed this failure. Capture meaningful RED before minimal GREEN. Expand existing cited vc:1 with the exact importing harness before approval. Do not stamp proof until the real runner succeeds.

### Estimate and execution boundary

Local agent estimate remains S/3h for one production entry point plus focused existing tests. No cloud completed comparables, rubric change or backlog scan is needed. Native Refine explicitly uses rank 2 from its first invocation. Plan-estimate compatibility preserves S/3h. Run all focused declarations, npm test, npm run test:slow, lint and format; preserve complete raw failures and success output. Independent GPT-6.1 Sol / medium reviews exact source with raw report and rulings. Source/tests and evidence are committed with #2091 attribution. The owning chat serializes native acceptance; this worker does not invoke native Test, Review, approval or Close, and does not activate source for #2089.
