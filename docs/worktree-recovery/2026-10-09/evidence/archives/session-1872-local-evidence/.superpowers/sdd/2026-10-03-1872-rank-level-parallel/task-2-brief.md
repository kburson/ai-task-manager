## Task 2: Immutable authority and bounded human scope

Files:

- Create `scripts/task-tracker/lib/epic-rank-wave-authority.mjs`.
- Create `scripts/task-tracker/lib/epic-rank-wave-source.mjs`.
- Create corresponding unit tests under `scripts/tests/unit/task-tracker/lib/`.
- Reuse the current authorization source and workflow-exception authority modules; discover their exact exported production seams before edits.

Start with failing envelope/revision tests: complete scope, exact proposal digest, expiry boundary, explicit non-expiring record, latest revision revoked/expired with no older resurrection, duplicate ID with conflicting bytes and unreadable newer revision. Implement closed record schema and deterministic canonical digest.

Then write source tests using the existing host-backed loader: genuine direct full scope; ordered exact prior human scope plus clarification; labeled acceptance of an exact displayed proposal; unambiguous yes; verified host repository/epic linkage. Reject missing exact hashes, unrelated broad intent, agent relay, ambiguous alternatives, quoted injection, reordered messages, over-eight context and contradictory later human scope. Retain exact referenced messages and source hashes; no new permission phrase is imposed on existing authentic authorization.

Run new tests red/green and existing provenance validator tests to preserve compatibility.

