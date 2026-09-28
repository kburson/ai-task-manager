# Issue 1831: Codex skills read scope

## Purpose and authority

Issue: <https://github.com/kburson/ai-task-manager/issues/1831>.
Source baseline: `a4bab7890f1fa60d85f065882e7eccd9db9b671a`.
Issue body inspected on 2026-09-28 UTC, body version 2.

The AITM Codex Superpowers bootstrap directs agents to mirrored skills under
`~/.codex/skills`. The Bash guard rejects the absolute skill-file paths used by
that bootstrap. Permit these reads while retaining the project existing write
boundary and refusing unrelated Codex data.

This is a bounded defect fix with an explicitly requested written specification
and single-agent review (SAR). SAR acceptance describes specification quality;
it does not record human approval, governed Plan approval, implementation
verification, or independent peer review.

## Existing behavior

`scripts/task-tracker/codex-superpowers.mjs` generates the bootstrap guidance and
mirrors skills into `join(homedir(), ".codex", "skills")`.
`scripts/task-tracker/bash-guard.mjs` derives the home directory with `homedir()`
but only adds `.claude` to its provider read prefixes. It extracts unquoted
absolute path tokens, checks recognized writes first, then checks remaining
paths against `READ_ALLOWED`.

The header and read refusal message describe project-root, Claude-home, and
system reads. The inline read-prefix comment incorrectly also mentions temp.
The guard deliberately blocks system `/tmp` and `/private/tmp` reads and writes.

## Selected change

Derive `codexSkillsDir` from `join(homeDir, ".codex", "skills")` and allow reads
under its directory prefix. Keep the prefix narrow: never add all of `.codex`.
The new allowance must require both the extracted token and its lexical
`resolve()` result to start with `codexSkillsDir + "/"`. Do not add an unchecked
skills prefix to the existing allow list that could bypass this predicate.
Existing allowed roots retain their existing matching behavior. For an otherwise
out-of-scope token, `skills/../auth.json` must remain blocked, while normalization
that stays under skills may pass. Use the already imported path resolver.

This allowance covers extracted absolute descendant paths. The bare skills
directory remains outside the new allowance, consistent with existing provider
root behavior. No HOME-variable, tilde, quoting, symlink, or arbitrary-shell
resolution guarantee is added. The guard remains a lexical command policy;
realpath checks would change its existing nonexistent-path test contract.
Update the header, inline read-prefix comment, and outside-scope read diagnostic
to include `~/.codex/skills/` and retain the existing scratch guidance.

Do not change `WRITE_ALLOWED`, write detection, worktree binding, issue mutation
guards, malformed-input behavior, or fail-closed handling. Existing recognized
write commands targeting the skills directory must remain blocked.

Adding all of `.codex` would expose unrelated configuration and session data.
Removing the bootstrap instruction would discard intended functionality. The
selected narrow read allowance directly resolves the reported defect.

## Acceptance and verification design

Add an issue-tagged subprocess regression suite beside
`scripts/tests/integration/task-tracker/core/bash-guard-tmp-contract.test.mjs`.
Feed the real guard JSON containing `tool_input.command`; simulated commands are
policy input and must never execute. Build paths with the subprocess home
directory and use a dedicated unbound test session, following the existing
path-policy suite binding isolation.

Cover the following observable results:

| Case                                                                   | Expected result                        | Issue criterion |
| ---------------------------------------------------------------------- | -------------------------------------- | --------------- |
| `sed` and `cat` read a nested absolute skills path                     | Allow                                  | AC1             |
| Read an unrelated `.codex/config.toml` path                            | Block                                  | AC1 scope       |
| Read a `.codex/skills-other/SKILL.md` sibling                          | Block                                  | AC1 scope       |
| Absolute skills path escaping via `../auth.json`                       | Block                                  | AC1 scope       |
| Absolute skills path with `sub/../using-superpowers/SKILL.md`          | Allow                                  | AC1 scope       |
| Bare absolute skills directory                                         | Preserve block                         | Regression      |
| Recognized writes through `touch`, `tee`, and redirection under skills | Block                                  | AC3             |
| Recognized writes under `.claude`                                      | Block                                  | AC3             |
| Read an outside-scope path                                             | Diagnostic includes `~/.codex/skills/` | AC2             |
| Existing project scratch, Claude reads, and system reads               | Preserve allow decisions               | Regression      |
| System `/tmp` and `/private/tmp` reads and writes                      | Preserve blocks                        | Regression      |

Allowed results require exit zero and empty stdout. Blocked results require
exit zero and parseable JSON with `decision: block` and the expected policy
reason. A crash, invalid JSON, or missing decision must fail a blocking test.

The implementation must run the new focused suite and existing Bash guard
regressions, then the issue required fast and slow tests, lint, and formatting
checks. No implementation test execution is claimed by this specification.

Name the new suite
`scripts/tests/integration/task-tracker/core/bash-guard-codex-skills.test.mjs`
and include `// @story #1831`. A valid focused command is:

```sh
node --test scripts/tests/integration/task-tracker/core/bash-guard-codex-skills.test.mjs scripts/tests/integration/task-tracker/core/bash-guard-tmp-contract.test.mjs scripts/tests/integration/task-tracker/core/bash-guard-fail-closed.test.mjs
```

The issue initially declared `npm test -- --runInBand bash-guard` as VC1, but
`scripts/run-tests.mjs` rejects `--runInBand`. Before evidence stamping, the
orchestrator must replace that command through sanctioned issue-body tooling,
retaining the AC references to VC1. The full `npm test`, `npm run test:slow`,
`npm run lint`, `npm run format:check`, and commit verifier remain required.

## Delivery boundary

Changes belong to the packaged guard and its regression tests. Consumer-local
patching is not the deliverable. No installer, bootstrap, package dependency,
provider config, release, or issue lifecycle changes are part of the fix.

Shell parsing changes, arbitrary shell evaluation, and a general filesystem
sandbox redesign are out of scope. The existing quote-stripping and lexical
path-scanning limitations remain explicit limits of the guard.
