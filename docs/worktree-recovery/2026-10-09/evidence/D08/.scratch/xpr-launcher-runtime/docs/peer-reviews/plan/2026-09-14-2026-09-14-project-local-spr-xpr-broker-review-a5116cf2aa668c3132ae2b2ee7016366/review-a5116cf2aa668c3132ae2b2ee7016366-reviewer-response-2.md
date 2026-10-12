<!-- ai-peer-review-template version="1" digest="sha256:78e9a634af9d540baaf6790db82952eaf39cf7ab59a6cdc7938319ae07a4cbed" -->

<!-- protected-frontmatter -->

---
schema: "ai-peer-review.response/v1"
review_id: "review-a5116cf2aa668c3132ae2b2ee7016366"
role: "reviewer"
turn: 2
commit_mode: "normal"
authority_assurance: "unavailable"
artifact_path: "docs/plans/2026-09-14-project-local-spr-xpr-broker.md"
artifact_commit: "e9e0f34304686bc42170df92cfb09faeb37c92df"
artifact_blob: "c2ef9d6ff59f679f5ea79c7331b9bdf8d6cf6f94"
artifact_digest: "sha256:1b2e91126782e03a7d8851f70966e0cf8d11d96c5e2594d42847996b7347d987"
agent:
  host: "claude-code"
  provider: "anthropic"
  model_id: "claude-opus-5"
  model_display: "Claude Opus 5"
  session_fingerprint: "sha256:c77bb2adc0c8bf3a6a6ea59158ff7b58a1dc1acb75fa5b25d60adadcf1e3f929"
  identity_source: "runtime"
started_at: "2026-09-14T04:06:20.451Z"
submitted_at: "2026-09-14T04:40:16.674Z"
finding_ids: ["R2-F001"]
answered_finding_ids: []
acknowledged_supplement_ids: []
---

Mode: `normal`

## Summary

I reviewed revision `e9e0f34` of `docs/plans/2026-09-14-project-local-spr-xpr-broker.md`
against the linked design and against current repository source, and independently
checked each of the ten dispositions in author response 1 rather than accepting its
summary.

All eight required changes from reviewer response 1 are genuinely resolved, and each
resolution is correct against source rather than merely asserted:

- Required change 1: Task 8 now names `test/helpers/intervention-fixture.mjs` plus the
  fourteen `test/integration/*.test.mjs` direct callers. I re-ran the search: that is
  exactly the fifteen files containing `startReview(`, with no omission and no
  nonexistent file. Task 1 separately owns the five files that invoke `start` through
  argv (`test/unit/cli-parse.test.mjs`, `test/integration/claims.test.mjs`,
  `test/integration/claude-identity.test.mjs`, `test/smoke/cli.test.mjs`,
  `test/golden/help.test.mjs`) — also exactly right. The Task 1 / Task 8 split between
  parser enforcement and direct-service enforcement is stated in the preamble and is
  coherent.
- Required change 2: Task 1 now owns `src/cli/help-data.mjs`, `test/golden/help.test.mjs`,
  and both digest fixtures, and reruns the golden suite plus `npm test`. The preamble
  adds "Run `npm test` before every task commit" and "Do not leave a known broken default
  suite for a later task," which removes the contradiction rather than papering over it.
- Required change 3: Task 10 now owns `test/unit/cli-parse.test.mjs`,
  `test/golden/help.test.mjs`, both digests, and `schemas/cli-result-v1.json`, and
  replaces — rather than deletes — the coordinator grammar and help contract assertions.
- Required change 4: Task 4 now owns `test/packaging/package.test.mjs` and specifies
  updating both the exact file allowlist (`test/packaging/package.test.mjs:28-44`) and
  the production dependency assertions (`:74-89`), listing the four native sources and
  the build script individually rather than widening the allowlist to all of `scripts/`.
- Required change 5: resolved with a single, complete distribution decision — opt-in
  `build:broker-security`, pinned `node-gyp@12.4.0` as a production dependency, mandatory
  absolute `--nodedir`, no `install`/`postinstall`/startup build, and no prebuilt-binary
  branch left open. The consequences are stated honestly: doctor unhealthy,
  `APR_BROKER_START_FAILED` for new broker-dependent starts, legacy manual operation
  preserved, and Tasks 4 and 12 must demonstrate an installed-package build with network
  disabled. This is a real decision, not a deferral. See R2-F001 for the one obligation
  it creates that the plan does not yet own.
- Required change 6: Task 11 introduces `src/cli/help-topics.mjs` with a separate frozen
  concept registry and asserts `COMMANDS.includes('spr') === false`. I verified the seam
  is exactly the right one: `src/cli/parse.mjs:315-316` is where named help topics are
  validated against `COMMANDS` and rejected as "unknown help topic," so importing concept
  names there for validation only — without touching `COMMANDS`, `COMMAND_FLAGS`, or
  dispatch — keeps `start` unambiguous per design decision 2 and leaves the
  `COMMANDS`-driven command-topic contract at `test/golden/help.test.mjs:9-61` intact.
  Task 11 now owns `src/cli/parse.mjs` and `test/unit/cli-parse.test.mjs`, and states its
  ordering relative to Task 10's parser change.
- Required change 7: `APR_REVIEWER_SELECTION_UNSUPPORTED` (Task 1) and
  `APR_BROKER_REGISTRATION_CONFLICT` (Task 6) are distinct, introduced with their
  explanations in the task where the behavior lands, and verified as seven total in
  Task 10. Both match the `/^APR_[A-Z0-9_]+$/` constraint in `src/errors.mjs:4`. Task 6
  now owns the help fixtures its new code invalidates.
- Required change 8: corrected to "seven disposition rows covering the twelve existing
  flags," which matches both the design table and `COMMAND_FLAGS.start`
  (`src/cli/parse.mjs:13-26`).

All six optional suggestions were adopted, and the two with factual content check out:
the CI job identifiers named in Task 12 (`node-24`, `preferred-node`,
`npm-pack-compatibility`, `phase-2-boundary`) are the actual job keys in
`.github/workflows/ci.yml:13,38,63,88`; `node-24` does already carry the three-OS matrix
(`:17-19`) and `preferred-node` is currently `node: ['26','current']` on `ubuntu-latest`
(`:42-44`), so "expand to the same three-OS matrix" is accurate. The Task 2 line
references are also right: `validateStartup` begins at `src/protocol/events.mjs:338` with
its outer exact-key list at `:339-353`, and the nested context check is at `:367` — so
"runtime is a sibling of context, not a context property" is correct and the instruction
to leave `:367` unchanged is the right call.

The two new generation procedures are executable rather than aspirational. The help-hash
snippet reproduces exactly what `test/golden/help.test.mjs:102-105` and `:107-111` hash
(`helpRequest(null,'text',{all:true})` and `JSON.stringify(helpRequest('submit','json'))`),
and the trailing newline it writes is absorbed by the test's `.trim()`. The template
updater mirrors the real loop at `test/golden/templates.test.mjs:60-62` and the actual
exports at `src/templates/index.mjs:63,64,85`; extracting the frozen `values` object at
`test/golden/templates.test.mjs:7` into a shared helper is the correct refactor, and
excluding `scripts/update-template-goldens.mjs` from published files is consistent with
the Task 4 allowlist discipline.

I also checked for collateral breakage the revision could have introduced and found none:
`review.startup_transport_preference` is an additive optional property under a closed
`review` object (`schemas/config-v1.json:84-92`), so existing config fixtures still
validate; `test/unit/npm-pack-report.test.mjs` only exercises the pack-output parser
against static fixtures and needs no change for the new native files; and
`test/integration/ported-behavior-parity.test.mjs` reads sealed fixture JSON rather than
starting a review, so it correctly stays out of Task 8's migration list.

One new issue arises from the Finding 5 remedy itself, not from anything in the original
plan: adding a production dependency without the audit artifact this repository requires
for exactly that act. It is narrow and cheap to fix, but it is a file-ownership gap of
the same class as the original findings — under the plan's exact-path commit rule, an
implementer executing Task 4 literally cannot produce the artifact. Details in R2-F001.

Verification performed this turn. Read: the revised plan in full, author response 1,
`docs/dependency-audit-mcp.md`, `.github/workflows/ci.yml:13-72`,
`src/protocol/events.mjs:328-372`, `src/cli/parse.mjs` (flags, help grammar, topic
validation), `schemas/config-v1.json`, `test/packaging/package.test.mjs:20-129`,
`test/golden/help.test.mjs`, `package.json`. Grep: `startReview(` call sites; argv
`'start'` call sites; `TEMPLATE_NAMES`/`TEMPLATE_VARIABLES`/`hydrateTemplate` exports and
their use in the golden test; config/transport references across tests; dependency,
license, and integrity assertions in `scripts/verify-release.mjs` and
`test/unit/npm-pack-report.test.mjs`; `start`/parity references in
`test/integration/ported-behavior-parity.test.mjs`. I ran no tests and no Git commands. I
could not verify the author's registry claim about `node-gyp@12.4.0` engines offline; I
have not contradicted it and it is not the basis of any finding below.

## Findings

### R2-F001 — Task 4 adds a production dependency without the dependency audit this repository requires, and no task owns the artifact

**Severity:** required. **Introduced by:** revision 1 (the Finding 5 remedy). **Not a
re-litigation of the distribution decision itself.**

The Native distribution decision (plan line 46) and Task 4 (plan lines 215-224) add
`node-gyp@12.4.0` to `dependencies` — a production dependency, deliberately, "so
installed npm packages have the builder even with development dependencies omitted." I
am not disputing that choice; the rationale is coherent, and Task 4 tests package
resolution with devDependencies omitted, which is the case the choice exists to serve.

The problem is the missing evidence obligation. This repository has one production
dependency addition on record, and it was gated by a written audit:
`docs/dependency-audit-mcp.md` records package, version, license, Node engine, registry
modified date, integrity hash, and registry tarball URL in a table (lines 29-40), states
an approval decision scoped to the exact entry points used (lines 9-15), and documents
the rejected alternatives with reasons (lines 17-27). That document exists precisely
because the automated checks cannot see what it covers:

- `test/packaging/package.test.mjs:74-77` asserts `packageJson.dependencies` and
  `:78-89` asserts the `npm ls --omit=dev --json` result, but that command reports the
  root's direct dependencies. It has never surfaced the transitive closure — the MCP SDK
  already brings its own graph, which is why the audit note reasons about a "fully
  declared, overridable graph" and about a vulnerable transitive `fast-uri` that no
  assertion in this repository would have caught (lines 17-27).
- `scripts/verify-release.mjs` validates release-manifest provenance — npm tarball URL,
  integrity, sha256, provenance URL (`:91-94`) — not the dependency graph or licences.
- `test/unit/npm-pack-report.test.mjs` parses static `npm pack` fixtures and asserts
  nothing about dependencies.

So the repository's actual mechanism for scrutinising a production dependency is the
written audit, and Task 4's instruction to "update its exact production
dependency/object/tree assertions to include `node-gyp: 12.4.0`" satisfies only the
depth-0 assertion. Executed literally, the plan expands what every consumer of
`ai-peer-review` installs — including consumers who never build the helper and never
start a broker — from a two-package direct set to one that additionally pulls node-gyp's
build-tooling graph, with no recorded licence, integrity, engine, or supply-chain
decision, in a package that ships provenance attestation (`package.json:43-46`) and
maintains an SPDX policy.

This matters more here than it would elsewhere: the dependency is being added to support
the OS-security helper for a component whose entire purpose is authenticated ownership,
peer-credential checks, and lock integrity. The plan is otherwise rigorous about exactly
this kind of evidence — "Do not claim a supported broker platform from mocked conformance
tests alone" (line 44), and Task 12's registry/tarball audit step. The omission is an
inconsistency with the plan's own standard, not a difference of taste.

Because Task 4 ends with "commit the task's exact files," and no task in the plan lists
any `docs/dependency-audit-*.md` path, an implementer following the plan cannot produce
this artifact without deviating from it. That is the same unowned-file defect class as
reviewer response 1's findings 1 through 4, which the author has otherwise fixed
thoroughly.

Two clarifications on scope. First, I am not requiring a particular outcome: an explicit
recorded decision that no audit is warranted for a build-only dependency, with its
reasoning, would satisfy this finding. Second, I am not asking the plan to execute the
audit as release work — the plan correctly defers publication — only to own the artifact
in the task that introduces the dependency, so the decision is reviewable at the point it
is made rather than discovered at release.

## Required changes

1. **Own the dependency decision artifact in Task 4 (R2-F001).** Add an explicit path —
   for example `docs/dependency-audit-broker-build.md`, following the structure of
   `docs/dependency-audit-mcp.md` — to Task 4's `Files:` list, and add one checklist step
   recording what it must contain: the exact audited identity of `node-gyp@12.4.0`
   (version, licence, Node engine, registry integrity and tarball), the scope of use
   (build-time only, spawned via `process.execPath` with `shell: false`, never loaded on
   a review-start path), and the alternatives considered with reasons — at minimum
   devDependency-plus-operator-provided builder, and optional dependency. If the
   conclusion is that a build-only production dependency needs no audit under this
   repository's practice, record that decision and its reasoning in the plan instead;
   either resolves this finding. No other change to the distribution decision is
   requested.

This is the only required change outstanding. All eight required changes and all six
optional suggestions from reviewer response 1 are verified resolved against source. Once
Task 4 owns the artifact path and its content step — or the plan records an explicit
reasoned decision that no audit is warranted — I expect to accept on the next turn
without further findings.

## Optional suggestions

1. Task 4's packaging step updates the depth-0 dependency assertions in
   `test/packaging/package.test.mjs:74-89`. Consider adding one assertion that the
   installed production closure stays within an expected set, or at least that
   `node-gyp` is absent from every module actually imported by a non-broker code path.
   The current assertions confirm the direct dependency list but cannot distinguish
   "builder available when needed" from "builder loaded during ordinary review work,"
   which is the property the distribution decision actually relies on. This is a
   suggestion, not a requirement; Task 4 already specifies that the helper loads only
   `native/broker-security/build/Release/broker_security.node` after verifying build
   identity.

2. The Golden help update procedure (plan lines 72-87) invokes Node with a heredoc and a
   relative import (`./src/cli/help-data.mjs`), which resolves against the working
   directory for stdin-evaluated ESM. That is correct but implicit. One sentence stating
   "run from the repository root" would remove the only ambiguity in an otherwise exactly
   reproducible procedure.

3. Task 12's step on version-dependent fixtures is a good catch that closes the hazard I
   raised about unowned default-suite failures. Consider naming the assertion sites it
   must update — the packaged `npx` examples rendered into help topics and the version
   strings in the template fixture values — so the step is mechanical rather than a
   search. This is purely an ergonomics note; the ownership is already correct.

## Decision

revisions-requested
