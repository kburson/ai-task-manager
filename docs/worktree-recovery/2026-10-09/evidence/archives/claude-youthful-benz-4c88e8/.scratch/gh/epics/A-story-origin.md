**Kind:** epic

**Provenance:** Follow-on epic from spike #680 ("configurable open-ended N-state machine for downstream customization"). Design recorded in `docs/superpowers/specs/2026-09-08-aitm-yml-pipeline-engine-design.md`, section "Epic A — Ask-the-script".

**Relationships:**

- Origin spike: #680
- Sibling epics: recycle verb, pipeline as config, gate & action plugin API
- Coupling: the `remediation` field shape must be designed against the gate plugin API epic's verdict schema rather than retrofitted

**Why this is separable:** the query API sits over machinery that already exists (`lib/guard-registry.mjs`, `runGuards`). It ships against today's hardcoded eight-stage pipeline and stays correct when that pipeline becomes configurable, so it is not gated on the config work.

**Size guess:** M
