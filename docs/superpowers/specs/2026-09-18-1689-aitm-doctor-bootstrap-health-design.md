# AITM Doctor Bootstrap Health Design

| Metadata | Value                                                                              |
| -------- | ---------------------------------------------------------------------------------- |
| Date     | 2026-09-18                                                                         |
| Issue    | #1689                                                                              |
| Status   | DRAFT — approved in design discussion; pending review of the written specification |

## 1. Summary

AITM will add a read-only `npx aitm doctor` command, following the precedent of
`ai-peer-review doctor`, to verify that a checkout still contains the portable
project integration installed by `npx ai-task-manager install`.

The installer remains the only authority that selects providers and enables
optional bootstrap features. After every successful install, it writes a
versioned, tracked manifest describing that intent and the project-relative
artifacts it owns. Doctor reads the manifest, evaluates the checkout against a
shared installation contract, reports every detected problem, and exits
nonzero when a required check is unhealthy. It never infers an unrecorded
installation, repairs files, invokes GitHub, acquires workflow locks, or
changes task state.

The cloud/CI contract becomes explicit:

```sh
npm ci
npx aitm doctor
npm test
```

`npm ci` restores the package dependency. The committed installation manifest
and portable project artifacts carry the repository integration. Doctor proves
that those two layers agree before the test suite relies on them.

## 2. Problem

AITM is not useful to an agent merely because its npm package is present. The
installer also places skills, hook/config entries, commands, templates, and
optional bootstrap configuration in the consuming repository. Those artifacts
live outside `node_modules` and must be committed when they are meant to be
available in a fresh cloud checkout.

Today, a cloud environment can run `npm ci` without knowing whether a
maintainer previously ran the installer, which providers were selected, or
whether the committed outputs still match the installed package. Running the
installer automatically during `postinstall` would mutate consumer checkouts,
guess project intent, make dependency installation interactive, and hide the
changes that should be reviewed in Git. Re-running install unconditionally in
CI would have the same authority problem.

The missing capability is therefore diagnosis, not automatic installation.
AITM needs a stable, machine-readable record of installation intent and a
read-only command that verifies that intent after dependency installation.

## 3. Goals

1. Make `npx aitm doctor` the explicit bootstrap-health gate after `npm ci`.
2. Record the exact successful installer intent in a versioned tracked
   manifest.
3. Use one installation contract for both generated ownership and health
   inspection.
4. Report all detectable failures in one run with deterministic recovery
   guidance.
5. Provide equivalent human and JSON reports for maintainers and CI.
6. Keep doctor independent of issue binding, timers, locks, GitHub, and the
   task workflow state machine.
7. Preserve user-owned portions of mixed configuration files and evaluate only
   the fragments AITM owns.
8. Prove behavior from a packed package on the supported Node 24 and Node 26
   runtimes.

## 4. Non-goals

- Installing, repairing, regenerating, or deleting any project artifact.
- Running install automatically from npm lifecycle hooks.
- Inferring selected providers or optional features from files already present.
- Validating GitHub authentication, project configuration, issue state, task
  binding, active timers, pull requests, or CI results.
- Auditing npm dependencies or the general developer machine environment.
- Treating every byte in a mixed hook/settings file as AITM-owned.
- Replacing installer tests, normal tests, or project-specific validation.
- Supporting a manifest-free compatibility mode.
- Adding `doctor` as a task-tracker verb.

## 5. Design principles

### 5.1 Install declares; doctor observes

Only an explicit installer invocation may choose providers, link mode, memory
integration, or Codex Superpowers bootstrap. Doctor accepts the resulting
manifest as declared intent. It does not reverse-engineer intent from the
checkout and never makes an install decision.

### 5.2 One ownership contract

Provider ownership rules must not be separately maintained in installer and
doctor code. A pure contract derives expected artifacts and managed fragments
from provider adapters plus normalized install options. The installer uses the
contract when publishing its manifest; doctor uses the same contract when
validating it and inspecting the checkout.

### 5.3 Mixed files are compared semantically

Claude settings, Codex hooks, Grok hooks, and similar files may contain
consumer-owned keys. The contract identifies only the entries AITM manages.
Doctor parses the file and compares those fragments. Unrelated keys, ordering,
and formatting do not make an installation unhealthy.

### 5.4 Failure is aggregate and actionable

Doctor evaluates every check it can safely perform. One missing skill must not
hide an unsafe symlink or an untracked template. Each unhealthy row identifies
the problem and supplies a deterministic recovery action. A corrupt manifest
may prevent artifact derivation, but environment-independent checks still run
and the report explains which dependent checks could not be evaluated.

### 5.5 Read-only means no hidden operational effects

Doctor may read package files, project files, and local Git metadata and may
run read-only Git queries. It may not write caches or temporary files inside
the checkout, acquire AITM locks, bind an issue, start or pause timers, contact
GitHub, or mutate repository state. JSON rendering is a pure presentation of
the same result used for human output.

## 6. Installation manifest

### 6.1 Location and tracking

The installer writes:

```text
.ai-task-manager/install-manifest.json
```

This path is project-local and portable. It is an installed artifact and is
expected to be tracked in Git with the other generated integration. Doctor
reports an otherwise valid but untracked manifest as unhealthy.

Repositories installed before this design have no manifest. Doctor fails with
an explicit instruction to run `npx ai-task-manager install` with the intended
provider/options, review the changes, and commit the manifest and portable
outputs. Doctor does not infer or synthesize a migration.

### 6.2 Schema

The initial document uses schema identifier `aitm.install-manifest/v1`:

```json
{
  "schema": "aitm.install-manifest/v1",
  "generatedBy": {
    "package": "@kburson/ai-task-manager",
    "version": "0.1.0"
  },
  "installation": {
    "providers": ["claude", "codex"],
    "linkMode": "stub",
    "features": {
      "memoryIndex": false,
      "codexSuperpowers": true,
      "codexSuperpowersGlobal": false
    }
  },
  "artifacts": [
    {
      "id": "provider.claude.task-skill",
      "path": ".claude/skills/task",
      "kind": "directory",
      "ownership": "generated",
      "required": true
    },
    {
      "id": "provider.claude.settings-hooks",
      "path": ".claude/settings.json",
      "kind": "json-fragment",
      "ownership": "managed-fragment",
      "required": true
    }
  ]
}
```

The example is illustrative; the implementation plan will enumerate the exact
artifact IDs and feature-to-artifact mapping from current installer behavior.

The schema has these invariants:

- `schema` is exact; unknown versions are invalid rather than interpreted
  optimistically.
- `generatedBy.package` must identify AITM, and `generatedBy.version` records
  generator provenance rather than acting as the sole compatibility check.
- `providers` is a sorted, duplicate-free list from the provider registry.
- `linkMode` is `stub` or `symlink`.
- `features` is a closed object of explicit booleans. Feature combinations are
  validated, including the requirement that Codex bootstrap implies the Codex
  provider and global bootstrap implies bootstrap is enabled.
- every artifact has a stable unique ID, normalized project-relative path,
  closed kind/ownership values, and explicit required flag;
- absolute paths, empty paths, traversal, paths escaping through symlinks,
  duplicate IDs, and contradictory declarations are invalid.

The manifest may record environment-local effects for provenance, but only
project-relative artifacts appear in its portable artifact list. In particular,
the Codex Superpowers installer mirrors skills into `~/.codex/skills` in both
repository and global bootstrap modes. Those host files cannot be required for
a healthy fresh checkout. Repository mode additionally owns the managed block
in project `AGENTS.md`, which is a required portable artifact. Global mode
instead updates `~/.codex/AGENTS.md`; the manifest records that choice, but
doctor reports any missing host-global effect only as an optional row and does
not claim that Git can reproduce it.

### 6.3 Manifest publication

The installer computes and validates the manifest from its normalized options
and the shared contract. It performs all existing provider, feature, and
template writes first. Only after those actions succeed does it publish the
manifest atomically using a same-directory temporary file and rename.

This ordering prevents a failed partial install from publishing a new statement
that the checkout is healthy. If an earlier manifest exists and a later install
fails, the implementation must not partially overwrite it; doctor will compare
the preserved declaration with the now-observed checkout and report any drift.

Serialization is deterministic: stable key order, sorted provider/artifact
collections, two-space JSON indentation, and one trailing newline. This makes
intent changes reviewable in Git.

## 7. Shared installation contract

The shared module is a pure library under `scripts/package/`. It has no terminal
output, process exit, prompting, filesystem writes, GitHub calls, task state,
or lock acquisition.

It provides four conceptual operations:

1. normalize and validate installation intent;
2. derive the artifact declaration from provider adapters and features;
3. validate that a persisted manifest matches a declaration the current
   package understands;
4. inspect supplied filesystem/Git observations and return result rows.

Provider adapters remain the source of provider-specific destinations and
writer behavior. Where current `installRecipe` data is insufficient to describe
an owned fragment, the adapter contract is extended declaratively. Doctor must
not encode a second table of Claude, Codex, or Grok paths.

Generated directories and stubs can be compared to canonical installed
content. Managed JSON files use provider-specific semantic fragment probes
derived from the same writer inputs. Templates and shared configuration use
their existing package sources as canonical content where exact generation is
owned by AITM.

The contract distinguishes:

- **generated ownership**: AITM owns the complete installed artifact;
- **managed-fragment ownership**: AITM owns named semantic entries within a
  consumer-owned file;
- **reference ownership**: the artifact is required to exist and resolve
  safely, but its bytes are intentionally not generated by AITM.

This distinction prevents doctor from either ignoring real drift or claiming
authority over user content.

## 8. Doctor command contract

### 8.1 Routing

`doctor` is registered in `scripts/lib/self-doc.mjs` and routed through the
standalone `SCRIPTS` map in `bin/aitm-registry.mjs`. It must not be added to the
task-tracker command catalog, verb switch, or state transition surface.

Consequently, `npx aitm doctor` works without an active issue or timer. It does
not participate in workflow dispatch guards. The existing deadlock regression
changes from asserting that no doctor name exists to asserting the important
boundary: doctor exists as an independent script and does not exist as a
workflow verb.

### 8.2 Invocation

The supported surface is:

```text
npx aitm doctor [--json]
```

Human output is the default. `--json` selects the versioned machine report.
Unknown arguments, duplicate output-mode arguments, or values supplied to a
flag are invalid invocation errors.

Doctor discovers the project from the current working directory using the same
repository-root convention as other package-level tooling. It does not accept
an arbitrary write target. A future explicit read-only target option would
require separate design because it changes root and Git identity semantics.

### 8.3 Report schema

JSON output uses `aitm.doctor/v1`:

```json
{
  "schema": "aitm.doctor/v1",
  "healthy": false,
  "projectRoot": "/workspace/project",
  "summary": {
    "ok": 8,
    "unhealthy": 2,
    "optional": 1
  },
  "checks": [
    {
      "id": "manifest.tracked",
      "status": "untracked",
      "required": true,
      "details": "The install manifest is not tracked by Git.",
      "recovery": "Review and commit .ai-task-manager/install-manifest.json."
    }
  ]
}
```

The human renderer presents the same rows and overall health. JSON mode writes
exactly one valid JSON document to stdout; progress, notices, and diagnostics
must not contaminate it. Expected health failures are report data, not stack
traces.

`projectRoot` is useful local context but is not portable evidence and must not
be written into the installation manifest.

### 8.4 Closed row vocabulary

Every check row uses one of these statuses:

| Status      | Meaning                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ok`        | The declared requirement is present and matches the contract.                                                            |
| `missing`   | A required declared file, directory, entry, or runtime input is absent.                                                  |
| `untracked` | The artifact exists but Git does not track the required portable path.                                                   |
| `stale`     | The artifact is well formed but was generated from an incompatible or superseded contract/provenance.                    |
| `modified`  | An AITM-owned artifact or fragment differs from its declared canonical content.                                          |
| `invalid`   | The manifest or inspected artifact cannot be safely interpreted under its schema.                                        |
| `unsafe`    | A path or symlink is absolute, escapes the project, is broken in a security-relevant way, or violates portability rules. |

The vocabulary is closed in v1. A new condition maps to one of these statuses
or requires a report schema revision. Renderers must not invent ad hoc status
strings.

`required: false` identifies informative optional rows. An optional unhealthy
row is shown but does not alone set `healthy` false. The contract, not the
renderer, determines which rows are optional.

### 8.5 Exit codes

| Code | Meaning                                                                      |
| ---: | ---------------------------------------------------------------------------- |
|  `0` | Every required check is `ok`.                                                |
|  `1` | A complete report was produced and at least one required check is unhealthy. |
|  `2` | Invocation syntax is invalid, so no health conclusion was produced.          |

Runtime inspection problems that can be represented as rows, including missing
Git context or an invalid manifest, return `1`. Code `2` is reserved for CLI
usage errors.

## 9. Checks

Doctor emits stable IDs for these check families:

### 9.1 Package and project context

- the executing AITM package resolves and exposes the expected doctor contract;
- the current directory belongs to a Git worktree with a stable project root;
- required Git queries can run without mutation.

### 9.2 Manifest

- `.ai-task-manager/install-manifest.json` exists;
- JSON parses and conforms to the exact schema;
- provider, feature, artifact, and path invariants hold;
- declared artifacts agree with the current shared contract;
- generator provenance is compatible or is reported stale with an installer
  rerun recovery;
- the manifest is tracked by Git.

### 9.3 Selected providers

For every selected provider, doctor verifies the task skill/stub and any
provider-specific command, hook, or settings fragment described by its adapter.
It does not inspect providers absent from the manifest and does not interpret
their incidental files as selected.

### 9.4 Enabled optional features

Doctor verifies memory-index hook integration only when recorded as enabled. It
verifies Codex Superpowers bootstrap, including its project/global mode contract,
only when enabled and valid for the selected providers. Disabled features do
not become failures merely because unrelated matching files exist.

For repository-scoped Codex bootstrap, the managed project `AGENTS.md` block is
required and tracked. The mirrored `~/.codex/skills` content is environmental
and therefore optional. For global bootstrap, both the mirrored skills and
`~/.codex/AGENTS.md` block are optional environment-local observations: doctor
may report them when safely visible, but their absence cannot make committed
repository bootstrap unhealthy. This boundary must be explicit in human and
JSON output so a healthy result is not misrepresented as certification of the
host's global Codex setup.

### 9.5 Shared project assets

Doctor verifies the `.ai-task-manager` templates and configuration artifacts
that the installer owns and that downstream task commands require. Exact files
come from the shared artifact declaration rather than a doctor-only list.

### 9.6 Git tracking

Every portable required artifact must be represented in Git. For directories,
doctor evaluates the declared required files rather than assuming Git tracks an
empty directory. Managed-fragment files must themselves be tracked. Ignored or
untracked generated output receives explicit recovery guidance.

The check is about availability in a fresh checkout; it does not require a
clean worktree. A tracked file with uncommitted AITM-owned drift is reported
`modified`, while unrelated worktree changes do not affect health.

### 9.7 Symlink portability

For a `symlink` installation, every declared link must be relative, resolve
within the project's portable installation boundary, reach the declared target,
and avoid a traversal or cycle. Absolute links, links into another worktree,
links into a user's home directory, and escaping links are `unsafe` even when
they happen to resolve on the current machine.

Stub mode requires the generated portable stub form and does not accept a
symlink as equivalent.

## 10. Recovery guidance

Recovery is deterministic and status-specific:

- a missing or stale manifest instructs the maintainer to rerun the explicit
  install command with the intended providers/options, review, and commit;
- missing, stale, or modified generated artifacts direct the maintainer to
  rerun install and review the diff;
- an untracked artifact directs the maintainer to review and commit that exact
  project-relative path;
- an invalid manifest directs the maintainer to inspect the file and rerun
  install rather than hand-editing an inferred replacement;
- an unsafe symlink directs the maintainer to reinstall in portable stub mode
  or correct the explicitly selected portable link arrangement.

Doctor does not offer an interactive repair prompt or a `--fix` option. The
installer remains the only generator, and Git review remains the authority
boundary for adopted changes.

## 11. CI and cloud workflow

The consuming repository's setup documentation and installed task skill state:

```sh
npm ci && npx aitm doctor && npm test
```

This sequence assumes a maintainer has already run install locally and
committed the manifest and portable outputs. CI does not decide providers and
does not rerun install. A doctor failure stops tests early with a complete list
of missing or drifting prerequisites.

AITM's own CI includes a packed-consumer scenario. It packs the package,
installs that tarball into a disposable consumer repository, explicitly runs
the installer to prepare and commit a fixture checkout, then runs doctor from
the installed dependency. The scenario proves both healthy and deliberately
drifted cases on Node 24 and Node 26. It may build its disposable fixture during
the test; that fixture creation does not authorize install during normal
consumer `npm ci`.

## 12. Migration and compatibility

There is no silent legacy mode. Existing repositories gain the manifest by
running the installer explicitly with their intended current choices. The
resulting diff is reviewed because provider selection and optional bootstrap
are repository policy, not facts doctor can infer safely.

The package must not add `postinstall`, `prepare`, or another dependency
lifecycle mutation to create the manifest. It must not opportunistically write
the manifest during doctor, task commands, tests, or help output.

Manifest compatibility is schema-first. A package may inspect a v1 manifest
produced by another package version when the current contract declares it
compatible. A package-version difference alone is not unhealthy; a changed
artifact contract or unsupported provenance is `stale`. This avoids requiring
installer churn for every patch release while still detecting generator changes
that affect installed outputs.

## 13. Safety and authority boundaries

Doctor's implementation must satisfy these invariants:

- no checkout writes, including caches, lock files, normalized JSON, or report
  artifacts;
- no network or GitHub API access;
- no issue binding, timer, task-state, approval, or project-board reads;
- no AITM operational lock acquisition;
- no execution of installed hooks or consumer configuration as code;
- no following of an unvalidated path outside the project boundary;
- no trust in manifest paths until schema and containment checks pass;
- no use of report output as authorization for a later mutation.

Git subprocesses are restricted to read-only worktree/root/tracking queries and
receive explicit paths after containment validation.

## 14. Testing strategy

### 14.1 Pure contract tests

Unit tests cover intent normalization, deterministic artifact derivation,
manifest serialization/validation, provider matrices, feature constraints,
path containment, ownership modes, and every status classification.

Fixtures include malformed JSON, unknown schema/provider/feature, duplicate or
conflicting artifacts, absolute/traversing paths, mixed user/AITM JSON content,
broken links, escaping links, cycles, stale provenance, and unrelated worktree
changes.

### 14.2 Installer integration tests

Existing installer suites gain assertions that:

- the manifest describes the options actually selected;
- derived artifacts agree with provider adapters;
- publication occurs last and is atomic;
- failure before publication does not create or partially replace a manifest;
- repeated identical install produces deterministic content;
- changing provider, link, or feature selections produces a reviewable manifest
  diff and removes no user-owned mixed-file content.

### 14.3 Doctor CLI tests

CLI tests cover human output, `--json`, one-document stdout, human/JSON row
parity, aggregate failure reporting, required/optional health calculation,
deterministic recovery, and exit codes `0`, `1`, and `2`.

Read-only tests snapshot relevant files and `git status --porcelain` before and
after doctor. They also prove doctor can run without an active issue, timer,
network, or GitHub credentials.

### 14.4 Routing and regression tests

Registry tests prove doctor is routable through `SCRIPTS`, listed in help, and
absent from `VERBS`. The deadlock regression proves doctor imports and executes
without entering the task-tracker mutation path.

Package-boundary tests prove every new runtime module and canonical asset is
present in `npm pack` output. The packed-consumer matrix proves the command from
the tarball on Node 24 and Node 26 rather than accidentally importing source-only
files.

## 15. Documentation changes

Documentation must explain three distinct responsibilities:

1. `npm ci` installs the package dependency;
2. a maintainer-run `npx ai-task-manager install` chooses and generates tracked
   project integration;
3. `npx aitm doctor` verifies that the committed integration is present and
   compatible in a fresh checkout.

The installed task skill, repository setup guidance, command help, and CI
examples use the same sequence and recovery language. None may imply that
doctor repairs the repository or that CI should guess installer options.

## 16. Expected component boundaries

The implementation plan should preserve these seams:

- `bin/cli.mjs` orchestrates installer effects and final manifest publication;
- provider adapters declare provider-specific install ownership;
- a new `scripts/package/` library owns manifest and inspection contracts;
- a new `scripts/package/` entry point owns doctor argument parsing, rendering,
  and exit-code mapping;
- `scripts/lib/self-doc.mjs` and `bin/aitm-registry.mjs` expose doctor as a
  standalone operator command;
- tests exercise the pure contract, installer integration, routing boundary,
  packed package, and supported runtime matrix independently.

Exact filenames and extraction order belong in the implementation plan after
this specification is accepted.

## 17. Rejected alternatives

### 17.1 Automatic npm lifecycle install

Rejected because dependency installation must not select project policy or
mutate tracked consumer configuration.

### 17.2 Doctor as `install --dry-run`

Rejected because a dry-run installer still starts from requested future intent,
while doctor must validate recorded repository intent. It would also couple
diagnosis to interactive installer orchestration and tempt later repair flags.

### 17.3 Doctor-only static artifact list

Rejected because it would immediately create a second ownership source that can
drift from provider adapters and installer writers.

### 17.4 Inferring a manifest for legacy repositories

Rejected because file presence cannot prove provider selection, feature intent,
or whether similar user-authored configuration belongs to AITM.

### 17.5 Workflow verb implementation

Rejected because bootstrap health is needed before task workflow availability
can be assumed. Binding, timer, or state guards would create the exact startup
deadlock doctor is intended to diagnose.

## 18. Acceptance mapping

| Issue criterion                                                                 | Design section  |
| ------------------------------------------------------------------------------- | --------------- |
| Versioned tracked manifest with provenance and successful-publication semantics | §6              |
| Shared pure installation contract                                               | §7              |
| Standalone read-only human/JSON doctor                                          | §8, §13         |
| Required bootstrap checks                                                       | §9              |
| Closed statuses, recovery, and exit codes                                       | §8.4, §8.5, §10 |
| Explicit migration without inference or mutation                                | §6.1, §12       |
| Cloud/CI sequence and Node 24/26 consumer proof                                 | §11, §14.4, §15 |

## 19. Decision record

The approved design decisions are:

1. use a shared installer/doctor contract rather than `install --dry-run` or a
   doctor-only manifest;
2. write a tracked manifest last, after a successful explicit install;
3. expose doctor as a standalone read-only script with equivalent human and
   `aitm.doctor/v1` output;
4. treat absent legacy manifests as a clear failure requiring explicit reinstall;
5. keep all repair, automatic install, GitHub/project diagnostics, active-task
   checks, dependency audit, and general environment diagnosis out of scope;
6. prove the packed consumer flow on Node 24 and Node 26.

There are no unresolved design questions. Implementation planning begins only
after human acceptance of this written specification.
