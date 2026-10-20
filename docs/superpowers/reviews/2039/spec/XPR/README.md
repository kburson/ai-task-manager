# #2039 specification XPR startup record

Status: blocked before review startup. No XPR review ID, invitation, author participant, reviewer participant, provider launch or acceptance was created.

The owner requested cross-provider review with Astra 6/high as author and Opus 5.5/high as reviewer. These are requested selections, not verified provider execution identities. The input is the SAR-converged [specification](../../../../specs/2026-10-19-2039-local-estimation-guarded-publication-design.md) at commit `dafb1d276036ddc17490f76329f6aa2c09732a15`, SHA-256 `3cd8c28e437ea423ec791cf1b4fdeb47f13afbe5f05d3b116da171b823260429`.

## Observed refusals

- `peer-review doctor` and `peer-review primary inspect --json` returned `APR_PRIMARY_AUTHORITY_UNAVAILABLE`: primary policy could not be validated. Doctor also reported unavailable primary configuration/integration contract, skill and author identity. The selected runtime/package itself was reported available.
- `peer-review setup --update --dry-run --json` refused primary admission with `source-class-unavailable`; it did not apply setup changes.
- Primary activation/registration dry-runs reported `mutation_occurred:false`, `effect:none`, selection completion uncertain, cleanup discharged and `retry_safe:false`. No automatic retry or primary mutation followed those results.
- Broker status was offline, with no registered review workspace/recovery candidate; no broker was started by this attempt.
- The installed peer-review skill resolver required the canonical runtime skill file, but the workspace scope hook refused that read. The project mirror and user wrapper were readable; they did not replace the required installed instruction authority.

These are startup/integration refusals, not an Opus model rejection or a negative review decision. No fallback review, alternative runtime, participant identity substitution or authority bypass was performed. Exact machine-local runtime/socket/session paths are intentionally omitted from tracked collateral.

## Recovery boundary

Repair and validate the registered primary integration through its sanctioned maintenance workflow, preserve any uncertain primary-election diagnostics, and restore access to the selected runtime's canonical skill instructions. Then establish genuine author identity and requested model/effort selections before a fresh XPR startup. Do not mark XPR accepted, reuse an invented review ID, or infer runtime permission from this document.

The [completed SAR record](../SAR/README.md) remains document-readiness evidence. XPR startup failure does not retract that evidence, confer cross-provider acceptance, or grant Plan/implementation approval.
