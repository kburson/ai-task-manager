## Deep-Dive Analysis (2026-09-11)

The defect was reported against AITM's former in-repository co-review runtime. That runtime no longer exists on current trunk: issue #1592 completed the extraction to the exact `ai-peer-review` package dependency at version `0.2.0`. The installed package already owns the author/reviewer identity boundary, the `acceptance-pending` state, finalization, retry validation, recovery behavior, and good-enough authority. Reintroducing those mechanisms into AITM would create a second authority source. The bounded current-trunk repair is therefore an AITM host-contract guard plus operator guidance that proves and explains the package-owned behavior.

### Files to edit

- `docs/superpowers/specs/2026-09-11-1516-author-owned-finalization-contract-design.md`
- `docs/superpowers/plans/2026-09-11-1516-author-owned-finalization-contract.md`
- `scripts/tests/integration/review/peer-review-package-parity.test.mjs`
- `docs/guides/github-native-coordination.md`

### Step-by-step implementation plan

1. Record the extracted ownership boundary and the current-trunk finalization contract in an issue-specific design and implementation plan.
2. Extend the existing AITM/package parity fixture to execute a normal accepted review through reviewer handoff, refusal cases, author finalization, and idempotent retry.
3. Assert that reviewer acceptance releases the protocol into `acceptance-pending` without advancing Git HEAD or publishing the terminal manifest, and that status routes the next action to the author.
4. Assert that reviewer, foreign-author, and missing-identity finalization attempts fail before any tracked mutation.
5. Assert that the registered author alone creates the terminal manifest and commit, with an identical retry returning the same result without another commit or event.
6. Update the operator guide to tell the reviewer to stop at `acceptance-pending` and the registered author to run the exact finalization action shown by package status.
7. Replace the stale verifier that targeted the removed AITM runtime with the focused package-parity verifier, then run the complete governed verification lanes.

### Test additions

- `scripts/tests/integration/review/peer-review-package-parity.test.mjs`: add an end-to-end host contract covering reviewer non-publication, author-only finalization, failure-before-write identity checks, exact terminal commit paths, status/help routing, and idempotent retry.

### Identified risks

- A host test that copies package internals would become a competing protocol specification; assertions will stay on the installed package's public CLI/API and externally observable repository effects.
- Session identity can leak from the invoking environment; the missing-identity case must explicitly remove all supported provider session variables.
- Startup creates tracked review collateral before acceptance, so the boundary must compare Git HEAD and terminal manifest publication rather than incorrectly asserting that the destination is wholly absent.
- Finalization creates a real fixture commit; exact changed paths and retry HEAD stability must be asserted so unrelated tracked mutation cannot pass unnoticed.
- The original acceptance text names legacy archive mechanics. The design will map those requirements to the extracted package's durable manifest/finalization vocabulary without fabricating historical AITM delivery.

### Sibling sub-issues to spawn

None. The installed package already contains the bounded capability and no additional defect is required.

## Dependency Map

Depends on: none

Blocks: none
