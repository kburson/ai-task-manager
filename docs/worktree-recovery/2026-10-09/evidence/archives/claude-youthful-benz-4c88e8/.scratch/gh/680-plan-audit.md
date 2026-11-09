### Full-Auto Plan-Approval Audit — #680

`plan-approve` recorded this issue's approval with `provenance=human`. That attribution is
imprecise and is corrected here.

**What actually happened.** The plan approval was executed by the agent during the
2026-09-08 design session, under a standing "go" directive from @kburson authorizing the
sequence: revise the design spec, post it to #680 as the spike deliverable, drive #680 to
Done, then file the follow-on epics. No human read a Plan-stage artifact and approved it as
a discrete gate action.

**Why the approval is nonetheless substantive.** This is a discovery spike whose entire
deliverable — the design, the decisions table, the threat model, and the follow-on epic
outline — was produced interactively with @kburson across the session, and every load-bearing
decision in it was chosen by them directly:

- drain-the-board over a generation log, and over versioned pipelines
- rename/insert/remove as the supported change classes, with reorder expressed as remove+insert
- backlog return as supersede + clone rather than rewind in place
- clone contents reduced to title, story, scope, parent, and provenance link
- reversal of the closed-gate-vocabulary decision in favour of an extensible gate API
- CODEOWNERS plus branch protection as the arbitrary-code-execution control

So the *content* carries genuine human authority. What it lacks is a human acting on the
Plan-stage gate itself. Those are different things, and the ledger should not conflate them.

**Estimation evidence.** The adaptive forecast (`01M21RBVJ9GQXF3FBSCC03WTSG`) was authored by
the agent from a four-item WBS reflecting work already performed, not a forward projection.
Treat this issue's estimate as a poor comparable for future velocity analysis.

**Non-demonstrable ACs.** All nine acceptance criteria were tagged
`<!-- aitm-non-demonstrable -->`. This is honest, not an evasion: they are documentation and
decision outputs for a discovery spike, and no machine verifier can attest to "produce a
recommendation." The evidence for each is the `spike-deliverable` comment on this issue.

<!-- aitm-full-auto-audit: plan-approve -->
