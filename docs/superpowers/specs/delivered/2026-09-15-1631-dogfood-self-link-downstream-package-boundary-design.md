# #1631 Dogfood Self-Link and Downstream Package Boundary Design

## Context

AITM is developed and distributed from the same repository, but those two environments have different package layouts. A development checkout explicitly creates `node_modules/ai-task-manager -> ..` so hooks and skills in an isolated worktree resolve the worktree's own source. A downstream npm consumer instead receives the package at `node_modules/@kburson/ai-task-manager`.

The current implementation obscures that distinction in two ways:

- `package.json` publishes a `prepare` script that runs the dogfood-only self-link entrypoint. npm 12 therefore treats a tarball install as requesting an install script even though the entrypoint detects the consumer layout and performs no work.
- Generated Claude and Codex hooks, guards, and task-skill stubs use unscoped `node_modules/ai-task-manager` paths. The development self-link makes those paths work in this repository, but a normal scoped install does not provide that alias.

Source-oriented tests construct their expected commands from the same unscoped helpers, so they validate internal consistency rather than the installed consumer contract. Existing pack tests inspect file manifests or load selected modules, but do not install the generated tarball under npm 12's restrictive script policy and execute the generated provider surfaces.

## Decision

AITM will define separate, explicit contracts for downstream package resolution and dogfood worktree setup.

Downstream-generated files will resolve operational entrypoints through the real scoped package location, `node_modules/@kburson/ai-task-manager`. When the same generated helper is exercised from an AITM source checkout, it may fall back to the repository-relative tracked path. An unscoped package alias will not be part of the downstream contract.

Dogfood worktrees will continue to create and verify `node_modules/ai-task-manager -> ..`, but only through repository-owned development setup:

- `scripts/dev-env/setup-local-worktree.sh` installs the lockfile dependencies, runs `npm run link:self`, and verifies the link;
- `npm run link:self` remains the explicit repair command; and
- `scripts/dev-env/verify-local-worktree.mjs` remains the fail-loud environment check.

The published `prepare` lifecycle entry will be removed. A downstream tarball or registry install will therefore request no AITM install-time script approval. Removing `prepare` deliberately means that plain `npm ci` in an AITM worktree is no longer the complete bootstrap; the sanctioned setup script is the complete development command.

## Package Entrypoint Contract

`scripts/task-tracker/lib/guard-entrypoint.mjs` will own the generated package-path contract. Its consumer candidate order will be:

1. `node_modules/@kburson/ai-task-manager/<repo-relative-entrypoint>`; then
2. `<repo-relative-entrypoint>` when the command is running from an AITM source checkout.

The scoped candidate is first so an installed consumer always runs the installed package bytes. The repository-relative candidate preserves a node_modules-free source-worktree bootstrap and avoids making the unscoped dogfood link a generated downstream requirement.

Security behavior remains unchanged after resolution:

- guards fail closed when neither candidate resolves;
- lifecycle hooks fail open with a diagnostic when neither candidate resolves; and
- Grok's native bridge fails closed with its structured denial envelope.

The path change does not weaken ownership, activity, source-edit, bash, or provider-specific enforcement. It changes only how the already-selected handler file is located.

## Installer and Migration Behavior

`bin/cli.mjs` will route every managed provider entrypoint through the scoped package contract, including the currently bare Codex prompt-timestamp command and Grok bridge command. Claude and Codex task-skill stubs will name scoped canonical adapter, shared-skill, and script roots.

Re-running the installer must migrate managed legacy commands idempotently:

- exact AITM-managed unscoped hook and guard commands are removed;
- the corresponding scoped-first commands are installed once;
- unrelated user-authored hooks and settings are preserved byte-for-byte where the existing patchers promise preservation; and
- existing provider-selection behavior is unchanged.

Repository-tracked `.agents/skills/task/SKILL.md` and `.codex/hooks.json` remain dogfood artifacts. They may retain an explicit source-worktree bootstrap step, but downstream files produced by `npx @kburson/ai-task-manager install` must not inherit dogfood-only seeding or unscoped package assumptions. If the same generator cannot truthfully serve both shapes, the installer will use an explicit consumer variant rather than conditional behavior that depends on an unavailable downstream `.git` directory.

`bin/lib/claude-bash-allowlist.mjs` will authorize the scoped operational path. An unscoped compatibility entry may remain only where a current development command still requires it; downstream proof must not depend on it.

## Published File Boundary

The package continues to ship the operational `bin/`, `skill/`, hook, configuration, documentation, and task-tracker `scripts/` required by the installed CLI and generated provider integrations.

Development-only bootstrap entrypoints are candidates for exclusion, not automatic removals. Before excluding any file, the implementation must prove that:

1. no generated downstream hook, guard, skill, or CLI path references it;
2. no retained packed module imports it transitively; and
3. the installed-tarball regression passes without it.

If those conditions are not all established, the file remains packaged. Package-size cleanup is subordinate to runtime correctness.

The workflow-exception policy and preflight runtime accepted under #1628 are operational files. They must remain importable from the installed artifact.

## Installed-Tarball Verification

The primary regression test will create all disposable material under repository-local `.scratch/test/` and will exercise the real package boundary:

1. Run `npm pack --json --pack-destination <scratch-pack-dir>` against the repository.
2. Create a separate consumer package with a file dependency on the generated tarball and an empty npm 12 `allowScripts` policy.
3. Install without `--ignore-scripts`, capturing stdout and stderr.
4. Assert that AITM is not reported as a blocked install script and that the installed manifest contains no dogfood-only lifecycle request.
5. Assert that the package exists at `node_modules/@kburson/ai-task-manager` and that no unscoped alias is required.
6. Run representative installed `aitm` commands that do not require a live GitHub mutation.
7. Generate Claude and Codex hooks and task-skill files into the consumer, inspect their scoped paths, and execute representative lifecycle-hook and guard entrypoints from the consumer root.
8. Verify required operational files and the #1628 workflow-policy/preflight modules in the installed tree.
9. Remove the isolated scratch directory in `finally` while retaining command output in assertion messages on failure.

Assertions will identify AITM specifically rather than reject every install warning. npm output formatting and unrelated dependency policies can vary across npm 12 patch releases; the contract is that AITM requests no blocked lifecycle script.

The test will reuse one packed consumer fixture within its file to avoid repeated recursive installs. It remains an integration test because it invokes npm and executes the installed artifact rather than source modules.

## Existing Test Updates

Focused source-level tests will continue to provide fast diagnostics:

- entrypoint-resolution tests assert scoped-first ordering, repository-relative fallback, and unchanged fail-open/fail-closed behavior;
- installer tests assert generated Claude, Codex, and Grok paths, exact legacy-command migration, and idempotency;
- provider-parity tests distinguish consumer stubs from repository dogfood bootstrap content;
- package-manifest tests retain every operational runtime file;
- local-worktree tests prove the sanctioned setup invokes `npm run link:self` after dependency installation and verifies the link; and
- the packaged workflow-exception smoke test imports the accepted #1628 runtime from the installed package root.

Issue #1631's current verification command names `scripts/dev-env/verify-local-worktree.test.mjs`, but the canonical tracked test is `scripts/tests/integration/dev-env/verify-local-worktree.test.mjs`. The issue body will be corrected through `npx aitm issue-body` before Test; the implementation will not create a second test outside the canonical test tree merely to satisfy the stale path.

## Error Handling and Safety

- A missing scoped and repository-relative guard entrypoint remains a loud exit-2 denial.
- A missing non-security lifecycle hook remains a loud exit-0 skip.
- A generated consumer skill must name a readable scoped canonical skill before instructing an agent to continue.
- Installer migration matches only known managed command strings; ambiguous or user-authored commands are preserved.
- Tarball install failures report the complete captured npm output and installed path checks.
- Scratch cleanup is bounded to the test-created `.scratch/test/` directory.
- No test creates an unscoped alias in the consumer, because doing so would mask the defect.

## Alternatives Considered

### Resolve the package dynamically with Node package lookup

Generated commands could call `require.resolve` or `import.meta.resolve` for every entrypoint. This avoids spelling `node_modules/@kburson/ai-task-manager`, but adds quoting, ESM, package-export, and subprocess complexity to every hook invocation. The installation location is already deterministic for the supported npm layout, and the existing existence-pick bootstrap is simpler to audit. Rejected in favor of scoped-first candidates.

### Create an unscoped alias in downstream installs

A lifecycle script could create `node_modules/ai-task-manager` beside the scoped package. This preserves current generated strings but requires exactly the downstream install-time mutation and script approval that #1631 removes. It also invents a second package identity that npm does not own. Rejected.

### Retain `prepare` because it is a guarded no-op downstream

The script's runtime no-op does not prevent npm 12 from classifying it as a requested install action. Consumers still receive a blocked-script warning and must reason about an irrelevant lifecycle hook. Rejected.

### Remove the dogfood self-link entirely

Repository tooling still uses the self-link to guarantee that isolated worktrees execute their own candidate bytes and to prevent resolution back to another checkout. Removing it would expand the issue into worktree execution-context redesign. Rejected; explicit dogfood setup is preserved.

### Test only `npm pack --dry-run`

Manifest inspection cannot prove npm install-policy behavior, generated paths, module resolution, or installed CLI execution. Rejected; the real tarball must be installed and exercised.

## Verification and Acceptance

The change is acceptable only when all of the following are true at one committed SHA:

- the real tarball installs under the restrictive npm 12 policy without an AITM blocked-script warning;
- representative installed CLI commands run from the scoped package;
- generated Claude and Codex hooks, guards, and task skills resolve without an unscoped alias;
- the explicit development setup still creates and verifies `node_modules/ai-task-manager -> ..`;
- the installed-artifact test detects lifecycle, missing-file, and unresolved-entrypoint regressions;
- the accepted #1628 workflow-exception and preflight runtime imports from the installed artifact;
- every issue-specific verification command passes and is stamped individually;
- lint, formatting, fast tests, and slow tests pass through governed exact-SHA Test; and
- review and delivery use the normal AITM authority and receipt gates.

## Dependencies and Scope Boundary

Issue #1628 is Done and its accepted implementation is already in trunk, so #1631 has no unfinished dependency. No sibling issue is required.

The implementation will not redesign npm policy, dependency installation generally, workflow exceptions, worktree execution identity, or provider hook semantics. Follow-up defects discovered outside this package boundary require their own governed issue before work begins.
