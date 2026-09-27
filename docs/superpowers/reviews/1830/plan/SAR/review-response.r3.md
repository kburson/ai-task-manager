# Issue 1830 plan: review response r3

- Review method: same single agent; full r2 reread against the live issue and guard entry points.
- Reviewed revision: [r2](plan.r2.md).
- Reviewed SHA-256: `3b72175fa0ff2de6b6b3cefe2a9ea376f8e6800939d7fdc3b6fe4db40d578a51`.
- Verdict: changes required; two P2 findings.

## Closure of the previous pass

R2 addresses SAR-05 through SAR-07: lexical and physical target identities are
retained; command-level Git configuration has an explicit allowlist and trust
boundary; and the root Story Intent section has the required exact heading.
The review checked the complete plan, including all six issue criteria, state
matrix, parser consumers, index inspection, patch handling, and verification.

## SAR-08 — P2: Distinguish absent suffixes from failed ancestry resolution

The ancestry section permits resolving a new file through its nearest existing
parent, then says that missing parents cannot receive the allowance. Those two
rules disagree for a normal new nested document such as
`docs/new-topic/design.md`. They could reproduce the false refusal this issue
is intended to fix.

**Required change:** Allow nonexistent trailing directory components when a
trusted existing directory ancestor has been resolved and all suffix components
are validated. Refuse a broken symlink, an existing non-directory intermediate
component, an inaccessible ancestor, or an escape. State that symlink resolution
is also a preflight snapshot. Include both a legitimate new nested directory
and a broken-link negative fixture.

## SAR-09 — P2: Make invocation input fallback deterministic and test the hook boundary

The directory precedence list does not distinguish an absent input from an
explicit invalid input, or define the base of a relative tool directory. In a
main-process/linked-payload fixture, an implementation can therefore fall back
to the main checkout on a malformed explicit workdir and still appear to follow
the list. The current activity and source-edit entry points also extract patch
text separately from object fields. Parser-only tests cannot establish that an
actual normalized Codex invocation reaches the parser correctly.

**Required change:** Define absent-only fallback and relative directory bases;
invalid supplied fields must refuse the new mutation allowance. Require shared
patch-input extraction with an explicit supported transport contract, and tests
through all relevant hook entry points using the adapter-normalized invocation.
Support legacy object envelopes and a freeform string where actually supplied;
reject conflicting patch fields rather than picking different values in different
guards. Do not attribute the observed hook refusal to a particular transport
shape without a captured payload. Preserve exact text after extraction.

## Next revision

Apply SAR-08 and SAR-09 as r3, preserve this reviewed input, and repeat the full
review. These are planning changes, not implementation evidence or Plan approval.
