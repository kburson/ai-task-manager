# Spike deliverable publication

Use `npx aitm spike-deliverable <N> --from-comment <id|url>` to attach an existing report to an open spike in Develop. The report must be a nonempty current comment on that exact repository and issue, written by the authenticated human owner. A comment edited before invocation is supported; a change during publication refuses.

Bind and resume the spike through the native task workflow. Confirm its recorded source worktree and branch, active unpaused timer, singleton ownership, and matching Develop board/body state. Keep tracked and indexed source clean. The operation observes actual HEAD and requires it to remain unchanged throughout the invocation. The observed source SHA is diagnostic: the deliverable marker retains the existing URL/timestamp format and grants no source acceptance.

```sh
npx aitm spike-deliverable 123 --from-comment 456
npx aitm spike-deliverable 123 --from-comment https://github.com/owner/repository/issues/123#issuecomment-456
```

The writer validates the current report and native authority again around the governed fresh-base issue-body transaction. It preserves unrelated content, comments and history. Exactly one valid existing marker for the same URL is a byte-preserving no-op, retaining its original timestamp. A different URL, malformed or duplicate marker claim, ambiguous Progress Markers section, stale report, ownership loss or source movement refuses. Exit status is zero for verified publication or no-op, two for usage errors and one for runtime or authority refusal.

A refusal after a remote write can leave a genuine marker in place. Preserve that evidence, inspect the issue body and current report, and use a fresh native assessment before deciding whether retry is appropriate. The command never edits or posts the report. It does not change issue kind or state.

Publication is only the deliverable input to the existing no-commit workflow. Qualify the actual source through native Test and Review, obtain the required approval, then use native delivery and Close. Their accepted-source and receipt checks remain mandatory. Epic reconciliation remains epic-only.

For #2146, this guide describes the delivered interface, not permission to activate it. Its owner must separately qualify an approved installed runtime against the original spike's native source, binding, timing and history, following the scoped-install precedent where applicable. Production tests for #2156 do not constitute live host qualification or retroactive evidence for #2146. Preserve the original issue, report and source history through that separate activation.
