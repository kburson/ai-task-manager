# Evidence v2 isolated rehearsal harness

Epic #1495, child #1496. Execute serially under the approved epic contract at `d14bda2d4c9ce5cc162c9609c33c96bd8cac319a`. Full-auto authority covers normal lifecycle work; the frozen issue chain and production cutover remain excluded.

## Implementation sequence

1. Add a failing integration assertion showing that the current runtime ignores a supplied recorded execution context. The test runs in a separate Git root with a minimal environment; refusal must occur before a production path can be selected.
2. Implement immutable execution-context validation and optional runtime/dispatcher plumbing. Validate canonical paths, synthetic repository identity, independent Git/common/object storage, local remotes and absent executable Git configuration. Preserve the ordinary context when no recorded input exists.
3. Build the reusable manifest-owned sandbox with an independent source repository, bare remote, synthetic home, empty hooks directory, provider journal and fresh-process command runner. Apply filesystem permissions and fail-closed process/network transport guards before importing the dispatcher. Forward real public commands through ordinary preflight and verbs. Unsupported operations refuse.
4. Add persistent provider observations and one-shot fault boundaries. Use production-shaped issue, comment, board and PR snapshots; exercise actual production codecs and body writers. A fresh process must observe effects that preceded a lost response. Never infer success from a fixture flag.
5. Generate synthetic legacy terminal records through the existing codec, including completed-then-reopened and interrupted-prefix shapes. Use real Git amend/rebase/squash operations for same-tree and changed-tree cases, and hash protected control-fixture observations before and after. No original worktree capture or mutation occurs here.
6. Run the three focused integration suites, develop verification, and the normal isolated Test and review/delivery path. Confirm Node 22 compatibility. Later children extend this same context/provider boundary and supply their own public command scenarios.

## Files and verification

Production foundation: `scripts/task-tracker/lib/evidence-v2/execution-context.mjs`, with small additive changes to `runtime.mjs` and `task-tracker.mjs`. Helpers: `scripts/tests/helpers/evidence-v2/` (split transport, Git and process concerns to respect the repository line cap). Fixture documentation: `scripts/tests/fixtures/evidence-v2/README.md`.

Run the issue's `isolation.test.mjs`, `provider-contract.test.mjs` and `legacy-shapes.test.mjs` commands as each capability is introduced. Their assertions cover refusal before effects, cold-process persistence, real payload decoding, actual Git object independence, and observed protection. Full fast/slow, lint and formatting remain Test-stage gates. No checkbox is evidence until the relevant command succeeds.

The canonical layout audit requires these integration suites under `scripts/tests/integration/task-tracker/lib/evidence-v2/`, mirroring the actual production subsystem. This corrects the original epic plan's proposed test paths without changing scope or verifier coverage. The live child verification commands use the canonical paths.
