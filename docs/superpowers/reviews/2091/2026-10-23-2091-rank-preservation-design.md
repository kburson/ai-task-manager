# Refine optional rank preservation

Authoritative scope: <https://github.com/kburson/ai-task-manager/issues/2091>

A maintainer must be able to omit optional rank during refinement without erasing the issue's existing rank. An interrupted publication must remain retryable with its original sealed intent. Accepted source: `4069e3cbc06b7d89139c2ef3d7d4820132667d65`.

The mismatch is in `scripts/task-tracker/verbs/refine.mjs`: omitted rank normalizes to null; board arguments and rationale omit it, but body cache refresh supplies null and includes rank in override keys. Real completion snapshot validation requires rank and therefore refuses after that overwrite. The publication operation key correctly retains null for omission and must remain unchanged.

Conditionally include rank in supplied body values and override keys only when explicitly provided. The existing field DB merge preserves rank from the fresh mutation base. Keep required snapshot fields and genuine absent-rank failure intact. Both changed and unchanged publication paths must use this behavior.

Production ownership is limited to `refine.mjs`. Regressions use the existing real tether publication cases with fetchLabels enabled. No configuration, stage policy, publication owner, source activation, pending record replacement, or historical rewrite. Native acceptance is serialized by the owning chat.
