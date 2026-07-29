---
name: reference-ensurechecked-no-positional-issue
description: ensureChecked/ensureUnchecked take NO positional issue number — they use the bound active issue; a leading number gets folded into the label and silently fails to match.
metadata:
  node_type: memory
  type: reference
  originSessionId: fbec1e5d-b30e-4691-931c-52312b6cd381
---

`ensureChecked "<label>"` (and `ensureUnchecked`) operate on the **bound active
issue** (`s.active`), NOT a positional issue number. There is no issue-number
argument.

Passing one — e.g. `ensureChecked 823 "Final Review Passed"` — makes
`parsed.positional.join(' ')` produce the label `"823 Final Review Passed"`,
which `setChecklistLine` cannot match. It fails with
`checkbox "823 Final Review Passed" not found`, then dumps every checkbox
(including the real `"Final Review Passed"`), which looks like a matcher bug but
is actually the swallowed number. Symptom: the target label appears verbatim in
the "Checkboxes found" dump yet is reported "not found".

Correct form: `/task ensureChecked "Final Review Passed" --allow-unverified-ticks`
(bind the issue first via `start <N>`). Matching is marker-stripped +
whitespace-collapsed exact (`stripMarkers` in [[reference_vc_list_cmd_consumer_parity]]'s
ac-evidence.mjs), so the label must otherwise be exact. See also
[[feedback_full_auto_tick_review_box]].
