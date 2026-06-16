# #423 — `aitm-verified cmd` placeholder/prose validation

**Status:** complete (2026-06-16)
**Type:** defect analysis + fix
**Trigger:** a malformed declaration was observed on closed epic #328 —
`cmd="`gh issue view <child> --json state` returned CLOSED"` — carrying an
unsubstituted `<child>` placeholder and trailing prose (`returned CLOSED`).
This doc records the writer-path investigation (AC1) and the chosen fix
decision (AC2). The full code change lives behind AC3–AC6 (test-verified).

## Summary

No code path produces a malformed `cmd` value. The corruption observed on #328
was hand-authored by an agent ticking epic ACs under full-auto, written straight
into the body through `mutateIssueBody`, bypassing every serializer. The fix is
validate-at-write at the body-write choke point: a pure predicate
`validateDeclarationCmd(cmd)` plus a diff-based `mutateIssueBody` invariant
`findNewMalformedVerifiedCmds(before, after)` that refuses a write introducing a
newly-malformed declaration, while leaving pre-existing corruption and the
corpus migration untouched.

<!-- AC1-anchor: writer-path-identified -->

## AC1 — Writer path identified

Every code-emitted `aitm-verified cmd="…"` declaration funnels through one
serializer: `serializeProofMarker(props)` in
`scripts/task-tracker/lib/proof-marker.mjs:42`. Two declaration writers call it:

- `buildMarker(commands)` in `scripts/task-tracker/lib/evidence-markers.mjs:137`
  — backtick-wraps already-parsed Verification-Command strings via
  `serializeProofMarker({ cmd: commands.map((c) => \`\`${c}\`\`).join(' ') })`.
- `buildProofMarker` in `scripts/task-tracker/lib/auto-tick-verified.mjs:62` —
  passes a single command or a comma-joined bare list
  (e.g. `npm run lint, npm run format:check`).

`scripts/task-tracker/heal-functional-dod.mjs` emits literal backticked
commands; `verbs/ac-stamp.mjs` RUNS the declared verifier and stamps a canonical
command. None of these can emit a `<placeholder>` token or trailing prose —
every input is a real command string.

The malformed value on #328
(`cmd="`gh issue view <child> --json state` returned CLOSED"`) was therefore NOT
produced by any code path. It was hand-authored by an agent driving the epic's
AC ticking under full-auto, written directly into the body through
`mutateIssueBody`, which bypasses every serializer. The `<child>` placeholder and
the `returned CLOSED` prose are exactly the two corruption signatures the #421
corpus sweep already strips from historical bodies
(`scripts/task-tracker/corpus-marker-transforms.mjs` discriminator). The live
source of new corruption is the unguarded body write, not the serializer.

<!-- AC2-anchor: decision-validate-at-write -->

## AC2 — Decision: validate-at-write

- **`won't-fix` rejected:** the marker grammar is load-bearing
  (`hasVerifiedDeclaration` gates AC ticking), so a non-command in `cmd` is a
  real defect, not cosmetic.
- **`prevent-future-only` at the serializer rejected:** it would miss the actual
  source (hand-authored markers bypass `serializeProofMarker`), and
  unconditionally throwing inside the generic serializer would break the corpus
  re-serialization at `corpus-marker-transforms.mjs:326`, which legitimately
  re-emits historical (possibly malformed) markers during migration.
- **Chosen: validate-at-write at the body-write choke point.** A pure, exported
  predicate `validateDeclarationCmd(cmd)` in `proof-marker.mjs` returns a reason
  string when a `cmd` value (a) contains an unsubstituted `<…>` placeholder
  (`/<[A-Za-z][^<>]*>/`), or (b) carries prose outside its backtick spans (strip
  all backtick groups; any non-whitespace remainder is prose). A diff-based
  invariant `findNewMalformedVerifiedCmds(before, after)` in `body-invariants.mjs`
  flags only declarations malformed in `after` that were not already malformed in
  `before`; `mutateIssueBody` refuses such a write with a
  `MalformedDeclarationCmdError` (mirroring `CheckboxProofMissingError`).

The diff-based shape ensures pre-existing corruption in `base` never blocks a
later legitimate edit, and the corpus migration (which never routes through
`mutateIssueBody`) is untouched. The predicate accepts every legitimate form:
bare commands, comma-joined bare lists, space-separated backtick groups,
`derive:…` forms, and canonical `ac-stamp` commands.
