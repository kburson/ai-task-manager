# Issue 1830 plan: review response r2

- Review method: same single agent; reread the entire r1 plan against source.
- Reviewed revision: [r1](plan.r1.md).
- Reviewed SHA-256: `9d812c2a6bed1f152a3604114106d8d864c43328a55182ed05b193c691946bb1`.
- Verdict: changes required; two P1 findings and one P2 finding.

## Closure of the previous pass

SAR-01 through SAR-04 are addressed in r1: compound execution is excluded from
the Plan allowance; mutation discovery includes aliases/shells; staged status
and modes are checked separately from broad globs; and Plan edits and commits
have an explicit state matrix and singleton-owner rule. The review then examined
the new contracts and their interactions rather than stopping at those closures.

## SAR-05 — P1: Resolve target ancestry, not only the repository root

A physical Git root does not prove that a lexical `docs/allowed.md` target stays
inside it. An existing symlinked parent can redirect a new file outside the
worktree or into an installed guard. Conversely, resolving an installed package
self-link can erase its lexical `node_modules` ancestry before the current
`isInstalledGuardPath` regular expression sees it. The current helper checks a
string pattern, and activity normalization only canonicalizes the root.

**Required change:** Retain lexical and physical target identities. Validate
existing targets and the nearest existing parent for new destinations, checking
both installed-tree ancestry and physical containment. Apply the decision to all
patch destinations including move/delete paths. Do not resolve a Git-tree
staged path through the working-tree filesystem when classifying index entries.
Add symlink escape, new-child, installed-self-link, and missing-target regressions.

## SAR-06 — P1: Literal Git configuration can still change execution semantics

R1 allows literal configuration and known option arity, but being literal does
not make `-c core.hooksPath=...`, `core.worktree`, injected `GIT_CONFIG_*`, or
content-filter configuration safe for the inspected Plan commit. A value can be
fully parseable while changing the repository or running different hooks. The
explicit same-index selectors also lack a decision for ambient configuration.

**Required change:** Define a small supported command-level configuration set
for the new allowance; reject execution-affecting overrides and unknown keys.
Account for ambient Git selectors/config injection without stripping them and
pretending the original command was checked. State the trust boundary for
pre-existing repository hooks and configuration; do not claim an atomic or
general-purpose shell sandbox. Add harmless-option positive controls and hostile
selector/hook/config-injection negatives.

## SAR-07 — P2: Give the canonical plan its required Story Intent heading

The new file combines Scope and Story Intent under one heading. The canonical
story-intent contract resolves a linked root plan from `## Story Intent`, not
from a heading that merely contains those words. Publishing or later linking
this file must not make its otherwise valid intent unreadable.

**Required change:** Split Scope and Story Intent into their exact root sections,
retain the four substantive labeled bullets, and ensure the issue mirror uses
nested headings beneath the canonical Deep-Dive wrapper.

## Next revision

Apply SAR-05 through SAR-07 as revision r2, preserve this reviewed r1 snapshot,
and repeat the full review. These findings do not authorize runtime edits or
lifecycle approval. Non-Markdown archived protocol state remains outside the
new permission; existing historical copies are not authority to admit machine
state as review evidence.
