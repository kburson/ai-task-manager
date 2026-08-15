<!-- cspell:words syscall -->

# Reviewer Review R6 — Co-Review Finalization and Turn-Budget Control

**Reviewer:** claude

**Artifact:** `docs/superpowers/specs/2026-08-15-co-review-finalization-and-turn-budget-control-design.md`

**Reviewed commit:** `954b3df325e791ef0628d1922056f3c0f38eb326`

**Answered owner response:** `.tmp/1268-expanded-design-review/r5-codex-response.md`

**Decision:** accepted

## What Was Inspected

- The full diff `e35537d..954b3df` of the design artifact, read hunk by hunk.
- The owner response `r5-codex-response.md` in full, checked against the text that
  landed.
- The two R4 findings re-verified against the underlying platform behavior they
  concern: POSIX `rename(2)` directory semantics and Node's lack of a
  no-replacement directory rename.

## Verification of R4 Dispositions

**F-016 — resolved.** The design no longer asserts a guarantee the syscall does not
provide. The three cases are now separated correctly: a destination present at
preflight, including an empty directory, is validated and conflicts unless it is the
complete byte-identical archive; a non-empty racing destination produces the
platform `ENOTEMPTY` refusal, after which the losing caller validates for
byte-identical idempotent success or conflict; and the one genuinely unprotected
case — an external actor creating an empty destination strictly between preflight
and rename — is named, bounded by the observation that no co-review finalization
caller creates an empty destination, and explicitly treated as equivalent to an
absent destination. That is the honest resolution rather than a restated guarantee.
The validation strategy now pins all three cases, including the injected
post-preflight empty-destination replacement, so the narrow race is a tested
decision rather than an unexamined gap.

**F-017 — resolved.** The manifest region now has one exact wrapper grammar,
specified byte by byte in order: start marker, LF, opening ` ```json ` fence, LF,
canonical JSON ending in LF, closing fence, LF, end marker. The relationship is
stated unambiguously — the HTML comments delimit the region and the fence is its
single child container — and the parse contract is explicit: locate the unique
marker pair, require that wrapper, extract only the bytes inside the fence. Combined
with the existing fixed key order, fixed list order, LF endings, and the prohibition
on invocation-time values, byte-exact regeneration and retry comparison are now
fully determined.

The added `cspell:ignore ENOTEMPTY` directive is consistent with the design's own
position that the host repository owns document governance.

## Standing Assessment

Across three reviewer rounds, seventeen findings were raised and all seventeen are
resolved in the text. The blocking items from the first round — the zero-turn state
invariant that the shipped validator would have refused, the non-normative
owner-handoff transition that deadlocked a claimed reviewer turn against
`budget-exhausted`, and the undefined exit code after an irreversible acceptance
whose publication failed — are each fixed with a state-only rule and a matching
test, not a narrative patch.

Several dispositions improved on what I proposed. Using `set-max-turns --max-turns
<N>` instead of positional arity avoids a parser exception in a CLI that currently
rejects every positional token and aligns the numeric option across `init`,
`set-max-turns`, and `continue`. Ignoring the deprecated `--approved-by` value
rather than requiring it to equal the resolved login preserves the shipped
friendly-name example without treating it as authentication. Making the continuation
minimum role-dependent solves the legacy good-enough recovery path in one rule
rather than a documented two-command sequence.

The design is internally consistent, implementable against the shipped
`protocol.mjs`, `co-review.mjs`, and `help.mjs`, honest about its two deliberate
regressions — fail-closed forward incompatibility for stale installs and a hard
`gh` dependency on the recovery path — and backed by a validation strategy that
names the specific edge cases rather than restating the happy path.

No remaining concerns require owner disposition.
