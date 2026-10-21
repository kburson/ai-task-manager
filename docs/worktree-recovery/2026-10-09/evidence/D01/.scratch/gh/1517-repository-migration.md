## Repository migration audit

- Source issue: `kburson/ai-task-manager#1517`
- Target repository: `kburson/ai-peer-review`
- Target baseline: `27739da257a991c6eca23285df0885370f6d1788`
- Decision: native GitHub transfer, preserving issue history, comments, and the source URL redirect
- Existing overlap: `ai-peer-review@0.2.1` already supplies token-free MCP waiting, resident leases, automatic-required capability negotiation, and one-shot native push
- Remaining scope: the revision-keyed wake coordinator, durable idempotency ledger, missed-event reconciliation scan, pointer-only wake capsules, and terminal/intervention wake handling are not implemented on the target baseline
- Verification migration: the issue now names standalone package test, lint, format, packaging, and Git checks instead of removed AITM `scripts/review/**` paths

The transfer does not claim implementation, approval, delivery, or lifecycle completion.
