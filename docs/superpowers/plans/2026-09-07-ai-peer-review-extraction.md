# AI Peer Review Extraction Implementation Plan

<!-- cspell:words Gitleaks objectname prefilter reflog Zenodo -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract AITM's co-review engine into a public `ai-peer-review` package
that ships a secure manual/resume-only `0.1.x` workflow before adding token-free
automatic transport in `0.2.x`.

**Architecture:** Build an event-sourced standalone Node.js package whose ignored
workspace is protocol authority and whose tracked response files are committed
only by the author through exact-path Git transactions. Keep identity,
Human Authority, transport, and host integration behind explicit adapters so the
core never imports AITM. Release Phase 1 independently, migrate AITM through the
public package boundary, and add MCP/resident transport only in Phase 2.

**Tech Stack:** Node.js 22+ ESM, Node's built-in test runner, Git CLI,
JSON/Markdown schemas and templates, Ed25519/WebCrypto-compatible detached
signatures, npm trusted publishing, GitHub Actions, and the official MCP SDK only
if the Phase 2 dependency gate approves it.

**Ratified specification:**
`docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md` at
`68de80b45b23c90874bac0fcd87cfa0c1980edd4`.

## Global Constraints

- Use source AITM commit `4b3bcd43cba141a611da4a2b861433b915462806`
  for history extraction; record and verify it in every release manifest.
- The standalone repository, npm package, and zero-install package name are
  `ai-peer-review`; the installed binary and skill are `peer-review`.
- Phase 1 targets Node.js 22 or later and has zero third-party runtime
  dependencies.
- No module in standalone `src/` may import AITM, inspect `.ai-task-manager`,
  invoke AITM commands, or require a GitHub issue.
- Phase 1 must ship with `manual` and adapter-proven `resume-only` transport; it
  must not depend on MCP, resident liveness, or `automatic-required` mode.
- Phase 2 must preserve Phase 1 schemas and its manual recovery route.
- Scratch authority lives under `.scratch/peer-review/<review-id>/`; setup and
  start must prove it ignored with `git check-ignore --quiet --no-index`.
- Tracked output defaults to
  `docs/peer-reviews/<kind>/<date>-<name>-<review-id>/`; paths must remain inside
  the repository and existing bytes are never overwritten.
- `start` always receives explicit `spec|plan` artifact kind and starts with a
  ten-reviewer-response budget unless configured otherwise.
- Exactly two distinct session fingerprints participate. Provider and model are
  provenance, not eligibility gates; raw session IDs remain scratch-only.
- The reviewer may write only its pending response through the protocol and may
  never edit the artifact, stage, commit, amend, switch branches, or push.
- The author alone creates exact-path commits. Normal revision commits contain
  reviewer response, artifact, and author response; final acceptance commits
  contain acceptance response and manifest.
- Human Authority is prevention-grade by default. Same-user software keys are
  detection-grade (`cryptographic-local`), and `unverified-test` exists only in
  no-commit mode.
- Effective attestation strength is the weaker of signer isolation and verifier
  binding. Never label mutable local verifier configuration prevention-grade.
- Protected actions are `pin-verifier`, `continue`, `supplement`,
  `accept-over-objections`, and `replace-participant`; ordinary start,
  same-fingerprint reclaim, and abandonment are grant-free under their stated
  guards.
- Every mutation is lock-protected, event-first, projection-rebuilding,
  atomic-write based, idempotent for identical retries, and fail-closed for
  conflicts.
- No command pushes. Publication, relicensing, package release, and hosted
  integration remain explicit human gates.
- Tasks are executed in numeric order. `src/cli/run.mjs` is the serialized
  dispatch composition root; tasks that extend it must not execute in parallel.
- Use `APR_*` stable errors with one exact recovery command and JSON output that
  never mixes prose or ANSI decoration.
- Tests use temporary Git repositories and fake provider/authority/transport
  adapters by default. Live-provider tests are opt-in.

## Repository and File Map

All paths in Tasks 1–14 and 16–17 are relative to the new `ai-peer-review`
repository. Paths explicitly prefixed `ai-task-manager/` in Tasks 15 and 18 are
relative to the parent directory containing both repositories.

```text
ai-peer-review/
  bin/peer-review.mjs                 # executable CLI shim
  src/errors.mjs                      # stable APR error contract
  src/cli/{parse,run,help-data}.mjs   # closed command grammar and dispatch
  src/config/{load,setup,guards}.mjs  # host-neutral configuration edits
  src/git/{repository,transaction}.mjs
  src/identity/{registry,codex,claude,grok,generic}.mjs
  src/authority/{canonicalize,challenge,verify}.mjs
  src/protocol/{events,reducer,store,service}.mjs
  src/collateral/{paths,responses}.mjs
  src/templates/index.mjs             # hydrates top-level package templates
  src/manifest/render.mjs
  src/transport/{registry,manual,resume}.mjs
  src/doctor.mjs
  src/public-api.mjs
  src/mcp/{server,wait}.mjs            # Phase 2 only
  src/transport/{live-wait,native-push,resident}.mjs # Phase 2 only
  schemas/*.json
  templates/*.md
  skills/peer-review/SKILL.md
  scripts/{verify-extraction,run-secret-scan,verify-release}.mjs
  provenance/{extraction-manifest,relicensing-declaration,release-manifest}.json
  test/{unit,integration,golden,packaging,smoke,mcp,helpers}/
  .github/workflows/{ci,release}.yml
  .gitignore .npmrc .prettierignore .prettierrc.json
  .markdownlint-cli2.jsonc cspell.json eslint.config.mjs
  README.md CONTRIBUTING.md LICENSE NOTICE package.json
```

Phase 1 ends after Task 14. Task 15 consumes that published release from AITM.
Tasks 16–17 are the separately releasable Phase 2 milestone. Task 18 upgrades
AITM only after the Phase 2 package is published and verified.

---

### Task 1: Extract History and Establish the License Boundary

**Files:**

- Create: `scripts/verify-extraction.mjs`
- Create: `scripts/run-secret-scan.mjs`
- Create: `.gitleaks.toml`
- Create: `provenance/extraction-manifest.json`
- Create: `provenance/relicensing-declaration.json`
- Create: `LICENSE`
- Create: `NOTICE`
- Create: `CONTRIBUTING.md`
- Create: `README.md`
- Create: `docs/spdx-policy.md`
- Create: `docs/design/2026-09-07-ai-peer-review-extraction-design.md`
- Preserve through filtering: `scripts/review/**`
- Preserve through filtering: `scripts/providers/**`
- Preserve through filtering: `scripts/tests/**/*co-review*`
- Preserve through filtering: `docs/superpowers/specs/*co-review*`
- Preserve through filtering: `docs/superpowers/plans/*co-review*`
- Preserve through filtering: AITM root `LICENSE`, `NOTICE`, and
  `LICENSE-COMMERCIAL` in historical commits

**Interfaces:**

- Consumes: a fresh clone of AITM and immutable source commit
  `4b3bcd43cba141a611da4a2b861433b915462806`.
- Produces:
  `verifyExtraction({ root, manifest, runGit, requireLegacyRemoved }) -> Promise<Result>`
  and a filtered `ai-peer-review` repository whose extraction manifest records
  source SHA, the post-filter source-history boundary, exact retained path
  rules, contributor audit, secret-scan result, and relicensing gate.

- [ ] **Step 1: Create and verify the fresh extraction clone**

```bash
git clone --no-local --no-tags --single-branch --branch trunk \
  git@github.com:kburson/ai-task-manager.git ai-peer-review
git -C ai-peer-review checkout --detach 4b3bcd43cba141a611da4a2b861433b915462806
git -C ai-peer-review remote remove origin
git -C ai-peer-review for-each-ref --format='delete %(refname)' \
  refs/heads | git -C ai-peer-review update-ref --stdin
git -C ai-peer-review update-ref refs/heads/extraction-source \
  4b3bcd43cba141a611da4a2b861433b915462806
git -C ai-peer-review symbolic-ref HEAD refs/heads/extraction-source
git -C ai-peer-review reset --hard 4b3bcd43cba141a611da4a2b861433b915462806
git -C ai-peer-review reflog expire --expire=now --all
git -C ai-peer-review gc --prune=now
test "$(git -C ai-peer-review for-each-ref --format='%(refname) %(objectname)')" = \
  "refs/heads/extraction-source 4b3bcd43cba141a611da4a2b861433b915462806"
```

Expected: the final command exits 0 and the pre-filter ref inventory is exactly
one branch at the ratified source commit. Do not run filtering in an existing
AITM checkout or worktree.

- [ ] **Step 2: Record the pre-filter contributor and path inventories**

```bash
APR_AUDIT_DIR="$(mktemp -d)"
git -C ai-peer-review log --format='%an <%ae>' -- \
  scripts/review scripts/providers \
  ':(glob)scripts/tests/**/*co-review*' \
  ':(glob)docs/superpowers/specs/*co-review*' \
  ':(glob)docs/superpowers/plans/*co-review*' \
  LICENSE NOTICE LICENSE-COMMERCIAL | LC_ALL=C sort -fu \
  > "$APR_AUDIT_DIR/contributors.txt"
git -C ai-peer-review ls-tree -r --name-only HEAD | \
  rg '^(scripts/review/|scripts/providers/|scripts/tests/.+co-review|docs/superpowers/(specs|plans)/.+co-review|LICENSE$|NOTICE$|LICENSE-COMMERCIAL$)' \
  > "$APR_AUDIT_DIR/retained-paths.txt"
```

Expected: at source commit `4b3bcd43`, the widened command produces exactly the
two lines below. A repository-wide third identity does not touch this retained
path set. Any identity outside this recorded holder set stops this task for
license review.

```text
kendrick burson <kpburson@pm.me>
Kendrick Burson <spam.kpb@gmail.com>
```

Record the exact command, normalized contributor list, retained-path inventory,
and SHA-256 digest of each inventory in the extraction manifest; neither file is
throwaway evidence. `EXPECTED_HOLDER_IDENTITIES` is a source constant defined in
`verify-extraction.mjs`, independently of the manifest being checked. Changing
that constant is a relicensing decision requiring human review, never a test fix
derived from observed output.

- [ ] **Step 3: Filter only the ratified source boundary**

```bash
git -C ai-peer-review filter-repo --force \
  --path scripts/review/ \
  --path scripts/providers/ \
  --path-glob 'scripts/tests/**/*co-review*' \
  --path-glob 'docs/superpowers/specs/*co-review*' \
  --path-glob 'docs/superpowers/plans/*co-review*' \
  --path LICENSE \
  --path NOTICE \
  --path LICENSE-COMMERCIAL
```

Expected: every retained commit contains only selected review/provider/test and
historical licensing paths. If `git filter-repo` is unavailable, install it
outside the repository and rerun this exact command; do not substitute a manual
history rewrite. Read `.git/filter-repo/commit-map`, resolve the rewritten commit
for source `4b3bcd43cba141a611da4a2b861433b915462806`, and record it as
`filtered_history_tip`. Assert `refs/heads/extraction-source` is the only ref and
points to that rewritten commit; this is the source-history boundary and parent
of the first standalone bootstrap commit.

- [ ] **Step 4: Add an executable extraction verifier**

Implement `scripts/verify-extraction.mjs` with this exported contract:

```js
export async function verifyExtraction({ root, manifest, runGit, requireLegacyRemoved = false }) {
  const paths = await runGit(root, [
    'log',
    manifest.filtered_history_tip,
    '--name-only',
    '--format=',
  ]);
  const foreign = [...new Set(paths.split('\n').filter(Boolean))].filter(
    (file) => !matchesRetainedRule(file, manifest.retained_path_rules)
  );
  if (foreign.length) throw new Error(`foreign retained paths: ${foreign.join(', ')}`);
  const currentPaths = await runGit(root, ['ls-tree', '-r', '--name-only', 'HEAD']);
  assertStandaloneLayout(currentPaths, {
    standaloneRules: manifest.standalone_path_rules,
    legacyRules: manifest.legacy_retained_path_rules,
    requireLegacyRemoved,
  });
  assert.equal(manifest.prefilter_ref_inventory.length, 1);
  assert.equal(manifest.prefilter_ref_inventory[0].object, manifest.source_commit);
  assert.deepEqual(manifest.contributor_audit.normalized_result, EXPECTED_HOLDER_IDENTITIES);
  assert.equal(manifest.secret_scan.tool, 'gitleaks');
  assert.equal(manifest.secret_scan.result, 'pass');
  assert.match(manifest.secret_scan.tool_version, /^\d+\.\d+\.\d+/);
  assert.match(manifest.relicensing_declaration_digest, SHA256_RE);
  return { sourceCommit: manifest.source_commit, filteredTip: manifest.filtered_history_tip };
}
```

`matchesRetainedRule` supports only the exact paths, directory prefixes, and the
three explicit `*co-review*` glob rules stored in the manifest; it must not widen
those globs into whole-directory prefixes. `assertStandaloneLayout` validates
current `HEAD` against a narrow standalone layout allowlist. Before parity
removal it permits only the separately declared retained legacy paths; with
`requireLegacyRemoved: true` it refuses any of them, proving the publishable tree
contains only standalone layout. Add
`test/unit/verify-extraction.test.mjs` with fixtures proving a leaked non-co-review
file, later source ref, foreign standalone path, retained legacy path under the
release gate, failed/missing scan, empty or changed contributor audit, null
declaration digest, and malformed boundary fail closed while an exact filtered
history passes.

- [ ] **Step 5: Write and validate the provenance records**

Create `provenance/extraction-manifest.json` with this stable shape:

```json
{
  "schema": "ai-peer-review.extraction/v1",
  "source_repository": "https://github.com/kburson/ai-task-manager",
  "source_commit": "4b3bcd43cba141a611da4a2b861433b915462806",
  "filtered_history_tip": null,
  "prefilter_ref_inventory": [
    {
      "ref": "refs/heads/extraction-source",
      "object": "4b3bcd43cba141a611da4a2b861433b915462806"
    }
  ],
  "retained_path_rules": {
    "prefixes": ["scripts/review", "scripts/providers"],
    "globs": [
      "scripts/tests/**/*co-review*",
      "docs/superpowers/specs/*co-review*",
      "docs/superpowers/plans/*co-review*"
    ],
    "exact": ["LICENSE", "NOTICE", "LICENSE-COMMERCIAL"]
  },
  "standalone_path_rules": {
    "prefixes": [
      ".github/workflows",
      "bin",
      "docs/design",
      "provenance",
      "schemas",
      "skills/peer-review",
      "src",
      "templates",
      "test"
    ],
    "exact": [
      ".gitignore",
      ".gitleaks.toml",
      ".markdownlint-cli2.jsonc",
      ".npmrc",
      ".prettierignore",
      ".prettierrc.json",
      "CONTRIBUTING.md",
      "LICENSE",
      "NOTICE",
      "README.md",
      "cspell.json",
      "docs/dependency-audit-mcp.md",
      "docs/spdx-policy.md",
      "eslint.config.mjs",
      "package-lock.json",
      "package.json",
      "scripts/run-secret-scan.mjs",
      "scripts/verify-extraction.mjs",
      "scripts/verify-release.mjs"
    ]
  },
  "legacy_retained_path_rules": {
    "prefixes": ["scripts/review", "scripts/providers"],
    "globs": [
      "scripts/tests/**/*co-review*",
      "docs/superpowers/specs/*co-review*",
      "docs/superpowers/plans/*co-review*"
    ]
  },
  "retained_path_inventory": { "paths": [], "digest": null },
  "contributor_audit": {
    "command_argv": [
      "git",
      "log",
      "--format=%an <%ae>",
      "--",
      "scripts/review",
      "scripts/providers",
      ":(glob)scripts/tests/**/*co-review*",
      ":(glob)docs/superpowers/specs/*co-review*",
      ":(glob)docs/superpowers/plans/*co-review*",
      "LICENSE",
      "NOTICE",
      "LICENSE-COMMERCIAL"
    ],
    "normalizer": "LC_ALL=C sort -fu",
    "normalized_result": [
      "kendrick burson <kpburson@pm.me>",
      "Kendrick Burson <spam.kpb@gmail.com>"
    ],
    "digest": null
  },
  "secret_scan": {
    "tool": "gitleaks",
    "tool_version": null,
    "config_digest": null,
    "scanned_ref": null,
    "report_digest": null,
    "result": "pending"
  },
  "relicensing_declaration_digest": null
}
```

The Task 1 generator must replace every pending `null` and empty inventory with
observed data before the first commit; the verifier rejects any remaining
pending value. The closed standalone rules cover only the file map in this plan
plus `docs/`, `.github/`, and root project metadata.

Create `provenance/relicensing-declaration.json` with fields for copyright holder,
covered source commit, Apache-2.0 grant, proprietary-fork consequence acceptance,
signature type, signer fingerprint, signature, and signing time. Leave signature
fields `null` until the copyright holder supplies them; the verifier must reject
publication while any is null.

Copy the ratified design bytes from AITM commit
`68de80b45b23c90874bac0fcd87cfa0c1980edd4` to
`docs/design/2026-09-07-ai-peer-review-extraction-design.md` and record that
source repository, commit, path, and SHA-256 digest in the extraction manifest.

- [ ] **Step 6: Scan the complete filtered history and close provenance fields**

Use Gitleaks in Git-history mode with a repository-owned `.gitleaks.toml`. The
wrapper records `gitleaks version`, the configuration digest, scanned ref, and
redacted JSON report digest, and writes `result: pass` only when the command exits
zero with no findings. It never stores discovered secret bytes.

```bash
node scripts/run-secret-scan.mjs --ref "$(git rev-parse refs/heads/extraction-source)"
node --test test/unit/verify-extraction.test.mjs
```

Expected: both commands exit 0. Any credential, private data, generated runtime
state, unrelated AITM content, missing scanner, empty contributor audit, or scan
result other than `pass` blocks the bootstrap. The full extraction verifier is
intentionally deferred until Step 7 supplies the mandatory relicensing digest
and Step 8 commits the standalone tree that its `HEAD` check observes; there is
no flag that weakens its fail-closed contract.

- [ ] **Step 7: Install the new license only after the human gate**

After the copyright holder provides a valid signed declaration, replace the
filtered root licensing files with the complete Apache-2.0 `LICENSE`, accurate
`NOTICE`, and Apache contribution statement in `CONTRIBUTING.md`. Add SPDX
headers or `docs/spdx-policy.md`, and remove `LICENSE-COMMERCIAL` from publishable
`HEAD`. `NOTICE` and the initial `README.md` must name the recorded
`filtered_history_tip` boundary and explain that its ancestors remain under
AITM's historical AGPL/commercial terms while the first standalone bootstrap
commit and descendants are Apache-2.0. Record the declaration digest in the
extraction manifest.

```bash
node --test test/unit/verify-extraction.test.mjs
git diff --check
```

Expected: all commands exit 0. Without the signed declaration, stop before this
step and do not create a public repository or npm release.

- [ ] **Step 8: Commit the auditable extraction boundary**

```bash
git add .gitleaks.toml LICENSE NOTICE README.md CONTRIBUTING.md \
  docs/spdx-policy.md docs/design/2026-09-07-ai-peer-review-extraction-design.md \
  provenance/extraction-manifest.json provenance/relicensing-declaration.json \
  scripts/verify-extraction.mjs scripts/run-secret-scan.mjs \
  test/unit/verify-extraction.test.mjs
git commit -m "chore: establish extracted repository provenance"
node scripts/verify-extraction.mjs
```

Record this bootstrap commit in `provenance/release-manifest.json` during Task 14
and verify its first parent is `filtered_history_tip`; do not attempt to embed a
commit's own SHA in the commit that creates it.

Expected: the commit succeeds, its first parent is `filtered_history_tip`, and
the post-commit extraction verifier exits 0 while permitting only the explicitly
declared retained legacy paths pending Task 14's parity removal.

### Task 2: Create the Standalone Package and Stable Error Surface

**Files:**

- Create: `package.json`
- Create: `package-lock.json`
- Create: `bin/peer-review.mjs`
- Create: `src/public-api.mjs`
- Create: `src/errors.mjs`
- Create: `src/cli/parse.mjs`
- Create: `src/cli/run.mjs`
- Create: `eslint.config.mjs`
- Create: `cspell.json`
- Create: `.markdownlint-cli2.jsonc`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `test/unit/errors.test.mjs`
- Create: `test/unit/cli-parse.test.mjs`

**Interfaces:**

- Produces: `run(argv, io) -> Promise<number>`, `AprError`, `COMMAND_FLAGS`,
  `parseCommand(argv) -> { command, args, options }`, and a read-only public API
  placeholder that later exports `statusReview` and `explainError`.
- Consumes: no runtime package dependency.

- [ ] **Step 1: Write RED tests for package identity and errors**

```js
test('AprError has a stable machine contract', () => {
  const error = new AprError('APR_ARTIFACT_DRIFT', 'artifact differs from HEAD', {
    recovery: 'git diff -- docs/spec.md',
    details: { path: 'docs/spec.md' },
  });
  assert.deepEqual(error.toJSON(), {
    schema: 'ai-peer-review.error/v1',
    code: 'APR_ARTIFACT_DRIFT',
    message: 'artifact differs from HEAD',
    recovery: 'git diff -- docs/spec.md',
    details: { path: 'docs/spec.md' },
  });
});
```

Assert `package.json` has name `ai-peer-review`, Node `>=22`, bin key
`peer-review`, ESM type, empty `dependencies`, and a `files` allowlist containing
only runtime/docs/schema/template/skill/license content.

Create explicit tool configuration owned by this task: ESLint 9 flat config in
`eslint.config.mjs`, spelling configuration in `cspell.json`, Markdown rules and
ignores in `.markdownlint-cli2.jsonc`, and Prettier rules/ignores in
`.prettierrc.json` plus `.prettierignore`. `.npmrc` enables public-package
provenance without credentials. The standalone repository's tracked `.gitignore`
ignores `node_modules/`, coverage/tarball outputs, and
`.scratch/peer-review/`. This repository-development policy does not change the
installed package rule: host `setup` still uses the Git-reported `info/exclude`
path and never edits a host's tracked `.gitignore`.

Define these non-overlapping scripts using Node's test runner and
development-only format/lint/spell tools:

```json
{
  "test": "npm run test:unit && npm run test:golden",
  "test:unit": "node --test test/unit",
  "test:golden": "node --test test/golden",
  "test:integration": "node --test test/integration",
  "test:packaging": "node --test test/packaging",
  "test:smoke": "node --test test/smoke",
  "test:mcp": "node --test test/mcp",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "lint": "eslint . && markdownlint-cli2 \"**/*.md\" && cspell --no-progress \"**/*.{md,mjs,js,json}\""
}
```

Phase 1 never runs `test:mcp`; Phase 2 adds that named gate. Generate
`package-lock.json` with `npm install`; verify that every non-Node package is
under `devDependencies`, not `dependencies`.
Start at version `0.1.0` and use the repository-validated development versions
`cspell@8.19.4`, `eslint@9.39.4`, `markdownlint-cli2@0.23.0`, and
`prettier@3.8.3`.

The closed parser catalog contains exactly:

```text
setup, doctor, start, request-grant, join, status, resume, submit,
supplement, continue, finalize, recover, abandon, help, explain
```

Define one frozen `COMMAND_FLAGS` object beside that command catalog. Boolean
flags reject values, singleton value flags reject duplicates, and only `--agent`
may repeat:

```js
export const COMMAND_FLAGS = Object.freeze({
  setup: ['--agent', '--scope', '--dry-run', '--remove', '--confirm-scratch-exclude'],
  doctor: ['--mode', '--json'],
  start: [
    '--artifact-kind',
    '--reviews-root',
    '--review-path-template',
    '--issue',
    '--max-turns',
    '--claim-ttl',
    '--transport-mode',
    '--bootstrap-grant',
    '--no-commit',
    '--test-human-authority',
  ],
  'request-grant': [
    '--action',
    '--verifier-fingerprint',
    '--assurance-grade',
    '--authority-policy',
    '--artifact-path',
    '--artifact-kind',
    '--reviews-root',
    '--review-path-template',
    '--issue',
    '--max-turns',
    '--commit-mode',
    '--additional-turns',
    '--resulting-effective-maximum',
    '--resume-role',
    '--focus-path',
    '--focus-digest',
    '--content-digest',
    '--target-role',
    '--target-turn',
    '--artifact-blob',
    '--artifact-digest',
    '--final-round',
    '--reviewer-response-path',
    '--reviewer-response-digest',
    '--unresolved-finding-id',
    '--human-rationale-digest',
    '--role',
    '--outgoing-claim-id',
    '--outgoing-session-fingerprint',
    '--incoming-session-fingerprint',
  ],
  join: [],
  status: ['--json', '--next'],
  resume: [],
  submit: ['--decision', '--no-artifact-change', '--reason'],
  supplement: ['--for', '--grant'],
  continue: ['--additional-turns', '--focus', '--grant'],
  finalize: ['--good-enough', '--grant'],
  recover: ['--reclaim', '--replace-participant', '--grant'],
  abandon: ['--reason'],
  help: ['--all', '--json'],
  explain: ['--json'],
});
```

The parser also owns a frozen positional grammar and per-command constraints.
`--unresolved-finding-id` and `--agent` are repeatable; all other flags are
singletons. `request-grant` accepts only the flags corresponding to the selected
action's `GRANT_PARAMETER_FIELDS`, and converts CLI kebab-case names to the
canonical snake-case fields. `--issue`, turn counts, and TTL are positive
integers. `--claim-ttl` is measured in whole hours, defaults to `8`, and is
converted once to internal `claimTtlMs`; retain the ratified flag name rather
than adding a unit-renamed alias. `--no-artifact-change` requires a non-empty
`--reason`; `--reason` without it is rejected. Phase 1 rejects
`automatic-required` while retaining the catalog entry for Phase 2 compatibility.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
node --test test/unit/errors.test.mjs test/unit/cli-parse.test.mjs
```

Expected: FAIL because the standalone package surface does not exist.

- [ ] **Step 3: Implement the stable error type and closed parser**

```js
export class AprError extends Error {
  constructor(code, message, { recovery, details = {}, exitCode = 1 } = {}) {
    super(message);
    if (!/^APR_[A-Z0-9_]+$/.test(code) || !recovery) throw new TypeError('invalid APR error');
    this.name = 'AprError';
    this.code = code;
    this.recovery = recovery;
    this.details = Object.freeze({ ...details });
    this.exitCode = exitCode;
  }
  toJSON() {
    return {
      schema: 'ai-peer-review.error/v1',
      code: this.code,
      message: this.message,
      recovery: this.recovery,
      details: this.details,
    };
  }
}
```

Implement `parseCommand` from the frozen command/flag catalog. Reject unknown
commands, flags, duplicate singleton flags, non-positive integer budgets, nested
`--no-commit`, and `--test-human-authority` without `--no-commit` as
`APR_USAGE`. Parse values without evaluating shell text.

- [ ] **Step 4: Wire the executable without adding business logic**

```js
#!/usr/bin/env node
import { run } from '../src/cli/run.mjs';
process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
});
```

Create `src/cli/run.mjs` with dependency-injected `io`, JSON-safe error
rendering, exit-code propagation, and an `APR_NOT_IMPLEMENTED` result for parsed
commands not yet connected. Never call `process.exit()` inside library code.

- [ ] **Step 5: Run GREEN tests and commit**

```bash
node --test test/unit/errors.test.mjs test/unit/cli-parse.test.mjs
node bin/peer-review.mjs --help
git add package.json package-lock.json .gitignore .npmrc .prettierignore \
  .prettierrc.json .markdownlint-cli2.jsonc cspell.json eslint.config.mjs \
  bin/peer-review.mjs src/errors.mjs src/public-api.mjs src/cli/parse.mjs \
  src/cli/run.mjs \
  test/unit/errors.test.mjs test/unit/cli-parse.test.mjs
git commit -m "feat: establish standalone CLI contract"
```

Expected: focused tests pass; help exits 0; `npm ls --omit=dev --json` reports no
runtime dependencies.

### Task 3: Implement Repository, Path, and Atomic-Write Boundaries

**Files:**

- Create: `src/git/repository.mjs`
- Create: `src/collateral/paths.mjs`
- Create: `src/protocol/store.mjs`
- Create: `test/helpers/repository-fixture.mjs`
- Create: `test/unit/repository.test.mjs`
- Create: `test/unit/paths.test.mjs`
- Create: `test/unit/store.test.mjs`

**Interfaces:**

- Produces: `createGitRepository({ execFileSync })`,
  `resolveContainedPath(root, candidate, label)`,
  `resolveReviewPaths(config)`, `withReviewLock(workspace, operation)`,
  `atomicWrite(file, bytes)`, and `appendEvent(file, event)`.
- Consumes: only Node built-ins and literal argument arrays passed to Git.

- [ ] **Step 1: Write RED containment and Git-observation tests**

Create a temporary repository with a tracked `docs/artifact.md`, unrelated
staged and unstaged files, a linked worktree, symlink escapes, an ignored
`.scratch/peer-review/probe`, and a non-ignored sibling. Assert canonical
repository/worktree/common-dir discovery, tracked-clean artifact observation,
POSIX-relative output paths, and refusal of traversal, symlink escape, repository
root itself, untracked artifacts, and non-ignored scratch.

```js
assert.deepEqual(repository.artifactState(root, 'docs/artifact.md'), {
  path: 'docs/artifact.md',
  head: fixture.head,
  blob: fixture.artifactBlob,
  worktreeDigest: fixture.artifactDigest,
  clean: true,
});
assert.throws(
  () => resolveContainedPath(root, 'docs/outside-link/file.md', 'response'),
  (error) => error.code === 'APR_PATH_OUTSIDE_REPOSITORY'
);
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
node --test test/unit/repository.test.mjs test/unit/paths.test.mjs test/unit/store.test.mjs
```

Expected: FAIL on missing repository, path, and store modules.

- [ ] **Step 3: Port and decouple the repository boundary**

Port the useful Git observations from AITM
`scripts/review/lib/repository-boundary.mjs`, replacing every AITM import. Expose
only literal-argv methods: `root`, `commonDir`, `gitPath`, `status`,
`artifactState`, `indexEntry`, `workingBytes`, `commitTree`, `changedPaths`, and
`checkIgnored`. Convert subprocess failures to specific `APR_*` errors and never
invoke a shell.

- [ ] **Step 4: Implement physical containment and deterministic output paths**

```js
export function resolveContainedPath(root, candidate, label) {
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw aprPathError(label, candidate);
  }
  const physicalParent = realpathSync(nearestExistingParent(absolute));
  if (!isInside(realpathSync(root), physicalParent)) throw aprPathError(label, candidate);
  return { absolute, relative: relative.split(path.sep).join('/') };
}
```

`resolveReviewPaths` must support exactly `<issue>`, `<kind>`, `<name>`, `<date>`,
and `<review-id>`, require a positive issue when referenced, use short filenames
inside review-scoped directories, and add
`<date>-<name>-<review-id>-` in shared destinations.

- [ ] **Step 5: Implement atomic storage and locking**

Use sibling temporary files opened with exclusive creation, `fsync`, atomic
rename, and parent-directory sync where supported. Lock ownership contains a
random token, PID as diagnostic only, and acquisition time. `appendEvent` writes
exactly one newline-terminated canonical JSON record while holding the review
lock. Never delete a lock owned by a different token.

- [ ] **Step 6: Run GREEN tests and commit**

```bash
node --test test/unit/repository.test.mjs test/unit/paths.test.mjs test/unit/store.test.mjs
git add src/git/repository.mjs src/collateral/paths.mjs src/protocol/store.mjs \
  test/helpers/repository-fixture.mjs test/unit/repository.test.mjs \
  test/unit/paths.test.mjs test/unit/store.test.mjs
git commit -m "feat: add repository and storage boundaries"
```

### Task 4: Define Event Authority, Projections, and Lifecycle

**Files:**

- Create: `schemas/event-v1.json`
- Create: `schemas/protocol-v1.json`
- Create: `schemas/participants-v1.json`
- Create: `src/protocol/events.mjs`
- Create: `src/protocol/reducer.mjs`
- Create: `src/protocol/service.mjs`
- Create: `test/helpers/review-fixture.mjs`
- Create: `test/unit/events.test.mjs`
- Create: `test/unit/reducer.test.mjs`
- Create: `test/integration/recovery.test.mjs`

**Interfaces:**

- Produces: `validateEvent(value)`, `reduceEvents(events)`,
  `readReview(workspace)`, and
  `mutateReview(workspace, expected, createEvent) -> ReviewState`.
- Consumes: Task 3 atomic store and repository boundary.

- [ ] **Step 1: Write the lifecycle RED matrix**

Table-drive every allowed edge and assert all other `(state, event)` pairs throw
`APR_INVALID_TRANSITION`. Include `awaiting-reviewer`, `reviewer-turn`,
`author-revision`, `acceptance-pending`, `author-finalization`, `accepted`,
`intervention-required`, `accepted-over-objections`, `abandoned`, and both
no-commit terminal variants.

```js
const RESTORE_INTERRUPTED_ROLE = Symbol('restore-interrupted-role');
const allowed = [
  [null, 'review-created', 'awaiting-reviewer'],
  ['awaiting-reviewer', 'reviewer-joined', 'reviewer-turn'],
  ['reviewer-turn', 'reviewer-revisions-requested', 'author-revision'],
  ['reviewer-turn', 'reviewer-accepted', 'acceptance-pending'],
  ['author-revision', 'author-revision-committed', 'reviewer-turn'],
  ['author-revision', 'author-closing-round-committed', 'intervention-required'],
  ['acceptance-pending', 'finalization-started', 'author-finalization'],
  ['author-finalization', 'acceptance-committed', 'accepted'],
  ['author-finalization', 'acceptance-sealed-no-commit', 'accepted-uncommitted'],
  ['intervention-required', 'continued-to-reviewer', 'reviewer-turn'],
  ['intervention-required', 'continued-to-author', 'author-revision'],
  ['intervention-required', 'same-session-reclaim', RESTORE_INTERRUPTED_ROLE],
  ['intervention-required', 'participant-replaced', RESTORE_INTERRUPTED_ROLE],
  ['intervention-required', 'override-committed', 'accepted-over-objections'],
  ['intervention-required', 'override-sealed-no-commit', 'accepted-over-objections-uncommitted'],
  ['intervention-required', 'abandoned', 'abandoned'],
];
```

`turn-claimed`, `identity-changed`, `challenge-requested`,
`challenge-superseded`, `supplement-registered`, `delivery-written`, and
`delivery-acknowledged` update projections without changing lifecycle state.
`same-session-reclaim` is non-revision-advancing but, when recovering
`intervention-required(stale-claim)`, restores the exact reviewer or author role
state recorded by the intervention. `participant-replaced` consumes its grant,
advances revision, and restores the exact role state interrupted by
`participant-loss`. The schema models revision advancement and lifecycle-state
change as independent properties. A reclaim event outside stale-claim
intervention is valid only as an idempotent same-claim retry and must leave the
lifecycle state unchanged; a conflicting reclaim fails closed. Neither recovery
edge is allowed while an unexpired Human Authority challenge exists.

`intervention-entered` may be derived from `turn-budget-exhausted`,
`stale-claim`, or `participant-loss` and must name an immutable intervention ID
plus the interrupted role state.

Add tests that event sequence/revision must be contiguous, terminal states never
transition, unknown fields/events fail, and projection corruption is rebuilt
byte-for-byte from `events.jsonl`.

Create `test/helpers/review-fixture.mjs` with
`createReviewWorkspace({ repository, events })`. It creates a real ignored
workspace by validating and appending the supplied event sequence through Task
4's store, then rebuilds both projections with `reduceEvents`; tests must never
hand-write projection JSON. Provide named builders for reviewer turn, author
revision, acceptance pending, and each intervention reason.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
node --test test/unit/events.test.mjs test/unit/reducer.test.mjs test/integration/recovery.test.mjs
```

Expected: FAIL because schemas and reducer do not exist.

- [ ] **Step 3: Implement closed event validation and pure reduction**

Every event contains schema, review ID, monotonically increasing sequence and
revision, type, actor fingerprint or `system`, RFC-3339 time, and a closed payload
for its type. Keep `reduceEvents` pure and deterministic; derive current actor,
turn usage, claims, challenges, supplements, deliveries, artifact authority, and
terminal evidence without reading Git or the clock.

```js
export function reduceEvents(events) {
  return events.reduce((state, event, index) => {
    validateEvent(event);
    if (event.sequence !== index + 1) throw aprProjectionDrift('event sequence');
    return applyEvent(state, event);
  }, initialProjection());
}
```

- [ ] **Step 4: Implement event-first mutation and projection repair**

`mutateReview` must: pre-validate without mutation, acquire the lock, reread and
revalidate expected review/revision/actor, append the validated event, atomically
rewrite `protocol.json` and `participants.json` from `reduceEvents`, create the
delivery receipt, and return exact next action. On recovery, trust valid events,
not projection files; conflicting or truncated event bytes fail closed.

- [ ] **Step 5: Run GREEN tests and commit**

```bash
node --test test/unit/events.test.mjs test/unit/reducer.test.mjs test/integration/recovery.test.mjs
git add schemas/event-v1.json schemas/protocol-v1.json schemas/participants-v1.json \
  src/protocol/events.mjs src/protocol/reducer.mjs src/protocol/service.mjs \
  test/helpers/review-fixture.mjs test/unit/events.test.mjs \
  test/unit/reducer.test.mjs test/integration/recovery.test.mjs
git commit -m "feat: add event-sourced review lifecycle"
```

### Task 5: Add Provider-Neutral Identity and Claim Recovery

**Files:**

- Create: `src/identity/registry.mjs`
- Create: `src/identity/codex.mjs`
- Create: `src/identity/claude.mjs`
- Create: `src/identity/grok.mjs`
- Create: `src/identity/generic.mjs`
- Create: `test/unit/identity.test.mjs`
- Create: `test/integration/claims.test.mjs`

**Interfaces:**

- Produces: `participantIdentity(input) -> ParticipantIdentity`,
  `resolveIdentity(context) -> ParticipantIdentity`,
  `fingerprintSession(provider, rawSessionId) -> string`,
  `claimRole(review, identity, now)`, and `reclaimRole(review, identity, now)`.
- Consumes: injected official runtime metadata; never tracked raw identifiers.

- [ ] **Step 1: Write RED identity and claim tests**

Use fake Codex, Claude Code, Grok, and generic contexts. Assert runtime identity
wins over declared identity, declared fallback is labeled, equal provider/model
with different fingerprints can join, equal fingerprints cannot fill both roles,
model changes append identity-change events, and raw session IDs never appear in
responses/manifests.

Test claims for random claim ID, role, fingerprint, host, claimed/activity/expiry
times, diagnostic CLI PID, default eight-hour TTL, stale-claim derivation,
same-fingerprint reclaim without a grant, different-fingerprint refusal, and no
reclaim while an unexpired authority challenge exists. Parse `--claim-ttl` as
whole hours, test `1` and `8`, convert exactly once to milliseconds, and reject
zero, fractional, negative, and unit-suffixed values.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
node --test test/unit/identity.test.mjs test/integration/claims.test.mjs
```

Expected: FAIL on missing identity registry and claim service.

- [ ] **Step 3: Implement normalized identity adapters**

```js
export function participantIdentity({
  role,
  host,
  provider,
  modelId,
  modelDisplay,
  sessionId,
  source,
}) {
  return Object.freeze({
    role,
    host,
    provider,
    model_id: modelId,
    model_display: modelDisplay,
    session_fingerprint: fingerprintSession(provider, sessionId),
    identity_source: source,
  });
}
```

Port only official session/model discovery needed by peer review from AITM
`scripts/providers/**` and `scripts/review/lib/provider-session.mjs`. Keep raw
session IDs inside adapter-local scratch records and expose a generic declared
adapter with only `manual` and `staleness-only` capabilities.

- [ ] **Step 4: Implement TTL claims and audited reclaim**

`claimRole` records expiry as `claimedAt + claimTtlMs`; PID is diagnostic and is
never probed as liveness. Status derives stale claim without mutating. The next
locked recovery appends `intervention-entered(stale-claim)`. Same-fingerprint
reclaim appends `same-session-reclaim` without advancing protocol revision and
records old/new claim IDs and expiry. Never auto-release or steal a claim.

- [ ] **Step 5: Run GREEN tests and commit**

```bash
node --test test/unit/identity.test.mjs test/integration/claims.test.mjs
git add src/identity/registry.mjs src/identity/codex.mjs \
  src/identity/claude.mjs src/identity/grok.mjs src/identity/generic.mjs \
  test/unit/identity.test.mjs test/integration/claims.test.mjs
git commit -m "feat: add participant identity and claims"
```

### Task 6: Implement Graded Human Authority

**Files:**

- Create: `schemas/grant-challenge-v1.json`
- Create: `schemas/human-decision-v1.json`
- Create: `src/authority/canonicalize.mjs`
- Create: `src/authority/challenge.mjs`
- Create: `src/authority/verify.mjs`
- Modify: `src/cli/run.mjs`
- Create: `test/unit/authority-canonicalize.test.mjs`
- Create: `test/integration/authority.test.mjs`

**Interfaces:**

- Produces: `GRANT_PARAMETER_FIELDS`,
  `canonicalGrantParameters(action, input) -> Buffer`,
  `requestChallenge(review, action, parameters, now) -> Challenge`, and
  `verifyAndConsumeGrant(review, grant, expected) -> Attestation`, plus the
  `request-grant` CLI handler.
- Consumes: protocol-pinned public verifier or official host receipt adapter;
  never a required private credential; Task 4's event-built review fixture for
  arbitrary intervention states.

- [ ] **Step 1: Write RED canonicalization vectors**

Create fixed byte/digest vectors for all five protected actions. Cover recursive
key sorting, Unicode NFC, repository-relative POSIX paths, base-10 JSON integers,
explicit null optionals, ordered arrays, and rejection of unknown, omitted,
duplicate, traversal, absolute, and non-canonical fields.

```js
assert.equal(
  canonicalGrantParameters('continue', {
    additional_turns: 2,
    resulting_effective_maximum: 12,
    resume_role: 'reviewer',
    focus_path: null,
    focus_digest: null,
  }).toString(),
  'ai-peer-review.grant-parameters/v1\n{"additional_turns":2,"focus_digest":null,"focus_path":null,"resulting_effective_maximum":12,"resume_role":"reviewer"}'
);
```

The `ai-peer-review.grant-parameters/v1\n` byte prefix is an explicit
implementation-level domain-separation decision made by this plan: it is part of
the hashed bytes before canonical JSON, not merely a schema label in prose. Pin
that decision in every golden vector.

Give `pin-verifier`, `supplement`, `accept-over-objections`, and
`replace-participant` equally explicit golden vectors using the exact parameter
sets in the ratified spec.

Define the closed field catalog once and use it for both validation and vectors:

```js
export const GRANT_PARAMETER_FIELDS = Object.freeze({
  'pin-verifier': [
    'verifier_fingerprint',
    'assurance_grade',
    'authority_policy',
    'artifact_path',
    'artifact_kind',
    'reviews_root',
    'path_template',
    'issue_id',
    'maximum_turns',
    'commit_mode',
  ],
  continue: [
    'additional_turns',
    'resulting_effective_maximum',
    'resume_role',
    'focus_path',
    'focus_digest',
  ],
  supplement: ['content_digest', 'target_role', 'target_turn'],
  'accept-over-objections': [
    'artifact_path',
    'artifact_blob',
    'artifact_digest',
    'final_round',
    'reviewer_response_path',
    'reviewer_response_digest',
    'unresolved_finding_ids',
    'human_rationale_digest',
  ],
  'replace-participant': [
    'role',
    'outgoing_claim_id',
    'outgoing_session_fingerprint',
    'incoming_session_fingerprint',
  ],
});
```

- [ ] **Step 2: Write RED verification and policy tests**

Generate fixture Ed25519 keys in the test process. Assert exact review,
intervention ID, revision, action, parameters digest, nonce, expiry, verifier,
and signer binding; replay/cross-review/cross-revision/mismatch/expiry refusal;
atomic nonce consumption; and complete attestation metadata.

Table-drive:

```js
[
  ['hardware-presence', 'hardened', 'prevention-required', true],
  ['host-verified', 'hardened', 'prevention-required', true],
  ['cryptographic-external', 'mutable-local', 'prevention-required', false],
  ['cryptographic-local', 'mutable-local', 'detection-allowed', true],
  ['unverified-test', 'test-fixture', 'no-commit', true],
];
```

Assert the effective grade is the weaker signer/verifier boundary, test fixtures
are rejected in normal mode, and unavailable authority still permits ordinary
consensus within the original budget.

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
node --test test/unit/authority-canonicalize.test.mjs test/integration/authority.test.mjs
```

Expected: FAIL on missing authority modules.

- [ ] **Step 4: Implement challenges and verification**

```js
export function requestChallenge(review, action, parameters, now = new Date()) {
  assertInterventionStable(review, action);
  const bytes = canonicalGrantParameters(action, parameters);
  return Object.freeze({
    schema: 'ai-peer-review.grant-challenge/v1',
    review_id: review.id ?? review.startNonce,
    intervention_id: review.intervention?.id ?? null,
    protocol_revision: review.revision,
    action,
    parameters_digest: sha256(bytes),
    nonce: randomBytes(32).toString('base64url'),
    expires_at: new Date(now.valueOf() + review.challengeTtlMs).toISOString(),
  });
}
```

Verify detached signatures with `node:crypto` or delegate to an injected official
host receipt verifier. Compute signer grade and verifier-binding grade
independently, select the weaker, enforce `prevention-required` versus
`detection-allowed`, and return the exact source, strength, stable signer ID,
fingerprint, challenge digest, and verification time.

Wire `peer-review request-grant <workspace> --action <protected-action>` to this
service. It writes or reuses only challenge state, never advances protocol
revision, and emits canonical challenge bytes suitable for an out-of-band
signer.

- [ ] **Step 5: Freeze the intervention during signing**

Make status, help, and challenge generation revision-read-only during
intervention. Reuse an identical unexpired challenge instead of generating an
unbounded stream. Permit the participant that requested a challenge to supersede
its own unconsumed challenge only through an explicit audit event; never allow
one participant to invalidate another's challenge. Block reclaim and abandonment
while an unexpired challenge exists.

- [ ] **Step 6: Run GREEN tests and commit**

```bash
node --test test/unit/authority-canonicalize.test.mjs test/integration/authority.test.mjs
git add schemas/grant-challenge-v1.json schemas/human-decision-v1.json \
  src/authority/canonicalize.mjs src/authority/challenge.mjs \
  src/authority/verify.mjs src/cli/run.mjs \
  test/unit/authority-canonicalize.test.mjs test/integration/authority.test.mjs
git commit -m "feat: enforce graded human authority"
```

### Task 7: Generate Safe Collateral, Templates, and Finding IDs

**Files:**

- Create: `schemas/response-v1.json`
- Create: `src/collateral/responses.mjs`
- Create: `src/templates/index.mjs`
- Create: `templates/author-startup.md`
- Create: `templates/reviewer-invitation.md`
- Create: `templates/reviewer-response.md`
- Create: `templates/author-response.md`
- Create: `templates/human-decision.md`
- Create: `templates/review-manifest.md`
- Create: `test/unit/responses.test.mjs`
- Create: `test/golden/templates.test.mjs`
- Create: `test/golden/templates/*.md`

**Interfaces:**

- Produces: `hydrateTemplate(name, variables) -> Buffer`,
  `createResponseDraft(review, role, turn)`, and
  `sealResponse(review, file, identity) -> SealedResponse`.
- Consumes: Task 3 path resolver, Task 4 event authority and event-built review
  fixture, and Task 5 normalized identity. Top-level `templates/*.md` are package
  data; `src/templates/index.mjs` is the sole runtime loader/hydrator, preserving
  both directories named by the ratified package layout without duplicate
  implementations.

- [ ] **Step 1: Write RED template and response tests**

Assert each package template hydrates with zero unresolved placeholders, carries
template version/digest, uses absolute artifact/workspace/response paths in
startup files, and documents installed and zero-install command forms safely.

For reviewer responses, test only these top-level prose sections and decisions:

```js
const reviewerSections = [
  'Summary',
  'Findings',
  'Required changes',
  'Optional suggestions',
  'Decision',
];
const decisions = ['revisions-requested', 'accepted'];
```

For author responses, require Summary, Finding dispositions, Changes made,
Declined changes and rationale, and Verification.

- [ ] **Step 2: Write RED stable finding-ID tests**

Within both `Findings` and `Optional suggestions`, parse only headings matching
`^### R<reviewer-turn>-F<three digits> — <non-empty title>$`. Assert missing IDs,
duplicates, wrong-turn prefixes, reuse from prior turns, and unnumbered finding
headings fail. Both sections share one ordered ID sequence with no renumbering or
reuse across sections. Seal ordered `finding_ids` in reviewer frontmatter and
require the author's `answered_finding_ids` to equal the preceding sealed set.
Add a fixture proving an optional-suggestion ID may be named in an
`accept-over-objections` human decision.

Use `review-unique-finding-id` consistently in response and human-decision schema
examples.

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
node --test test/unit/responses.test.mjs test/golden/templates.test.mjs
```

Expected: FAIL because templates and response sealing do not exist.

- [ ] **Step 4: Implement protected frontmatter and immutable sealing**

Generate frontmatter in code rather than accepting agent-authored YAML. At
submission, reread the draft, compare every protected field to protocol
authority, refresh model identity, set `submitted_at`, validate exact sections
and IDs, hash bytes, and append a sealed-response event. Refuse protected-field
edits as `APR_PROTECTED_METADATA_CHANGED`; exact retries return the prior seal.

Generate these closed protected fields for both roles; use `finding_ids` only for
reviewer responses and `answered_finding_ids` only for author responses:

```yaml
schema: ai-peer-review.response/v1
review_id: <stable-review-id>
role: author | reviewer
turn: <positive-integer>
commit_mode: normal | no-commit
artifact_path: <repository-relative-path>
artifact_commit: <git-commit-or-null>
artifact_blob: <git-blob-id-or-null>
artifact_digest: <sha256>
agent:
  host: <runtime-host>
  provider: <provider-name>
  model_id: <runtime-model-id>
  model_display: <human-readable-name>
  session_fingerprint: <one-way-fingerprint>
  identity_source: runtime | declared
started_at: <RFC-3339>
submitted_at: <RFC-3339>
finding_ids: []
answered_finding_ids: []
```

- [ ] **Step 5: Implement collision-safe template hydration**

Reserve all expected tracked paths at start without overwriting bytes. Reuse a
complete-identical same-review file, resume only an event-authorized unsealed
draft, and derive `-recovery-<review-id>` only after validating a complete foreign
manifest. Return `APR_OUTPUT_COLLISION` for partial, mixed, or conflicting
content and preserve every byte.

- [ ] **Step 6: Run GREEN tests and commit**

```bash
node --test test/unit/responses.test.mjs test/golden/templates.test.mjs
git add schemas/response-v1.json src/collateral/responses.mjs \
  src/templates/index.mjs templates/author-startup.md \
  templates/reviewer-invitation.md templates/reviewer-response.md \
  templates/author-response.md templates/human-decision.md \
  templates/review-manifest.md test/unit/responses.test.mjs \
  test/golden/templates.test.mjs ':(glob)test/golden/templates/*.md'
git commit -m "feat: generate integrity-bound review collateral"
```

### Task 8: Connect Start, Join, Status, Resume, and Offline Help

**Files:**

- Create: `schemas/cli-result-v1.json`
- Create: `src/cli/help-data.mjs`
- Modify: `src/cli/run.mjs`
- Modify: `src/protocol/service.mjs`
- Create: `test/integration/start-join.test.mjs`
- Create: `test/integration/status-resume.test.mjs`
- Create: `test/golden/help.test.mjs`
- Create: `test/golden/help/*.txt`

**Interfaces:**

- Produces: command handlers `startReview`, `joinReview`, `statusReview`, and
  `resumeReview`; offline `helpRequest(topic, format)` and `explainError(code)`;
  versioned JSON result envelopes.
- Consumes: Tasks 3–7 boundaries, identity adapters, templates, and lifecycle.

- [ ] **Step 1: Write RED start-preflight tests**

Assert `start` performs every check before creating a file: physical repository,
tracked clean artifact, explicit kind, contained output/template, ignored
scratch probe, author identity/transport, destination availability, and optional
bootstrap grant. Snapshot the tree after each injected failure and prove no
mutation. Assert defaults for reviews root, path template, ten turns, eight-hour
claim TTL, normal commit mode, and grant-free consensus startup.

- [ ] **Step 2: Write RED join/status/resume tests**

Assert join requires the same physical worktree and a distinct fingerprint,
records identity/capability, and creates the first reviewer draft. Status is
read-only, derives stale-claim, redacts scratch-only identifiers, and returns one
exact next action. Resume reconstructs the current actor's instructions without
polling or waking another model.

- [ ] **Step 3: Write RED help contract tests**

Golden-test top-level and every command topic listed in the spec. Each topic must
name roles/states, arguments/defaults/environment, preconditions, file/Git/config/
transport effects, commit/push/block/wake/token behavior, no-commit differences,
installed and zero-install examples, next state/action, stable errors, recovery,
and JSON schema. Assert `help`, `status`, and `explain` are read-only and JSON
contains no prose or ANSI.

Use this syntax as the help/parser golden authority:

```text
peer-review setup
peer-review doctor
peer-review start <artifact> --artifact-kind <spec|plan> [configuration] [--bootstrap-grant <signed-grant>] [--no-commit [--test-human-authority <fixture-id>]]
peer-review request-grant <workspace> --action <protected-action> [action parameters]
peer-review join <reviewer-invitation.md>
peer-review status <workspace> [--json] [--next]
peer-review resume <workspace>
peer-review submit <workspace> [--decision revisions-requested|accepted] [--no-artifact-change --reason <text>]
peer-review supplement <workspace> <file> --for <author|reviewer> --grant <signed-grant>
peer-review continue <workspace> [--additional-turns <N>] [--focus <file>] --grant <signed-grant>
peer-review finalize <workspace> [--good-enough --grant <signed-grant>]
peer-review recover <workspace> [--reclaim | --replace-participant <role> --grant <signed-grant>]
peer-review abandon <workspace> --reason <text>
peer-review help [<command>] [--all] [--json]
peer-review help search <term>
peer-review explain <error-code> [--json]
```

Document explicitly that `start --bootstrap-grant` consumes a protected
`pin-verifier` action grant. Golden-test each help form from the ratified spec,
including `help --all`, `help search <term>`, `help submit --json`,
`status --json`, and `status --next`. Derive every usage line from Task 2's
frozen command/positional/flag catalog and assert each catalog flag appears in
exactly one owning help topic; hand-authored syntax drift fails the golden test.

- [ ] **Step 4: Run the focused tests and verify RED**

```bash
node --test test/integration/start-join.test.mjs test/integration/status-resume.test.mjs test/golden/help.test.mjs
```

Expected: FAIL on unconnected commands and missing help topics.

- [ ] **Step 5: Implement command orchestration**

Implement each handler as preflight, lock, reread/revalidate, event append,
projection update, durable delivery, result. `start` writes `events.jsonl`,
projections, startup, and invitation only after all preflights pass. `join`
accepts the invitation path, not ambient guesses. `status --next` and
`resume` produce commands from structured help data, never hand-built strings.

- [ ] **Step 6: Run GREEN tests and commit**

```bash
node --test test/integration/start-join.test.mjs test/integration/status-resume.test.mjs test/golden/help.test.mjs
git add schemas/cli-result-v1.json src/cli/help-data.mjs src/cli/run.mjs \
  src/protocol/service.mjs test/integration/start-join.test.mjs \
  test/integration/status-resume.test.mjs test/golden/help.test.mjs \
  ':(glob)test/golden/help/*.txt'
git commit -m "feat: start and resume standalone reviews"
```

### Task 9: Enforce Reviewer Submission and Author-Only Git Transactions

**Files:**

- Create: `src/git/transaction.mjs`
- Modify: `src/protocol/service.mjs`
- Modify: `src/cli/run.mjs`
- Create: `test/integration/submit.test.mjs`
- Create: `test/integration/git-transaction.test.mjs`
- Create: `test/integration/reviewer-boundary.test.mjs`

**Interfaces:**

- Produces: `submitReviewTurn(input)`, `submitAuthorTurn(input)`, and
  `commitExactPaths(repository, sealed, message, trailers) -> CommitReceipt`.
- Consumes: sealed response bytes, authoritative artifact bytes, protocol role,
  repository index observations, and Task 4's event-built review fixture.

- [ ] **Step 1: Write RED reviewer-boundary tests**

Run reviewer submit through both library and CLI. Permit only the generated
reviewer response plus protocol scratch delivery. Refuse artifact edits, any
index delta, unexpected tracked/untracked protocol-owned paths, branch/HEAD
change, commits, amended history, worktree switch, and push attempts. Assert
revisions-requested moves to author revision and accepted moves to
acceptance-pending without committing.

- [ ] **Step 2: Write RED exact-path transaction tests**

Prepare a repository with unrelated staged and unstaged changes. Seal a reviewer
response, artifact, and author response, then assert the created commit changes
exactly those three paths while unrelated staged entries preserve their object
IDs and remain staged/uncommitted and unrelated working bytes remain unchanged.

Inject failure after each transaction step and verify recoverable state. Add
negative cases for index/working bytes differing from seals, owned-path overlap,
changed HEAD, wrong worktree, unexpected commit path, missing/wrong trailers,
and artifact drift.

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
node --test test/integration/submit.test.mjs test/integration/git-transaction.test.mjs test/integration/reviewer-boundary.test.mjs
```

Expected: FAIL because submit and exact-path commit are missing.

- [ ] **Step 4: Implement the six-step commit transaction**

```js
export function commitExactPaths(repo, sealed, message, trailers) {
  const before = repo.snapshotIndexOutside(sealed.paths);
  repo.assertNoOwnedOverlap(sealed.paths);
  repo.addPaths(sealed.paths);
  repo.assertIndexAndWorktreeBytes(sealed);
  repo.assertOutsideIndex(before);
  const commit = repo.commitOnly(sealed.paths, message, trailers);
  repo.assertCommitPaths(commit, sealed.paths);
  repo.assertOutsideIndex(before, { stillStaged: true, absentFrom: commit });
  return Object.freeze({ commit, paths: [...sealed.paths], trailers: { ...trailers } });
}
```

`repo.commitOnly` invokes literal argv
`git commit --only -m <message-and-trailers> -- <owned-paths>`. All Git calls use
literal argv. Recovery recognizes a commit only when exact path set, all
trailers, all sealed hashes, and unrelated-index preservation agree.

- [ ] **Step 5: Connect reviewer and author submissions**

Reviewer submit validates decision and stable finding IDs, seals without Git
mutation, and emits delivery. Author submit validates complete finding
dispositions, artifact seal, and either changed artifact or explicit
`--no-artifact-change --reason`; it then commits the triad and advances only
after post-commit verification.

- [ ] **Step 6: Run GREEN tests and commit**

```bash
node --test test/integration/submit.test.mjs test/integration/git-transaction.test.mjs test/integration/reviewer-boundary.test.mjs
git add src/git/transaction.mjs src/protocol/service.mjs src/cli/run.mjs test/integration/submit.test.mjs test/integration/git-transaction.test.mjs test/integration/reviewer-boundary.test.mjs
git commit -m "feat: commit author-owned review rounds"
```

### Task 10: Add Budgets, Intervention, Supplements, and Recovery

**Files:**

- Modify: `src/protocol/reducer.mjs`
- Modify: `src/protocol/service.mjs`
- Modify: `src/cli/run.mjs`
- Create: `test/integration/budget-intervention.test.mjs`
- Create: `test/integration/supplements.test.mjs`
- Extend: `test/integration/claims.test.mjs`
- Extend: `test/integration/recovery.test.mjs`

**Interfaces:**

- Produces: `continueReview`, `registerSupplement`, `recoverReview`, and
  `abandonReview` command handlers.
- Consumes: Task 6 action-specific grants and frozen intervention authority.
  Integration setup uses Task 4's event-built review fixture.

- [ ] **Step 1: Write RED budget and intervention tests**

Assert each sealed reviewer response spends one turn, the final requested-
revision response still permits one closing author answer, and that answer enters
`intervention-required(turn-budget-exhausted)`. Continuation must bind requested
additional turns, resulting maximum, resume role, and optional focus path/digest;
it adds rather than resets the budget.

Test prevention-required refusal under detection-bound verifier setup,
detection-allowed warning propagation, expired/replayed/mismatched grants, and
unchanged protocol revision while a challenge is being signed.

- [ ] **Step 2: Write RED supplement and abandonment tests**

Assert a supplement is copied into
`.scratch/peer-review/<review-id>/supplements/<supplement-id>.md`, normalized,
hashed, targeted to an exact role/turn, frozen on continuation, and acknowledged
by ID in the next targeted response. Assert manifest metadata includes digest,
target, attestation, acknowledgment, and `content_retention: scratch-only`.

Assert either participant may abandon intervention without a grant only when no
unexpired challenge exists. Abandonment records actor/reason/retained paths,
releases the package destination reservation, emits terminal status for the host,
deletes nothing, creates no acceptance evidence, and cannot resume.

- [ ] **Step 3: Write RED participant-replacement and idempotency tests**

Assert same-fingerprint reclaim follows Task 5, while a different fingerprint
requires `replace-participant` bound to role, outgoing claim ID/fingerprint, and
incoming fingerprint. Preserve old provenance. For every mutation, prove exact
retry returns the existing result and conflicting retry returns a stable
`APR_*` error without changing event bytes.

- [ ] **Step 4: Run the focused tests and verify RED**

```bash
node --test test/integration/budget-intervention.test.mjs test/integration/supplements.test.mjs test/integration/claims.test.mjs test/integration/recovery.test.mjs
```

Expected: FAIL on missing intervention commands and transitions.

- [ ] **Step 5: Implement intervention commands through one guarded mutation path**

Each command must build its canonical parameters first, verify/consume the grant
inside the same lock as the authorized event, and retain full attestation.
`recover` prints a read-only plan before mutation, rebuilds projections from
events, reconciles exact delivery/commit receipts, and never treats current bytes
as historical evidence without a matching seal.

- [ ] **Step 6: Run GREEN tests and commit**

```bash
node --test test/integration/budget-intervention.test.mjs test/integration/supplements.test.mjs test/integration/claims.test.mjs test/integration/recovery.test.mjs
git add src/protocol/reducer.mjs src/protocol/service.mjs src/cli/run.mjs \
  test/integration/budget-intervention.test.mjs \
  test/integration/supplements.test.mjs test/integration/claims.test.mjs \
  test/integration/recovery.test.mjs
git commit -m "feat: govern review intervention and recovery"
```

### Task 11: Implement Isolated No-Commit Test Mode

**Files:**

- Modify: `src/protocol/reducer.mjs`
- Modify: `src/protocol/service.mjs`
- Modify: `src/cli/run.mjs`
- Create: `test/integration/no-commit.test.mjs`
- Create: `test/helpers/git-spy.mjs`

**Interfaces:**

- Produces: `sealNoCommitHandoff(input) -> NoCommitSeal`, immutable
  `commitMode: no-commit`, per-handoff artifact snapshots, and terminal
  `accepted-uncommitted` or `accepted-over-objections-uncommitted` evidence.
- Consumes: the same lifecycle and response validators as normal mode, Task 4's
  event-built review fixture, and ignored immutable snapshots in place of Git
  commits.

- [ ] **Step 1: Write RED mode-immutability and baseline tests**

Start with unrelated staged and unstaged changes. Record startup HEAD, complete
index tree, artifact blob/digest, and every pre-existing changed path/digest.
Assert `--no-commit` is accepted only by start, cannot be converted later, and
`--test-human-authority` is accepted only with no-commit. Require every prompt,
response, status result, and manifest to display `NO-COMMIT TEST MODE` and
`unverified-test` when selected.

- [ ] **Step 2: Write RED no-Git-mutation dialogue tests**

Run one revision and acceptance through the ordinary author/reviewer commands.
After every transition assert startup HEAD and index tree are unchanged,
pre-existing unrelated paths retain exact bytes, only protocol-owned paths have
changed, and no subprocess argv contains `git add`, `git commit`, `git reset`,
`git restore`, or `git checkout`.

Assert each handoff stores an immutable artifact snapshot and digest and that a
subsequent actor refuses changed/missing snapshots or an artifact not matching
the preceding seal.

- [ ] **Step 3: Run the focused test and verify RED**

```bash
node --test test/integration/no-commit.test.mjs
```

Expected: FAIL because normal-mode submission still expects commit authority.

- [ ] **Step 4: Route no-commit submissions through snapshot authority**

```js
export function sealNoCommitHandoff({ review, artifactBytes, responses, store }) {
  assertNoCommitBaseline(review);
  const digest = sha256(artifactBytes);
  const snapshot = store.writeExclusiveSnapshot(review.id, review.sequence + 1, artifactBytes);
  return Object.freeze({
    artifact_digest: digest,
    snapshot_path: snapshot.relative,
    snapshot_digest: snapshot.digest,
    response_digests: responses.map((response) => response.digest),
  });
}
```

Never stage or commit in this branch. Finalization writes a tracked but
uncommitted manifest with `final_commit: null`; status lists every owned tracked
and scratch path and provides no automatic cleanup command.

- [ ] **Step 5: Run GREEN tests and commit**

```bash
node --test test/integration/no-commit.test.mjs
git add src/protocol/reducer.mjs src/protocol/service.mjs src/cli/run.mjs \
  test/integration/no-commit.test.mjs test/helpers/git-spy.mjs
git commit -m "feat: add no-commit review mode"
```

### Task 12: Render Manifests and Finalize Consensus or Human Override

**Files:**

- Create: `schemas/manifest-v1.json`
- Create: `src/manifest/render.mjs`
- Modify: `src/protocol/service.mjs`
- Modify: `src/cli/run.mjs`
- Create: `test/unit/manifest.test.mjs`
- Create: `test/integration/finalization.test.mjs`
- Create: `test/golden/manifests/*.md`

**Interfaces:**

- Produces: `buildManifest(review) -> ManifestModel`,
  `renderManifest(model) -> Buffer`, `sealHumanDecision(review, authority) ->
SealedDecision`, `sealManifest(model) -> SealedManifest`,
  `pathsToSeals(items) -> SealedPathSet`, `finalMessage(review) -> string`,
  `finalTrailers(paths) -> Record<string, string>`, and `finalizeReview(input)`.
- Consumes: complete event history, sealed response/decision bytes, current
  artifact blob/digest, attestation records, and Task 9 Git transaction.

- [ ] **Step 1: Write RED manifest golden tests**

For consensus, human override, no-commit consensus, and no-commit override,
assert schema/status/acceptance basis, participant identity-source caveats,
ordered turns and decisions, artifact commits/blobs/digests, response paths and
hashes, model changes, claims/recovery/replacement, supplements and scratch-only
retention, attestation grade/residual risk, startup/final commit, and absence of
raw session IDs, transcript paths, tokens, IPC endpoints, and private material.

- [ ] **Step 2: Write RED finalization transactions**

For reviewer acceptance, assert the response remains sealed/uncommitted in
`acceptance-pending`; author finalization rechecks the accepted artifact blob,
generates the manifest, and creates a commit containing exactly acceptance plus
manifest. Only the verified commit enters `accepted`.

For good-enough, require an `accept-over-objections` grant bound to artifact
path/blob/digest, final round, reviewer response path/digest, ordered unresolved
finding IDs, and rationale digest. Generate sealed `human-decision.md`; commit
exactly decision plus manifest; enter `accepted-over-objections`, never reviewer
accepted.

Generate the human decision from protocol/grant authority with this closed
shape; the prose body records the signed rationale and enumerates every
unresolved review-unique finding ID:

```yaml
schema: ai-peer-review.human-decision/v1
review_id: <stable-review-id>
decision: accepted-over-objections
artifact_path: <repository-relative-path>
artifact_commit: <git-commit-or-null>
artifact_blob: <git-blob-id-or-null>
artifact_digest: <sha256>
unresolved_findings:
  - reviewer_response_path: <repository-relative-path>
    reviewer_response_digest: <sha256>
    finding_ids: [<review-unique-finding-id>]
human_attestation:
  source: detached-signature | host-approval | test-fixture
  strength: cryptographic-external | hardware-presence | host-verified | cryptographic-local | unverified-test
  signer_id: <stable-human-identifier>
  signer_fingerprint: <public-key-or-host-principal-fingerprint>
  challenge_digest: <sha256>
  verified_at: <RFC-3339>
decided_at: <RFC-3339>
```

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
node --test test/unit/manifest.test.mjs test/integration/finalization.test.mjs
```

Expected: FAIL on missing manifest renderer and finalization handler.

- [ ] **Step 4: Implement deterministic manifest construction**

Build the manifest only from reduced event authority and independently observed
Git data. Sort map-like collections, preserve protocol order for turns/findings/
supplements, normalize newlines, and render byte-identical output on retry.

```js
export function finalizeReview({ review, repository, authority, goodEnough }) {
  const artifact = repository.artifactState(review.root, review.artifact.path);
  assertAcceptedArtifactCurrent(review, artifact);
  const decision = goodEnough ? sealHumanDecision(review, authority) : null;
  const manifest = sealManifest(buildManifest(review, { artifact, decision }));
  const paths = decision ? [decision, manifest] : [review.acceptance, manifest];
  return commitExactPaths(
    repository,
    pathsToSeals(paths),
    finalMessage(review),
    finalTrailers(paths)
  );
}
```

Route no-commit finalization to the same renderer but no Git transaction and the
non-durable terminal statuses from Task 11.

- [ ] **Step 5: Run GREEN tests and commit**

```bash
node --test test/unit/manifest.test.mjs test/integration/finalization.test.mjs
git add schemas/manifest-v1.json src/manifest/render.mjs \
  src/protocol/service.mjs src/cli/run.mjs test/unit/manifest.test.mjs \
  test/integration/finalization.test.mjs \
  ':(glob)test/golden/manifests/*.md'
git commit -m "feat: finalize reviews with durable manifests"
```

### Task 13: Add Setup, Doctor, Resume Adapters, and the Installable Skill

**Files:**

- Create: `src/config/load.mjs`
- Create: `src/config/setup.mjs`
- Create: `src/config/guards.mjs`
- Create: `schemas/config-v1.json`
- Create: `src/doctor.mjs`
- Create: `src/transport/registry.mjs`
- Create: `src/transport/manual.mjs`
- Create: `src/transport/resume.mjs`
- Create: `skills/peer-review/SKILL.md`
- Modify: `src/cli/run.mjs`
- Create: `test/integration/setup-doctor.test.mjs`
- Create: `test/integration/reviewer-guard.test.mjs`
- Create: `test/unit/transport.test.mjs`
- Create: `test/golden/skill.test.mjs`

**Interfaces:**

- Produces: `planSetup(input) -> ChangePlan`, `setup(options) -> ChangePlan`,
  `doctor(context) -> DoctorReport`, `registerTransport(adapter)`, and Phase 1
  `manual|resume-only` capabilities.
- Consumes: user/project config, official provider setup surfaces, and
  repository-reported Git exclude path.

Project configuration is `.ai-peer-review.json`. User configuration is
`ai-peer-review/config.json` beneath the platform config directory (`XDG_CONFIG_HOME`
or `~/.config` on Unix, `APPDATA` on Windows). Project values override user
values. Both use `ai-peer-review.config/v1`, reject unknown keys, and store only
public verifier/host identity metadata—not signing credentials. Because these
locations are normally same-user mutable, their verifier-binding grade is
detection unless a hardened host adapter proves otherwise.

- [ ] **Step 1: Write RED setup reversibility tests**

Use temporary home/project fixtures for Codex, Claude Code, Grok, and generic
hosts. Assert user/project scopes, dry-run, remove, exact proposed diff, backup
before edits, preservation of unknown configuration, idempotent owned additions,
and restoration of only owned keys. Require explicit confirmation before adding
`.scratch/peer-review/` to the exclude file returned by
`git rev-parse --git-path info/exclude`; never edit tracked `.gitignore`.

For hosts with command hooks, install a reviewer guard that derives the exact
pending response/workspace paths from package status and refuses reviewer Git,
artifact writes, shell composition, unknown flags, and mismatched session or
worktree. The CLI remains the independent authority; missing hook support is
reported, never represented as enforcement.

- [ ] **Step 2: Write RED Phase 1 doctor and transport tests**

Assert doctor reports package, skill, identity source/fingerprint, Git/worktree,
scratch ignore, Human Authority verifier/grade/policy, transport capability, and
requested-mode viability. MCP, resident liveness, long timeout, and automatic-
required rows must read `not-installed (Phase 2 optional)` without failing
manual/resume-only health.

Fake official resume commands for each provider. Prove `resume-only` is
advertised only when the adapter validates its official command and stored
scratch handle; generic defaults to manual. Transport failure leaves a sealed
handoff `delivery-pending` and manual resume available.

- [ ] **Step 3: Write the skill golden test**

Require `skills/peer-review/SKILL.md` to instruct both roles to run setup/doctor,
query CLI help rather than guess syntax, obey generated absolute paths, preserve
reviewer/author Git boundaries, disclose no-commit mode, relay only the invitation
in default consensus, and use manual recovery when transport fails. Ensure it
contains no AITM commands or assumptions.

- [ ] **Step 4: Run the focused tests and verify RED**

```bash
node --test test/integration/setup-doctor.test.mjs test/integration/reviewer-guard.test.mjs test/unit/transport.test.mjs test/golden/skill.test.mjs
```

Expected: FAIL on missing configuration, doctor, transport, and skill files.

- [ ] **Step 5: Implement setup as a previewed edit plan**

```js
export function planSetup({ scope, host, current, desired }) {
  const operations = ownedOperations(host, scope, current, desired);
  return Object.freeze({
    scope,
    host,
    changed: operations.length > 0,
    backup_required: operations.some((operation) => operation.kind === 'modify'),
    operations,
  });
}
```

Apply only a displayed plan, write backups beside the owning config, and mark
owned additions for precise removal. Keep all provider-specific keys/version
knowledge inside adapters.

- [ ] **Step 6: Run GREEN tests and commit**

```bash
node --test test/integration/setup-doctor.test.mjs test/integration/reviewer-guard.test.mjs test/unit/transport.test.mjs test/golden/skill.test.mjs
git add schemas/config-v1.json src/config/load.mjs src/config/setup.mjs \
  src/config/guards.mjs src/doctor.mjs src/transport/registry.mjs \
  src/transport/manual.mjs src/transport/resume.mjs src/cli/run.mjs \
  skills/peer-review/SKILL.md test/integration/setup-doctor.test.mjs \
  test/integration/reviewer-guard.test.mjs test/unit/transport.test.mjs \
  test/golden/skill.test.mjs
git commit -m "feat: install and diagnose peer review"
```

### Task 14: Package, Cross-Platform Test, and Release Phase 1

**Files:**

- Modify: `README.md`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `scripts/verify-release.mjs`
- Create: `test/packaging/package.test.mjs`
- Create: `test/smoke/cli.test.mjs`
- Create: `test/integration/ported-behavior-parity.test.mjs`
- Modify: `package.json`
- Modify: `provenance/extraction-manifest.json`
- Create: `provenance/release-manifest.json`
- Modify: `src/public-api.mjs`
- Delete after parity passes: extracted legacy `scripts/review/**`
- Delete after parity passes: extracted legacy `scripts/providers/**`
- Delete after parity passes: extracted legacy `scripts/tests/**`
- Delete after parity passes: extracted legacy
  `docs/superpowers/{specs,plans}/*co-review*`

**Interfaces:**

- Produces: an audited `0.1.x` tarball/release and release manifest containing
  source, package, tag, archive, checksum, and provenance identifiers.
- Consumes: all Phase 1 tasks and the signed relicensing declaration from Task 1.

- [ ] **Step 1: Write RED package-content and installed-CLI tests**

Run `npm pack --json`, inspect the tarball allowlist, install it into a temporary
non-Node host repository, and assert:

```text
npx ai-peer-review --help          # zero-install package invocation
npx peer-review --help             # locally installed binary
peer-review start docs/spec.md --artifact-kind spec
```

The package must contain runtime source, schemas, templates, skill, README,
LICENSE, and NOTICE; it must exclude tests, scratch state, transcripts, provider
tokens, and AITM files. Assert `npm ls --omit=dev --json` has zero dependencies.
Read the packed NOTICE and README and assert both identify the recorded
standalone bootstrap commit, its `filtered_history_tip` parent, and the
historical AGPL/commercial versus Apache-2.0 licensing split.

Scan templates, help topics, the skill, and README for zero-install examples.
Generated and recovery commands may use only `npx ai-peer-review`; any
`npx peer-review` occurrence must be immediately qualified as requiring a
confirmed local installation. Add a failing fixture for an unqualified
occurrence.

- [ ] **Step 2: Add the Phase 1 CI matrix**

Run Node 22 on current Ubuntu, macOS, and Windows. Add Ubuntu compatibility jobs
for `lts/*` and `current` Node so supported later runtimes, including odd-current
behavior, are exercised without weakening the Node 22 floor. Each job runs
install, `test`, `test:integration`, `test:packaging`, and `test:smoke`, plus
formatter/linter/spell/schema checks, package inspection, setup dry-run,
start/join, one revision triad, acceptance finalization, and no-commit
acceptance. Use fake provider/authority adapters and temporary Git repositories;
keep live-provider jobs optional and non-required.

- [ ] **Step 3: Prove port parity and remove the AITM-shaped working tree**

Inventory every extracted legacy test by behavior in
`test/integration/ported-behavior-parity.test.mjs`. Require a passing standalone
test for each lifecycle, budget, supplement, good-enough, consistency, handoff,
provider-session, boundary, finalization, and index behavior that remains in
scope; mark AITM archive/index/occupancy behavior as intentionally replaced with
the ratified standalone test name. Only after that ledger passes, delete the
extracted legacy runtime/provider/test paths and co-review spec/plan working-tree
copies from the new repository. Their history remains reachable through
`filtered_history_tip`, while the ratified design remains at `docs/design/` and
publishable `HEAD` uses only the narrow standalone layout.

- [ ] **Step 4: Finalize the read-only public API and release verifier**

Export only stable, read-only package entry points from `src/public-api.mjs`:

```js
export { statusReview } from './protocol/service.mjs';
export { explainError } from './cli/help-data.mjs';
```

`scripts/verify-release.mjs` must call the extraction verifier with
`requireLegacyRemoved: true` and fail unless it is clean,
the relicensing declaration signature is present and valid, source SHA matches,
the bootstrap commit's first parent equals `filtered_history_tip`, the complete
contributor audit is non-empty, `secret_scan.result` is `pass`, the declaration
digest is non-null, repository is public, tag is signed and resolves to HEAD,
GitHub release and npm tarball agree, npm provenance is present when supported,
checksums match, and Zenodo/Software Heritage identifiers are recorded. Store
the bootstrap commit, release commit, public URLs, checksums, and archive IDs in
`provenance/release-manifest.json`.

- [ ] **Step 5: Run the complete Phase 1 gate**

```bash
npm run format:check
npm run lint
npm test
npm run test:integration
npm run test:packaging
npm run test:smoke
npm pack --dry-run
node scripts/verify-extraction.mjs --require-legacy-removed
git diff --check
git status --short
```

Expected: all commands exit 0, the working tree is clean, and no Phase 1 test
starts an MCP server or depends on resident liveness.

- [ ] **Step 6: Commit the release candidate**

```bash
git add README.md .github/workflows/ci.yml .github/workflows/release.yml package.json \
  src/public-api.mjs scripts/verify-release.mjs test/packaging/package.test.mjs \
  test/smoke/cli.test.mjs test/integration/ported-behavior-parity.test.mjs \
  provenance/extraction-manifest.json provenance/release-manifest.json
git add -A -- scripts/review scripts/providers scripts/tests \
  ':(glob)docs/superpowers/specs/*co-review*' \
  ':(glob)docs/superpowers/plans/*co-review*'
git commit -m "release: prepare ai-peer-review 0.1"
```

- [ ] **Step 7: Pause for the human publication gate, then publish**

Present the exact release commit, signed relicensing declaration, full CI URLs,
tarball contents/hash, npm owner/provenance configuration, public repository
destination, and archival destinations. Only after explicit approval: create the
public repository, push the filtered history, create a signed immutable tag and
GitHub release, publish with npm trusted publishing/provenance, attach tarball and
checksums, archive with Zenodo, request Software Heritage archival, populate the
release manifest, and rerun `node scripts/verify-release.mjs` against public
evidence.

### Task 15: Migrate AITM Through the Published Package Boundary

**Files:**

- Modify: `ai-task-manager/package.json`
- Modify: `ai-task-manager/package-lock.json`
- Create: `ai-task-manager/scripts/task-tracker/lib/peer-review-adapter.mjs`
- Modify: `ai-task-manager/scripts/task-tracker/lib/occupancy.mjs`
- Modify: `ai-task-manager/scripts/task-tracker/lib/command-surface/entrypoints.mjs`
- Modify: `ai-task-manager/scripts/task-tracker/test-impact-manifest.json`
- Modify: `ai-task-manager/scripts/task-tracker/verbs/help-data.mjs`
- Modify: `ai-task-manager/skill/shared/rules/review.md`
- Create: `ai-task-manager/scripts/tests/integration/review/peer-review-package-parity.test.mjs`
- Create: `ai-task-manager/scripts/tests/integration/review/peer-review-migration-guard.test.mjs`
- Delete after parity/guard gate: `ai-task-manager/scripts/review/**`
- Delete after parity/guard gate: AITM-only co-review fixtures and tests superseded
  by package coverage

**Interfaces:**

- Consumes: an exact published `ai-peer-review@0.1.x` package and its read-only
  `statusReview` public API, plus a real governed AITM migration issue supplied
  before this task begins. Do not invent an issue ID. If no issue exists, stop
  and create one through `/task new` / the sanctioned
  `scripts/gh/create-issue.mjs --shape solo` workflow, then take it through the
  ordinary Refine, Plan approval, and Develop gates.
- Produces: `AITM_PEER_REVIEW_CONFIG`, `peerReviewStatus({ workspace, api }) ->
HostReviewStatus`, and AITM configuration using reviews root
  `docs/superpowers/reviews`, template `<issue>/<kind>`, opaque positive issue
  metadata, and AITM-owned occupancy caching.

- [ ] **Step 1: Bind the governed AITM issue and capture its real ID**

Set `APR_AITM_ISSUE` to the supplied issue's returned positive integer, bind it
with `npx aitm start`, and confirm it is in Develop with the required
planning/deep-dive evidence. In the current AITM command surface, `start` is the
documented bind-and-start operation; there is no separate `aitm bind` verb. This
is runtime evidence, not a plan placeholder:

```bash
: "${APR_AITM_ISSUE:?set APR_AITM_ISSUE to the governed migration issue ID}"
test "$APR_AITM_ISSUE" -gt 0
npx aitm start "$APR_AITM_ISSUE"
npx aitm status "$APR_AITM_ISSUE"
```

Expected: both commands exit 0 and status names this worktree, the migration
issue, and Develop. Every AITM commit in this task must begin with
`[#${APR_AITM_ISSUE}]`.

- [ ] **Step 2: Write RED dependency-boundary and parity tests**

Install the exact released version. Assert AITM invokes the installed
`peer-review` binary or read-only API, never adds `npx aitm peer-review`, rejects
no-commit mode in governed production while enabling it explicitly in tests, and
passes issue/kind/output settings without the package reading AITM state.

Replay the legacy happy path, one revision, acceptance, budget exhaustion,
supplement, good-enough, dirty-tree, collision, and recovery fixtures through the
package. Compare semantic state/evidence, allowing only ratified schema/path/name
changes.

- [ ] **Step 3: Write RED active-legacy-review removal tests**

Create an active legacy runtime/index row and assert migration refuses to remove
or disable `scripts/review/**`. Create accepted and abandoned legacy records and
assert their archived bytes remain immutable and readable but are never upgraded
or rewritten. Prove AITM occupancy remains main-worktree anchored while package
state is per-review authority.

- [ ] **Step 4: Run the focused tests and verify RED**

```bash
node --test scripts/tests/integration/review/peer-review-package-parity.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs
```

Expected: FAIL while AITM still routes through `scripts/review/co-review.mjs`.

- [ ] **Step 5: Implement the narrow host adapter**

```js
export const AITM_PEER_REVIEW_CONFIG = Object.freeze({
  reviewsRoot: 'docs/superpowers/reviews',
  reviewPathTemplate: '<issue>/<kind>',
  allowNoCommit: false,
});

export function peerReviewStatus({ workspace, api }) {
  const status = api.statusReview(workspace);
  return Object.freeze({
    reviewId: status.review_id,
    state: status.state,
    worktree: status.worktree,
  });
}
```

Keep issue lifecycle, backlog context, and occupancy policy in AITM. Cache package
status only as non-authoritative occupancy data. Do not import package internals.

- [ ] **Step 6: Remove duplicate runtime only after the guard passes**

Run parity with both engines present. If and only if no active legacy review
exists and parity passes, delete the duplicate CLI/runtime/templates and only
those tests now owned by the package. Preserve provider code still used elsewhere
in AITM and every accepted archive. Step 7's path-limited `git add -A` records
only deletions this guard actually authorized; when the guard retains legacy
runtime, that staging command is a no-op for unchanged paths.

- [ ] **Step 7: Run governed AITM Develop verification and commit**

```bash
node --test scripts/tests/integration/review/peer-review-package-parity.test.mjs scripts/tests/integration/review/peer-review-migration-guard.test.mjs
node scripts/task-tracker/verify-develop.mjs --mode iteration
git diff --check
git status --short
git add package.json package-lock.json \
  scripts/task-tracker/lib/peer-review-adapter.mjs \
  scripts/task-tracker/lib/occupancy.mjs \
  scripts/task-tracker/lib/command-surface/entrypoints.mjs \
  scripts/task-tracker/test-impact-manifest.json \
  scripts/task-tracker/verbs/help-data.mjs \
  skill/shared/rules/review.md \
  scripts/tests/integration/review/peer-review-package-parity.test.mjs \
  scripts/tests/integration/review/peer-review-migration-guard.test.mjs
git add -A -- scripts/review
git commit -m "[#${APR_AITM_ISSUE}] feat: consume standalone peer review package"
node scripts/task-tracker/verify-develop.mjs --mode final --issue "$APR_AITM_ISSUE"
npx aitm promote "$APR_AITM_ISSUE"
```

Expected: focused and iteration checks pass before the attributed commit; exact-
SHA finalization passes on the clean commit; governed promotion runs the
Develop-to-Test preflights and then AITM's configured Test verification
contract. No AITM `src`/runtime copy of package authority remains, and active
legacy review removal is still refused. Do not substitute direct state mutation
or a duplicate ad hoc full-suite run.

### Task 16: Add Race-Safe MCP Waiting in Phase 2

**Files:**

- Create: `src/mcp/server.mjs`
- Create: `src/mcp/wait.mjs`
- Create: `src/transport/live-wait.mjs`
- Modify: `src/transport/registry.mjs`
- Modify: `src/cli/run.mjs`
- Create: `test/mcp/wait.test.mjs`
- Create: `test/mcp/server.test.mjs`
- Create: `docs/dependency-audit-mcp.md`

**Interfaces:**

- Produces: MCP tool
  `wait_for_handoff(review_id, participant) -> Delivery`,
  `waitForHandoff(input) -> Promise<Delivery>`, and `live-wait` transport
  capability.
- Consumes: durable delivery sequence/receipt files from Phase 1; optionally the
  official MCP SDK after dependency approval.

- [ ] **Step 1: Complete the MCP dependency gate**

Record why handwritten protocol interoperability is insufficient, official SDK
version/license, transitive dependency audit, security findings, packed-size
delta, and alternatives in `docs/dependency-audit-mcp.md`. If the official SDK is
not necessary, keep zero runtime dependencies. Do not add any dependency before
this record is reviewed.

- [ ] **Step 2: Write RED wait race and token-idle tests**

Test delivery-before-subscribe, delivery-during-subscribe, simultaneous delivery,
timeout, reconnect, duplicate filesystem events, duplicate client request, server
restart, and manual fallback. Count model/session callbacks and assert an idle
wait performs zero model turns and no polling loop. Assert one sealed delivery is
returned exactly once per participant cursor.

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
node --test test/mcp/wait.test.mjs test/mcp/server.test.mjs
```

Expected: FAIL because the MCP server and live-wait adapter do not exist.

- [ ] **Step 4: Implement check-before-subscribe waiting**

```js
export async function waitForHandoff({ reviewId, participant, afterSequence, deliveries, signal }) {
  const ready = deliveries.readAfter(reviewId, participant, afterSequence);
  if (ready) return ready;
  return deliveries.subscribeOnce({
    reviewId,
    participant,
    afterSequence,
    signal,
    recheck: true,
  });
}
```

Use filesystem notifications in the resident tool process, then re-read durable
authority after every notification. Never modify provider session logs. Keep
resume handles scratch-only. On failure, retain `delivery-pending` and return the
exact manual resume command.

- [ ] **Step 5: Run GREEN tests and commit**

```bash
node --test test/mcp/wait.test.mjs test/mcp/server.test.mjs
git add src/mcp/server.mjs src/mcp/wait.mjs src/transport/live-wait.mjs \
  src/transport/registry.mjs src/cli/run.mjs test/mcp/wait.test.mjs \
  test/mcp/server.test.mjs docs/dependency-audit-mcp.md package.json \
  package-lock.json
git commit -m "feat: add token-free MCP handoff waits"
```

### Task 17: Add Resident Liveness, Automatic Policy, and the Phase 2 Release

**Files:**

- Create: `src/transport/resident.mjs`
- Create: `src/transport/native-push.mjs`
- Modify: `src/config/setup.mjs`
- Modify: `src/doctor.mjs`
- Modify: `skills/peer-review/SKILL.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `provenance/release-manifest.json`
- Modify: `scripts/verify-release.mjs`
- Create: `test/mcp/resident-liveness.test.mjs`
- Create: `test/integration/automatic-required.test.mjs`
- Create: `test/smoke/transport.test.mjs`

**Interfaces:**

- Produces: `validateResidentLease(lease, now) -> ResidentLease`,
  adapter-validated `resident-liveness`, `native-push`, and
  `automatic-required` negotiation for `0.2.x`.
- Consumes: official process instance/opaque handle and heartbeat source; never
  infers liveness from a bare PID.

- [ ] **Step 1: Write RED resident-liveness tests**

Assert a resident observation contains process-instance ID, diagnostic PID or
official opaque handle, host, observed time, lease expiry, and heartbeat refresh.
Test expiry, PID reuse, wrong instance, missing/ambiguous handle, adapter
downgrade, restart, and participant-loss intervention. Generic adapters must
remain `staleness-only` unless they implement and pass this contract.

- [ ] **Step 2: Write RED automatic-required negotiation tests**

At join, require both participants to advertise non-manual transport and pass an
end-to-end health check. Refuse `automatic-required` for manual/resume-only,
unhealthy waits, stale liveness, or incompatible adapter versions. In permissive
modes, disclose downgrade and preserve manual recovery. Add provider-specific
fake tests for long MCP timeout configuration and official native-push where the
host actually exposes it.

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
node --test test/mcp/resident-liveness.test.mjs test/integration/automatic-required.test.mjs test/smoke/transport.test.mjs
```

Expected: FAIL because Phase 1 exposes no resident or automatic-required mode.

- [ ] **Step 4: Implement adapter-owned leases and setup**

```js
export function validateResidentLease(lease, now = Date.now()) {
  if (!lease.process_instance_id || !lease.host || !lease.observed_at || !lease.expires_at) {
    throw new AprError('APR_PARTICIPANT_LOSS', 'resident lease is incomplete', {
      recovery: 'peer-review status <workspace> --next',
    });
  }
  if (Date.parse(lease.expires_at) <= now) throw participantLoss('resident lease expired');
  return Object.freeze({ ...lease, capability: 'resident-liveness' });
}
```

The resident component refreshes leases; the core validates but never probes a
PID. Setup adds only adapter-versioned timeout/server keys with preview, backup,
and removal semantics from Task 13. Doctor upgrades Phase 2 rows to active checks.

- [ ] **Step 5: Run the complete Phase 2 gate**

```bash
npm run test:mcp
npm run format:check
npm run lint
npm test
npm run test:integration
npm run test:packaging
npm run test:smoke
npm pack --dry-run
git diff --check
git status --short
```

Expected: all checks pass; race tests prove no lost/repeated delivery; idle waits
produce no model turns; manual/resume-only Phase 1 workflows remain green.

- [ ] **Step 6: Commit and pause for the Phase 2 publication gate**

```bash
git add src/transport/resident.mjs src/transport/native-push.mjs \
  src/config/setup.mjs src/doctor.mjs skills/peer-review/SKILL.md \
  .github/workflows/ci.yml README.md provenance/release-manifest.json \
  scripts/verify-release.mjs test/mcp/resident-liveness.test.mjs \
  test/integration/automatic-required.test.mjs test/smoke/transport.test.mjs
git commit -m "release: prepare ai-peer-review 0.2"
```

Present the exact commit, dependency audit, packed-size delta, cross-platform CI,
live opt-in evidence, signed tag proposal, tarball hash, and updated release
manifest. Publish and archive `0.2.x` only after explicit approval, populate its
public evidence, and rerun `node scripts/verify-release.mjs`. Do not alter AITM
until that verifier passes.

### Task 18: Upgrade AITM to the Verified Phase 2 Release

**Files:**

- Modify: `ai-task-manager/package.json`
- Modify: `ai-task-manager/package-lock.json`
- Modify: `ai-task-manager/scripts/task-tracker/lib/peer-review-adapter.mjs`
- Extend: `ai-task-manager/scripts/tests/integration/review/peer-review-package-parity.test.mjs`
- Create: `ai-task-manager/scripts/tests/integration/review/peer-review-phase2-compatibility.test.mjs`

**Interfaces:**

- Consumes: an exact published and release-verified `ai-peer-review@0.2.x`, the
  Task 15 Phase 1 adapter, and a separately supplied governed AITM upgrade issue.
- Produces: an exact AITM dependency bump that exposes optional Phase 2
  capability without changing Phase 1 schemas, adding an AITM CLI wrapper, or
  removing manual recovery.

- [ ] **Step 1: Bind a real governed AITM upgrade issue**

If no issue exists, stop and create one through `/task new` / the sanctioned
`scripts/gh/create-issue.mjs --shape solo` workflow. Set `APR_AITM_PHASE2_ISSUE`
to its returned positive ID and take it through the ordinary gates. `aitm start`
is the documented bind-and-start operation; there is no separate `aitm bind`
verb:

```bash
: "${APR_AITM_PHASE2_ISSUE:?set APR_AITM_PHASE2_ISSUE to the governed upgrade issue ID}"
test "$APR_AITM_PHASE2_ISSUE" -gt 0
npx aitm start "$APR_AITM_PHASE2_ISSUE"
npx aitm status "$APR_AITM_PHASE2_ISSUE"
```

- [ ] **Step 2: Write RED compatibility tests**

Pin the exact `0.2.x` version and add tests proving all Phase 1 manifest,
response, manual, resume-only, and recovery fixtures remain byte/schema
compatible. Add opt-in `live-wait`, `native-push`, resident-liveness, downgrade,
and automatic-required cases through the same narrow adapter. Assert AITM still
has no `npx aitm peer-review` surface.

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
node --test scripts/tests/integration/review/peer-review-package-parity.test.mjs \
  scripts/tests/integration/review/peer-review-phase2-compatibility.test.mjs
```

Expected: FAIL while AITM remains pinned to the Phase 1 package.

- [ ] **Step 4: Upgrade only the package boundary**

Update `package.json` and `package-lock.json` to the exact verified `0.2.x`
release. Extend the adapter only for capability/status fields required by Phase
2; keep all package authority inside `ai-peer-review` and preserve manual
fallback.

- [ ] **Step 5: Run governed verification, commit, and enter Test**

```bash
node --test scripts/tests/integration/review/peer-review-package-parity.test.mjs \
  scripts/tests/integration/review/peer-review-phase2-compatibility.test.mjs
node scripts/task-tracker/verify-develop.mjs --mode iteration
git diff --check
git status --short
git add package.json package-lock.json \
  scripts/task-tracker/lib/peer-review-adapter.mjs \
  scripts/tests/integration/review/peer-review-package-parity.test.mjs \
  scripts/tests/integration/review/peer-review-phase2-compatibility.test.mjs
git commit -m "[#${APR_AITM_PHASE2_ISSUE}] feat: consume ai-peer-review 0.2"
node scripts/task-tracker/verify-develop.mjs --mode final \
  --issue "$APR_AITM_PHASE2_ISSUE"
npx aitm promote "$APR_AITM_PHASE2_ISSUE"
```

Expected: compatibility and iteration checks pass before the attributed commit;
exact-SHA finalization passes afterward; governed promotion runs the
Develop-to-Test preflights and then AITM's hosted verification contract without
changing package schemas or the manual recovery path.

## Final Spec-Coverage Gate

Before declaring either phase complete, produce a requirement ledger that maps
every numbered acceptance criterion and each normative paragraph of the ratified
spec to a task, test name, and exact passing commit. At minimum:

| Spec area                                                    | Owning tasks |
| ------------------------------------------------------------ | ------------ |
| Naming, distribution, extraction, licensing, provenance      | 1, 2, 14     |
| Scratch/tracked paths, collision recovery, atomic authority  | 3, 4, 7      |
| Identity, distinct sessions, claims, staleness               | 5            |
| Human Authority, canonical grants, intervention freeze       | 6, 10        |
| Startup, templates, response IDs, help                       | 7, 8         |
| Role lifecycle, budgets, supplements, recovery, abandonment  | 4, 9, 10     |
| Exact Git triads and finalization                            | 9, 12        |
| No-commit mode                                               | 11, 12       |
| Setup, doctor, manual/resume-only transport, skill           | 8, 13        |
| Phase 1 packaging, platform matrix, public release           | 14           |
| AITM package-boundary migration and legacy guard             | 15           |
| MCP waiting, resident liveness, automatic-required transport | 16, 17       |
| AITM Phase 2 dependency bump and compatibility               | 18           |

Run the placeholder scan below and resolve every match as either literal test
data or a plan defect:

```bash
rg -n 'T''BD|TO''DO|implement lat''er|appropriate error hand''ling|handle edge cas''es|similar to Ta''sk' docs/superpowers/plans/2026-09-07-ai-peer-review-extraction.md
```

Expected: no matches. Recheck every interface/function name across tasks, verify
all target paths are owned by exactly one task or intentionally extended later,
and confirm Task 14 remains independently shippable without Tasks 16–18.
