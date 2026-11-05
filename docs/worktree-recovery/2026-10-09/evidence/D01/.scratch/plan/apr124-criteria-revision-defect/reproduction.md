1. Use a Develop-state issue whose approved revised scope contradicts its criteria. ai-peer-review #124 records the superseding direction in `scope.session-handshake-v1`.
2. The obsolete criteria are unchecked and carry `aitm-verified vc-list` declarations, for example vc:1 and vc:4. These declarations are not execution receipts; do not mark obsolete criteria complete.
3. Prepare schema `aitm.issue-body-operation/v1`, kind `replace-exact`, with the exact old Acceptance Criteria section as expected and new unchecked criteria without inherited annotations/proof as replacement. The preserved consumer input is `.scratch/gh/124-handshake-ac-operation.json` in #124's recorded worktree.
4. With exact binding/worktree and active timing, run `npx aitm issue-body 124 --operation-file .scratch/gh/124-handshake-ac-operation.json`.
5. Actual: exit 1, `task-tracker error: issue-body:protected AITM markers changed`; body unchanged.
6. `npx aitm test 124` refuses at entry preflight with `unclassified-refusal` (observed exit 3). Explain reports `develop-exit-code-complete`, no automatic remediation, and human investigation required.

Earlier automatic approval review rejected rewriting criteria while retaining their obsolete declarations. Copying them to new text or bypassing Test is not a valid repair. Reproduce with fixtures, not by mutating the live consumer issue during implementation.
