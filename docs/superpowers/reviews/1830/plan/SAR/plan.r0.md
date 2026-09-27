### Story Intent

- **Beneficiary:** repository maintainer governing work in linked worktrees
- **Capability:** consistently authorize documentation and evidence commits against the actual tool worktree and staged artifact types
- **Need:** hooks currently resolve the process checkout, recognize only some Git commit spellings, and reject canonical patches with a terminal newline
- **Value or failure prevented:** prevent false refusals of authorized planning work and prevent alternate command spellings from bypassing lifecycle and ownership checks

### Findings and boundaries

At trunk 32fc3a04b0cc3f738902aea0f1e6430e4888d579, activity-guard.mjs and bash-guard.mjs derive projectRoot from the hook process cwd. source-edit-gate.mjs accepts payload.cwd but can override it through AI_TASK_MANAGER_PROJECT_DIR and reads the global active issue. activity-policy.mjs recognizes only a leading git commit, while bash-worktree-guard.mjs and bash-guard.mjs contain separate Git global-option parsers. extractApplyPatchTargets splits a terminal newline into an empty last element and rejects it as a missing boundary. The active session also reproduced the patch refusal while creating this planning scratch document.

Use a shared physical worktree context from tool workdir/cwd, payload cwd, then process cwd. The recorded current-session binding remains an independent authority check, including branch identity. Command paths must never redirect writes to unrelated worktrees. Preserve installed-guard checks before scratch and lifecycle allowances. Uninspectable guarded mutations must refuse rather than become read-only.

### Implementation plan

1. Share direct Git parsing across guards using existing shell segmentation conventions. Recognize executable paths, supported wrappers, sequential global options, attached and separate -C/-c forms and long options. Resolve sequential -C against effective tool cwd. Preserve ownership message inspection and alias/indirect-command refusals.
2. Share physical worktree context and current-session binding validation in activity, source-edit and Bash guards. Preserve unbound/read-only behavior; refuse mismatched mutation contexts and uninspectable repository/index redirection.
3. Inspect NUL-delimited staged paths in the resolved worktree. A nonempty documentation/evidence-only inventory becomes COMMIT_DOCS. Unknown, mixed, code-bearing or unavailable inventories remain COMMIT_CODE. Options adding unstaged content, selecting paths or amending prior content require stricter classification. Permit COMMIT_DOCS only where governed documentation is allowed, retaining issue, exact owner, branch and worktree checks.
4. Normalize exactly one optional LF or CRLF after the canonical patch end. Preserve remaining contents and unsafe-path checks. Reject extra trailing lines, malformed boundaries, traversal, backslashes, NUL, unsupported headers and empty targets.
5. Add regressions first for equivalent Git forms, staged mixtures, linked payload versus main process cwd, branch/worktree mismatch, lifecycle states and patch endings. Run targeted checks, required fast/slow suites, lint and format. Deliver using exact-head Test, Review, merge and Close receipts.

### Verification and risks

The six issue acceptance criteria remain the scope. Extend the five existing targeted test files and add focused helper tests if needed. Use real temporary Git worktrees to prove physical identity. Documentation-only Plan commits must pass; source/mixed Plan commits, foreign ownership and installed-guard edits must refuse. Read staged paths without index mutation and preserve arbitrary filenames with NUL separation.

Risks are parser divergence, alternate-index or command-path redirection, and inconsistent guard consumers. Shared parsing and end-to-end parity checks address these risks. No workflow exception, weakened ownership, lifecycle skipping or ai-peer-review changes are included. This is one cohesive M-sized defect, approximately three human hours before rubric convergence.

### Story quality review

All seven questions pass: the maintainer is the beneficiary; authorization is a concrete safeguard; observed defects establish need; false refusals and bypasses establish value; source and reproduction ground the claims; the solo defect has distinct scope; and the story is readable without external planning documents.
