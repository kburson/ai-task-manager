# Reviewer Response 1 — AI Peer Review Extraction Implementation Plan

- **Artifact:** `docs/superpowers/plans/2026-09-07-ai-peer-review-extraction.md`
- **Artifact commit:** `078d751f5b6a5f387e70979de5391a98c09c1ee2`
- **Ratified spec:** `docs/superpowers/specs/2026-09-07-ai-peer-review-extraction-design.md`
- **Spec commit:** `68de80b45b23c90874bac0fcd87cfa0c1980edd4`
- **Reviewer turn:** 1
- **Decision:** `revisions-requested`

## Summary

This is a strong plan. Task decomposition tracks the spec's own section order,
every task carries an explicit Files/Interfaces header, and the RED→GREEN step
shape is genuinely executable rather than decorative — most steps name the exact
`node --test` invocation and the exact expected failure. The security-sensitive
areas the spec worked hardest on (graded Human Authority, canonical grant
parameter binding, intervention freeze, exact-path Git triads, no-commit
baseline invariants) are carried into the plan with concrete code sketches and
table-driven test matrices rather than prose gestures. Phase 1 / Phase 2
separation is real: Tasks 16–17 add files rather than rewriting Phase 1
contracts, and the Task 14 gate explicitly asserts no MCP server starts.

The blocking problems are not architectural. They are eleven concrete defects
that will either stop execution deterministically, silently weaken a gate the
spec declared load-bearing, or leave a task unimplementable as written. The most
serious is R1-F001: the extraction verifier as specified will fail every time it
is run after Task 2, which means the Phase 1 release gate (Task 14 Step 5) and
`verify-release.mjs` can never pass. R1-F002 means the extraction is not
actually pinned to the ratified source commit. R1-F004 is a direct contradiction
between the plan's lifecycle table and the spec's lifecycle diagram.

## Findings

### R1-F001 — The extraction verifier fails deterministically from Task 3 onward

`verifyExtraction` (Task 1 Step 4) enumerates `git log --all --name-only` across
the *entire* history and rejects any path not covered by
`manifest.retained_path_prefixes`. That prefix list (Task 1 Step 5) contains
only the eight extraction-boundary paths.

By Task 2 Step 5, the history contains committed `package.json`,
`package-lock.json`, `bin/`, `src/`, and `test/`. By Task 14 it also contains
`schemas/`, `templates/`, `skills/`, `provenance/`, `.github/`, `README.md`,
`docs/design/`, and `scripts/verify-release.mjs`. None of these match a retained
prefix, so `verifyExtraction` throws `foreign retained paths: …` listing
essentially the whole package.

This is not a latent risk; it is a certain failure at two named gates:

- Task 14 Step 5 runs `node scripts/verify-extraction.mjs` and expects exit 0.
- Task 14 Step 4 requires `scripts/verify-release.mjs` to "fail unless the
  extraction verifier is clean", so publication is blocked too.

The verifier is answering the wrong question. What the spec asks for is that the
*filtered* history — the rewritten AITM commits — contains only the ratified
boundary. It says nothing about the standalone repository's own subsequent
commits.

The plan needs to record a bootstrap boundary commit in the extraction manifest
(the Task 1 Step 7 commit) and scope the enumeration to history at or before it,
with post-bootstrap paths validated against a separate standalone-layout
allowlist, or not validated by this verifier at all. Whichever shape is chosen,
Task 1 Step 4's exported contract and its unit-test fixtures both change, and
Task 14 Step 5 should be re-derivable from that contract without editing the
manifest by hand.

A second, smaller correctness problem lives in the same function: the prefix
match `file === prefix || file.startsWith(prefix + '/')` treats `scripts/tests`,
`docs/superpowers/specs`, and `docs/superpowers/plans` as whole-directory
prefixes, while Task 1 Step 3's filter retains only `*co-review*` globs beneath
them. The verifier therefore cannot detect a non-co-review file leaking through
those three paths. Either narrow the manifest to glob patterns that mirror the
filter, or state explicitly that directory-level retention is intended and
adjust the filter to match.

### R1-F002 — `filter-repo` is not pinned to the ratified source commit

Task 1 Step 1 clones AITM and checks out
`4b3bcd43cba141a611da4a2b861433b915462806` in a detached HEAD, then asserts
`rev-parse HEAD` matches. Task 1 Step 3 then runs `git filter-repo --force` with
path filters only.

Detached checkout does not remove refs. The clone still carries `origin/trunk`
and every other remote branch, and `filter-repo` rewrites *all* refs by default.
So the extracted history will include every commit reachable from the cloned
branch tips — which, at the time this plan runs, is strictly ahead of the source
commit (this repository's current trunk already contains merges past
`4b3bcd43`). The extraction manifest will assert `source_commit: 4b3bcd43…`
while the filtered history contains later work, and Step 1's `rev-parse`
assertion does nothing to prevent it.

The fix is mechanical but must be in the plan: before filtering, reset the only
retained ref to the source commit and delete the rest — e.g. point a single
branch at `4b3bcd43…`, delete all other local and remote-tracking refs and tags,
expire the reflog, then filter. Add an assertion after filtering that no
retained commit has a committer date later than the source commit's, or more
robustly, that the pre-filter ref set was exactly one ref at the source commit.

This also matters for R1-F001's boundary commit: without ref pinning there is no
well-defined bootstrap boundary.

### R1-F003 — Contributor audit scope is narrower than the retained boundary

Task 1 Step 2 runs the contributor audit over `scripts/review` only:

```bash
git -C ai-peer-review log --format='%an <%ae>' -- scripts/review | sort -fu
```

but Step 3 retains `scripts/providers/`, `scripts/tests/**/*co-review*`,
`docs/superpowers/specs/*co-review*`, and `docs/superpowers/plans/*co-review*`
as well. The spec's licensing gate is about the copyright status of everything
that ends up in the Apache-2.0 repository, not just the review engine. A
third-party contribution in `scripts/providers` — which is exactly where
vendor-adapter code tends to attract outside patches — would pass this audit
undetected and then be relicensed.

The spec quotes the `scripts/review` command as the *recorded* audit command
because that is the audit it performed, but its normative sentence is broader:
"any newly discovered contributor or third-party material blocks publication".
Run the audit over the full retained path set (the same list Step 3 filters on),
record both the command and its normalized result in the manifest, and make the
"stop this task" condition apply to the union.

While here: `$APR_AUDIT_DIR/retained-paths.txt` is produced in Step 2 and then
never used by any later step or by `verifyExtraction`. Either wire it into the
manifest as recorded evidence or drop it — as written it implies a check that
does not happen.

### R1-F004 — Lifecycle table contradicts the spec on reclaim and replacement

Task 4 Step 1 states:

> `turn-claimed`, `same-session-reclaim`, `identity-changed`, … update
> projections **without changing lifecycle state**.

The spec's lifecycle block says the opposite for two of these:

```text
intervention-required(stale-claim) -> same-session reclaim -> role turn
intervention-required(participant-loss) -> signed participant replacement -> role turn
```

Both edges leave `intervention-required` and re-enter a role turn. Under the
plan's rule as written, a review that entered `intervention-required(stale-claim)`
can never leave it via reclaim — the only modelled exits from
`intervention-required` in the `allowed` table are `continued-to-reviewer`,
`continued-to-author`, `override-committed`, `override-sealed-no-commit`, and
`abandoned`. The stale-claim recovery path therefore has no terminal or
continuing edge, and Task 5 Step 4 ("Same-fingerprint reclaim appends
`same-session-reclaim` without advancing protocol revision") plus Task 10 Step 3
(participant replacement) inherit the contradiction.

Note this is genuinely subtle, because two different properties are being
conflated: *not advancing the protocol revision* (correct for reclaim, and
required by the spec's intervention-freeze rule) and *not changing lifecycle
state* (incorrect — it must exit intervention). Separate them explicitly in the
event schema and in the reducer, and add both edges to the `allowed` table:

```js
['intervention-required', 'same-session-reclaim', /* prior role turn */],
['intervention-required', 'participant-replaced', /* prior role turn */],
```

with a test asserting the resumed state is the role turn that was interrupted,
not a fixed one. Also add a negative test that reclaim from a *non*-intervention
state leaves lifecycle state untouched, which is what the current prose was
presumably reaching for.

### R1-F005 — The closed flag catalog is undefined, so Task 2's parser is untestable

Task 2 Step 3 requires `parseCommand` to be implemented "from a frozen
command/flag catalog" and to reject unknown flags. Task 2 Step 1 pins the closed
*command* catalog exactly (15 commands, matching the spec). No task ever pins
the flag catalog.

Concretely, the following flags are required by the spec or by later plan tasks
but appear nowhere the parser can be built from:

- `start`: `--max-turns`, `--claim-ttl`, `--reviews-root`,
  `--review-path-template`, and whatever carries the opaque issue ID. The plan's
  own syntax golden (Task 8 Step 3) collapses all of these to
  `[configuration]`, and Task 8 Step 1 asserts defaults for "reviews root, path
  template, ten turns, eight-hour claim TTL" without naming the flags that set
  them.
- `request-grant`: `[action parameters]` — but Task 6's
  `GRANT_PARAMETER_FIELDS` requires ten distinct parameters for `pin-verifier`
  alone. The parser must accept all of them, per action, with per-action
  validity.
- `submit`: `--no-artifact-change` and `--reason` (see R1-F010).
- `status`: `--json` and `--next`; `help`/`explain`: `--json` (see R1-F013).

Task 2 is scheduled before Task 8, so an executor reaching Task 2 Step 3 has no
authority to build the frozen catalog from and will invent one, which the Task 8
help goldens will then contradict.

Add the complete flag catalog to Task 2 Step 1 as a single frozen table keyed by
command — the same treatment `GRANT_PARAMETER_FIELDS` gets in Task 6 — and make
Task 8's help golden authority derive from it rather than restating it.

### R1-F006 — Task 15's AITM commits will be rejected by AITM's own lint gate

Task 15 Step 6 commits into the AITM repository with:

```bash
git commit -m "feat: consume standalone peer review package"
```

AITM enforces a subject-line lint gate requiring every `/task`-workflow commit
to lead with a `[#N]` issue-ID token (`\[#(\d+)\]`), because downstream
attribution — `commit-trace`, `review-preflight`, and `close` — locates a
deliverable by grepping that token rather than by SHA reachability. The proposed
subject has no token, so the commit is refused, and even if forced through, the
migration would be invisible to attribution.

Task 15 needs to state that an AITM tracking issue is created for the migration
and that its commits carry `[#N]`. This also has a sequencing consequence the
plan should acknowledge: Task 15 executes inside AITM's governed workflow, so it
is subject to AITM's stage gates and its Develop-phase verification contract
(`node scripts/task-tracker/verify-develop.mjs`, not `npm run test:all`), while
Task 15 Step 6 currently prescribes `npm test` plus `npm run test:slow` directly.
Reconcile Step 6's command list with AITM's actual per-stage contract, or state
explicitly that Task 15 runs as a Test-stage verification rather than a Develop
commit.

### R1-F007 — The secret scan is a required gate with no implementation

The spec is explicit:

> Before publishing the new history, scan every retained commit for credentials,
> private data, generated runtime state, and unrelated AITM content.

The plan carries this into `verifyExtraction` as an injected `scanSecrets(root)`
and into the manifest as `"secret_scan": { "tool": null, "result": "pending" }`.
Nothing in Tasks 1–14 ever selects the tool, runs it, or flips `result`. Task 1
Step 6 runs `node scripts/verify-extraction.mjs` — a CLI entry point whose
composition root is never described, so it is unspecified what `scanSecrets` is
bound to there. Task 14 Step 4's `verify-release.mjs` requires "the extraction
verifier is clean" but does not require `secret_scan.result` to be a pass.

The same is true of `"contributor_audit": []`, which R1-F003 shows is never
populated, and of `relicensing_declaration_digest: null`, which Task 1 Step 6
says to record but which no verifier asserts is non-null except by the prose in
Task 1 Step 5.

Pick the scanner (note the zero-*runtime*-dependency constraint does not forbid
a devDependency or an external tool invoked by `scripts/`), name it in Task 1,
add a step that runs it and writes the result, and make both
`verify-extraction.mjs` and `verify-release.mjs` fail closed on
`result !== "pass"`, an empty `contributor_audit`, or a null declaration digest.
Right now three of the four provenance fields the spec treats as the publication
gate are decorative.

### R1-F008 — Task 6's integration tests depend on Task 8, and no workspace fixture exists

Task 6 Step 4 wires `peer-review request-grant <workspace> --action …` and Task 6
Step 2 writes `test/integration/authority.test.mjs` asserting "exact review,
intervention ID, revision, action, parameters digest, nonce, expiry, verifier,
and signer binding". A `<workspace>` with a review ID, a revision, and an
intervention only exists after `start` (Task 8) and, for intervention, after
budget exhaustion (Task 10).

The plan provides `test/helpers/repository-fixture.mjs` (Task 3) for temporary
Git repositories, but never a protocol-workspace fixture — something that
synthesizes `events.jsonl`, `protocol.json`, and `participants.json` at an
arbitrary lifecycle state. Without it, Task 6, Task 7 (`sealResponse(review, …)`),
and Task 9 (`submitReviewTurn`) all need a workspace they cannot yet create, and
an executor's most likely response is to reorder tasks or hand-roll three
incompatible fixture builders.

Add `test/helpers/review-fixture.mjs` to Task 4 — it belongs with the reducer,
since it should build workspaces by *appending real validated events* rather than
by writing projection files, which also gives Task 4's projection-rebuild test a
second consumer. Then make Tasks 6, 7, 9, 10, and 11 list it under Consumes.

Related, smaller ordering slip: Task 7's Interfaces section lists Consumes as
"Task 3 path resolver and Task 5 normalized identity", but Step 4 appends a
sealed-response event, which is Task 4. Task 12's `finalizeReview` sketch calls
`sealHumanDecision` and `pathsToSeals`, neither of which appears in any task's
Interfaces.

### R1-F009 — `npm test` scope is undefined and the smoke suite is never run

Task 2 Step 1 defines `test`, `test:unit`, `test:integration`, `test:packaging`,
`format`, `format:check`, and `lint`. It never says what `test` covers. The Task
14 Step 5 Phase 1 gate then runs:

```bash
npm test
npm run test:integration
npm run test:packaging
```

There is no `test:smoke`, no `test:golden`, and no `test:mcp` script. So:

- `test/smoke/cli.test.mjs` (created in Task 14 Step 1) is never executed by any
  gate in the plan, despite the spec listing "macOS, Linux, and Windows smoke
  tests for installation, setup dry-run, `npx ai-peer-review --help`, start,
  join, one revision triad, and acceptance" as a Phase 1 suite requirement and
  AC 19.
- `test/golden/**` is presumably swept up by `test:unit`, but that is an
  inference an executor should not have to make.
- Task 17's Phase 2 gate runs `test/mcp/*.test.mjs` by explicit path, then also
  runs `npm test` — whether `test` now includes MCP is undefined, and if it does,
  Phase 1's "no Phase 1 test starts an MCP server" assertion becomes
  order-dependent.

Pin each script's glob in Task 2 Step 1, add `test:smoke`, and make Task 14 Step
5 and Task 17 Step 5 run named scripts rather than a mix of scripts and raw
globs. Task 14 Step 2's CI matrix should run the same named scripts so local and
CI gates cannot drift.

### R1-F010 — `--no-artifact-change --reason` is absent from the help golden authority

Task 9 Step 5 requires author submit to accept "either changed artifact or
explicit `--no-artifact-change --reason`", matching the spec's Git Ownership
section. Task 8 Step 3 declares its syntax block "the help/parser golden
authority" and it reads:

```text
peer-review submit <workspace> [--decision revisions-requested|accepted]
```

Task 8 lands before Task 9, so the help goldens will be written without those
flags and Task 9 will have to break them. Worse, Task 2's frozen flag catalog
(R1-F005) will reject `--no-artifact-change` as `APR_USAGE`.

The spec's own CLI Contract block has the same omission, so this is an inherited
defect rather than a divergence — but the plan is where it becomes executable,
and the plan is where it should be fixed. Add both flags to the Task 8 syntax
block and to the Task 2 catalog, and add a Task 8 Step 3 assertion that every
flag in the frozen catalog appears in exactly one help topic (which would have
caught this class of drift automatically).

### R1-F011 — The historical-AGPL disclosure requirement has no covering step

The spec states a specific, non-obvious obligation:

> Those rewritten historical trees remain available under the original
> AGPL/commercial terms; they are not silently presented as Apache-licensed
> historical releases.

Task 1 Step 6 says to install "the complete Apache-2.0 `LICENSE`, accurate
`NOTICE`, and Apache contribution statement in `CONTRIBUTING.md`" and to "add
SPDX headers or `docs/spdx-policy.md`". "Accurate" is doing all the work.
Nothing requires the NOTICE or README to state that commits before the bootstrap
commit are AGPL/commercial-licensed AITM history, and nothing tests for it.

This is the one part of the relicensing boundary that a reader of the published
repository can get wrong by default: `git log` will show the Apache LICENSE at
HEAD and AGPL trees behind it with no explanation.

Add to Task 1 Step 6 an explicit requirement that NOTICE (and README) name the
bootstrap commit and state the licensing split, and add a golden or unit
assertion — Task 14's packaging test is a natural home, since NOTICE ships in the
tarball. Two smaller items in the same step: `docs/spdx-policy.md` is named in
the prose but missing from the task's Files list, and the step says to "replace
the filtered root licensing files" without saying that `LICENSE-COMMERCIAL` is
*removed* from HEAD rather than replaced.

## Required changes

1. **R1-F001** — Rescope `verifyExtraction` to a recorded bootstrap boundary so
   the Task 14 Phase 1 gate and `verify-release.mjs` can pass; tighten the three
   directory-level prefixes to match the actual filter globs.
2. **R1-F002** — Pin refs to the source commit before `filter-repo`, and assert
   the extracted history contains nothing later.
3. **R1-F003** — Widen the contributor audit to the full retained path set;
   record the command and normalized result in the manifest, or drop the unused
   `retained-paths.txt` artifact.
4. **R1-F004** — Add `same-session-reclaim` and `participant-replaced` as
   lifecycle edges out of `intervention-required`, and separate
   "non-revision-advancing" from "non-state-changing" in the event schema.
5. **R1-F005** — Pin the complete per-command flag catalog in Task 2 Step 1 and
   make Task 8's help golden derive from it.
6. **R1-F006** — Give Task 15 an AITM tracking issue and `[#N]` commit subjects;
   reconcile Step 6's verification commands with AITM's per-stage contract.
7. **R1-F007** — Select and run the secret scanner; make the extraction and
   release verifiers fail closed on `secret_scan`, `contributor_audit`, and
   `relicensing_declaration_digest`.
8. **R1-F008** — Add an event-built review-workspace fixture in Task 4 and list
   it as a dependency of Tasks 6, 7, 9, 10, and 11; correct Task 7's Consumes
   list and define `sealHumanDecision` / `pathsToSeals`.
9. **R1-F009** — Define each npm test script's scope, add `test:smoke`, and make
   both phase gates and CI run named scripts.
10. **R1-F010** — Add `--no-artifact-change` / `--reason` to the syntax golden
    and flag catalog; add a catalog-to-help-topic coverage assertion.
11. **R1-F011** — Require and test an explicit historical-license statement in
    NOTICE/README; add `docs/spdx-policy.md` to Task 1's Files; state that
    `LICENSE-COMMERCIAL` is removed from HEAD.

## Optional suggestions

### R1-F012 — `src/cli/run.mjs` is unowned and is a hot file across eight tasks

Task 2 Step 4 creates `src/cli/run.mjs`, but Task 2's Files list only names
`src/cli/parse.mjs`; every later task lists it as "Modify". The plan's Final
Spec-Coverage Gate asks to "verify all target paths are owned by exactly one
task", which this fails. Add it to Task 2's Create list.

Separately: Tasks 6, 8, 9, 10, 11, 12, 13, and 16 all modify it. The plan header
recommends `superpowers:subagent-driven-development`, which implies parallel
execution — this file is a hard serialization point and should be called out as
such, or the command handlers should be split into per-command modules with
`run.mjs` reduced to a dispatch table populated by a registry.

### R1-F013 — Help invocation forms are not in the golden authority

The spec's Agent-Queryable Help section lists nine forms, including
`help --all`, `help search <term>`, `help submit --json`, `status --json`, and
`status --next`. Task 8 Step 3's golden authority block is the CLI *command*
syntax, which covers none of the help sub-forms. Task 8 Step 3's prose does
require golden tests for "top-level and every command topic" and asserts JSON
purity, so the intent is present, but `help search` and `help --all` in
particular are distinct behaviors that need their own assertions.

### R1-F014 — Finding-ID parsing scope for optional suggestions is ambiguous

The spec says "Optional suggestions that may later be overridden use the same ID
grammar" — so an `accept-over-objections` grant's `unresolved_finding_ids` may
name an ID that lives under `Optional suggestions`, not `Findings`. Task 7 Step 2
says to "parse only headings matching `^### R<reviewer-turn>-F<three digits> — …$`"
without saying which sections are scanned, and Task 7 Step 1 lists `Findings` and
`Optional suggestions` as separate top-level sections. Make the scan scope
explicit (both sections, one ID sequence, no renumbering across them) and add a
test that an optional-suggestion ID can appear in a human decision.

### R1-F015 — The spec's `src/templates/` directory is silently dropped

The spec's package layout lists both `src/templates/` and top-level `templates/`.
The plan keeps only `templates/` plus `src/collateral/templates.mjs`. This is
almost certainly the better resolution — the spec's listing looks like a
duplication slip — but since the spec is ratified, the plan should say it is
deliberately consolidating rather than leave the reader to notice the difference.

### R1-F016 — Directory-wide `git add` in commit steps

Task 3 Step 6 (`git add … test/unit`), Task 10 Step 6 (`git add src/protocol
src/cli/run.mjs test/integration`), and Task 17 Step 6 (`git add … test`) stage
whole directories. Given the plan's own emphasis on exact-path commits in the
product being built, and given that Tasks 10 and 12 both touch
`src/protocol/service.mjs`, these will sweep in unrelated in-progress work.
Enumerate the files, as the other tasks do.

### R1-F017 — The canonical grant-parameter byte prefix is a new decision

The spec says `parameters_digest` is "SHA-256 over UTF-8 bytes of
`ai-peer-review.grant-parameters/v1` canonical JSON" — ambiguous as to whether
the schema string is part of the hashed bytes. Task 6's golden vector resolves it
by prefixing `ai-peer-review.grant-parameters/v1\n` to the JSON. That is the
right call (domain separation), but it is a design decision the plan is making,
not restating; flag it as such so it survives review of the plan rather than
being discovered during implementation.

### R1-F018 — Task 17's AITM follow-up has no files or verification

Task 17 Step 6 ends with "Then update AITM's exact dependency version and parity
test; do not add a second AITM command surface or remove manual recovery." No
AITM paths appear in Task 17's Files list and no AITM verification command
appears in its gate — unlike Task 15, which models this properly. Either add the
AITM paths and commands to Task 17 or split the `0.2.x` AITM bump into a Task 18.
The same step also does not re-run `scripts/verify-release.mjs`, which Task 14
established as the publication gate.

### R1-F019 — Node matrix tests only 22

Task 14 Step 2 runs "Node 22 on current Ubuntu, macOS, and Windows". The spec
says "Node.js 22 or later", and AITM itself prefers Node 25 for cloud
environments — where, per prior experience in this repository, bare-directory
`node --test` invocations behave differently. Testing only the floor version
means a consumer on 24/25 is untested. Consider 22 plus current-LTS across the
three platforms, or at minimum 22 and current on Ubuntu.

### R1-F020 — The zero-install naming rule has no test

The spec treats `npx ai-peer-review` vs `npx peer-review` as a security matter
(dependency confusion with an unrelated package) and states the project "must
never instruct users to run `npx peer-review` before a local installation is
confirmed". Task 7 Step 1 requires templates to document both forms "safely" and
Task 13 Step 3 requires the skill to avoid AITM assumptions, but no golden test
asserts the rule. A single assertion across templates, help topics, the skill,
and README — that any `npx peer-review` occurrence is accompanied by an
install-confirmed qualifier, or simply that generated recovery commands only ever
emit `npx ai-peer-review` — would make this enforceable rather than aspirational.

## Decision

`revisions-requested`

The plan's structure, TDD discipline, and Phase 1 / Phase 2 isolation are sound
and I do not think any task needs to be rewritten wholesale. Eleven required
changes stand between this and executable: two of them (R1-F001, R1-F002) mean
the extraction and release gates cannot currently succeed, one (R1-F004) is a
direct spec contradiction, and the rest close gates that the spec declared
load-bearing but the plan leaves inert.
