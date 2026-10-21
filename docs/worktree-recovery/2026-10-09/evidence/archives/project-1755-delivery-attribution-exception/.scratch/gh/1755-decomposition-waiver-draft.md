## Decomposition Waiver

- **Rationale:** The user expressly authorized exactly one governed AITM defect for this cross-cutting fix. Splitting the tightly coupled authority, delivery, and receipt changes into additional issues would violate that scope.
- **Expected-focused-duration:** 16 hours
- **Milestone-checkpoint-plan:** Commit and verify the canonical scope evaluator, host authority record, delivery integration, receipt semantics, and final package gates as separate checkpoints on #1755.
- **Why-no-nested-children:** Every checkpoint changes one shared delivery authorization contract and must land atomically before any consumer can safely use the exception.
- **Approved-by:** [awaiting explicit user decision]
- **Approved-at:** [awaiting explicit user decision]
