1. Install dependencies in the current AITM checkout and confirm `ai-peer-review@0.2.0` is present.
2. Run `npx aitm co-review --help` and observe that the legacy command is still supported.
3. Inspect the production command catalog, self-documentation, and task occupancy lifecycle and observe their remaining references to AITM-owned co-review code.
4. Inspect `scripts/review/**` and observe that the duplicate CLI, protocol implementation, schemas, and recovery runtime remain after #1546 and #1549 closed.
