# Quote-Aware Reviewer Handoff Design

Issue: #1367

## Problem

The reviewer co-review classifier rejects every raw shell metacharacter before it parses quotes. Claude's terminal #939 handoff therefore failed when its single-quoted `--message` contained `(F-001)`, even though those parentheses were inert shell data. Removing the parentheses made the otherwise identical handoff succeed.

The current behavior is fail-closed but too coarse: it conflates characters that participate in shell syntax with the same characters carried safely inside a quoted argument.

## Decision

Make the classifier's existing single-command tokenizer quote-aware when it evaluates shell-sensitive characters.

- Reject control characters everywhere.
- Reject shell composition, redirection, globbing, grouping, substitution, and expansion characters when they occur outside quotes.
- Inside single quotes, treat every character except the closing single quote as literal message data, matching shell semantics.
- Inside double quotes, allow inert prose punctuation but continue rejecting expansion-capable `$` and backticks. Preserve the existing conservative escape handling.
- Continue rejecting unterminated quotes or escapes.
- After tokenization, retain the exact `npx aitm co-review` entrypoint, closed subcommand grammar, unique known flags, literal path rules, and accepted decision values.
- Retain live provider/session grant matching and the co-review CLI's protocol integrity and mutation checks unchanged.

This changes only lexical recognition of one literal command. It does not grant reviewers another command, path, actor, session, protocol, or mutation capability.

## Evidence

Claude session `2febfe2d-d333-4255-a8a8-633a2f8af9e4` records the rejected command and the guard result `reviewer mutation destinations are incomplete or ambiguous`. Its message was:

```text
review complete: accepted with 4 refinement findings (F-001 squash token completeness is the only load-bearing one)
```

A metacharacter-free control message succeeded. Direct classification on current trunk reproduces the failure for both single- and double-quoted parentheses.

## Alternatives Rejected

### Add `--message-file`

This would avoid inline shell prose but adds a new CLI/protocol input and reviewer-writable artifact. The existing inline message is safe when lexed according to its quote context, so the extra surface is unnecessary.

### Globally allowlist prose punctuation

Allowing parentheses or other characters without quote context would admit active shell syntax outside arguments and remain brittle as reviewers use new punctuation. The authorization boundary must follow lexical context, not a growing character list.

## Testing

Test first at three boundaries:

1. Classifier tests accept Claude's exact single-quoted message and a double-quoted inert-punctuation message.
2. Adversarial classifier tests continue rejecting unquoted composition/grouping, command substitution, variable expansion, redirection, globs, malformed quotes, wrappers, and extra commands. Single-quoted expansion-looking text is accepted only as inert data.
3. The real guard-to-CLI boundary test uses punctuation in the reviewer message, passes the Bash guard, reaches terminal accepted state, and verifies the exact message persisted. Existing denied-command cases remain denied.

Update generated reviewer guidance to say that ordinary quoted prose is supported while dynamic shell expressions and composed commands remain blocked.

## Scope Boundaries

- Do not alter either terminal #939 runtime.
- Do not broaden reviewer file-write authority.
- Do not change provider/session binding, role identity, protocol locking, integrity checks, archive semantics, or acceptance semantics.
- Treat the unrelated non-blocking Claude hook bootstrap quoting error visible in the transcript as separate follow-up work, not part of #1367.
