## Repository migration audit

- Source issue: `kburson/ai-task-manager#1377`
- Target repository: `kburson/ai-peer-review`
- Target baseline: `27739da257a991c6eca23285df0885370f6d1788`
- Decision: native GitHub transfer, preserving issue history, comments, and the source URL redirect
- Historical design: `ad944209e2b719e9b0ecadbd1d3d710ceacfb498:docs/superpowers/specs/2026-08-22-1377.md`; the commit remains unmerged and the document remains draft/unreviewed
- Delivered overlap removed from this story: resident liveness, token-free MCP waiting, and automatic transport negotiation in `ai-peer-review@0.2.1`
- Remaining scope: phased multi-artifact sessions, phase-entry artifact binding, non-final acceptance/finalization, durable cursor advancement, compatibility, and target-repository documentation/tests
- Dependency boundary: standalone issue #9 owns the remaining wake coordinator and reconciliation work

The transfer does not claim design ratification, implementation, approval, delivery, or lifecycle completion.
