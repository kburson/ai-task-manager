Spec compliance: ❌ Issues found — retained provenance is not bound to the payloads used by the new v3 model-output path.

### Strengths

- `scripts/task-tracker/lib/estimation/forecast-v3.mjs:50` reuses v2 validation through a detached projection, preserving strict root fields, semantic checks and half-hour validation.
- `scripts/task-tracker/lib/estimation/forecast-v3.mjs:125` validates actual retained manifest/payload bytes rather than trusting a caller-provided validation result.
- `scripts/task-tracker/lib/estimation/forecast-v3.mjs:29` rejects fictional comment IDs for local provenance; `:108` rejects duplicate outcome identities.
- `scripts/tests/unit/task-tracker/lib/estimation/forecast-v3.test.mjs:274` exercises real retained-byte corruption, repository mismatch and snapshot/hash mismatch.
- Package inventory changes are limited to the new module and its presence assertion.

### Issues

**Important — [P1] Bind v3 calculation inputs to the retained payloads.**  
`scripts/task-tracker/lib/estimation/forecast-model.mjs:230-237` attaches caller-supplied provenance after calculating from independently supplied `rubric.payload` and `comparableOutcomes`. The retained checks in `scripts/task-tracker/lib/estimation/forecast-v3.mjs:131-152` establish that the snapshot describes genuine retained records, but compare only rubric metadata and outcome identities against the forecast. They never establish that those retained payloads were the calculation inputs.

A focused read-only probe supplied valid retained evidence and unchanged provenance, then altered the calculation rubric’s human/AI implementation coefficients and the comparable outcome’s landscape under the same record IDs. The new builder returned a v3 forecast, and `validateForecastProvenance(changed,{repository:'owner/repo',evidence})` accepted it:

```text
Plan human hours: 44 → 83
AI P50 hours: 32 → 52
Comparable weight: 0.25 → 0.2204
localEvidence unchanged: true
Retained validation accepted: true
```

This violates the requirement to correlate forecast inputs with retained payloads: an auditable-looking forecast can describe different calculation inputs. In the v3 builder path, derive calculation payloads from validated retained records or compare the actual selected rubric/outcome payloads against those records before calculation. Add negative tests that preserve IDs, version, confidence and cohort size while changing calculation-bearing payload fields. This requires input identity validation, not a general replay engine.

**Minor — retained lint output contains baseline noise.**  
`.superpowers/sdd/2026-10-20-2039-active-child-execution-plan/task-19-lint.log:32` onward reports soft line-cap notices; `:176` reports 30 baselined tests exercising no repository source. The output is not pristine. These are acknowledged baseline diagnostics, with zero new reach offenders at `:207`; no evidence ties them to a new Task19 defect.

**Critical:** None found.

### Verification and scope limitations

- Read the supplied brief, report and complete review diff once. Inspected the model’s omitted calculation body because the diff cut across that function and the named risk concerned calculation-input identity.
- Inspected unchanged `local-runtime.mjs` and `local-evidence.mjs` specifically to determine how accepted predecessor contracts bind retained bytes, select records and construct provenance.
- Inspected unchanged `forecast-record.mjs` specifically to verify the delegated v2 strictness and v1/v2 compatibility behavior.
- Inspected the existing fixture helper to construct the focused mismatch probe. The first probe stopped on a frozen fixture payload; the corrected probe cloned the fixture before mutation and confirmed the defect.
- Recorded RED evidence is present: missing-module failure in `task-19-red.log:5`, followed by 2 passing/28 failing behavioral tests in `task-19-red-behavior.log:31-34`.
- Recorded targeted GREEN is 31/31 in `task-19-metadata-green.log:32-35`; recorded regressions are 107/107 in `task-19-final-regressions.log:108-111`.
- Recorded full fast validation reports 990 passing files and 93.1 seconds in `task-19-npm-test.log:996-1000`. Formatting success is recorded in `task-19-format.log:4`. No suites were rerun.
- ⚠️ Cannot independently establish execution chronology or exact logged-process exit codes from file contents alone.
- ⚠️ Cannot establish full slow-suite success, integrated-head CI, native Test/Review/Close, publication authority or delivery; these are outside this technical review.
- ⚠️ Cannot independently establish native admission, pause/binding state, source freeze or repository cleanliness without inspecting native state or Git; those were supplied controller facts.
- ⚠️ Host/repository and missing-ancestry refusal rely partly on unchanged predecessor validation. The focused inspection found repository/payload correlation and lineage checks, but this review did not execute every predecessor failure fixture.

### Considered but declined

- Default v2 output: declined as a finding because current-schema/writer migration belongs to the explicitly identified neighboring slice.
- Forecast-record re-export changes: declined because existing exports remain unchanged and no extraction removed them.
- Requiring raw evidence for every structural validation: declined because the API explicitly distinguishes snapshot validation from retained-byte validation and refuses a repository expectation without evidence.
- Requiring similarity-ranked comparables and manifest inputs to share one order: declined because their existing orders serve different purposes; the contract does not clearly require equality of those orders.
- Requiring snapshot-only validation to establish current host/configuration: declined because the accepted snapshot omits those fields and current-selection validation belongs to the retained-input boundary.
- Requiring forecast replay to verify arbitrary output numbers: declined because strict provenance validation need not replay the model; the finding concerns actual inputs directly available to the new builder.
- Blocking on baseline lint diagnostics: declined because the logs identify existing baseline noise and no new offender.
- Broadening tests or crawling callers: declined because the confirmed input mismatch is narrowly reproducible and package-wide reruns would not resolve it.

**Spec compliance:** Needs fixes for calculation-payload correlation.

**Task quality:** Needs fixes. The schema implementation and retained-byte checks are focused and well tested, but the new builder can attach valid provenance to calculations made from different payloads. This technical verdict establishes no native lifecycle transition or delivery status.
