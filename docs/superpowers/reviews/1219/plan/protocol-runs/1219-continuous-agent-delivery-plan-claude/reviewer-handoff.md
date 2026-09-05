# Co-Review Reviewer Handoff

You are the configured reviewer `"claude"`. Preserve role separation: never edit or commit the authoritative artifact. The configured author is `"codex"`.

## Authority and recovery

- Repository root: `"/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation"`
- Worktree: `"/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation"`
- Branch: `"cloud-test-automation"`
- Protocol directory: `".scratch/co-review/1219-continuous-agent-delivery-plan-claude"`
- Absolute protocol directory: `"/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-claude"`
- Protocol ID: `"429f06e0-39d7-4565-b5e3-c42b880ff479"`
- Authoritative artifact: `"docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md"`
- Author identity: `"codex"`
- Reviewer identity: `"claude"`
- Claim provenance profile: `"provider-session/v1"`
- Host issue: 1219
- Artifact kind: `"plan"`
- Archive destination: `"docs/superpowers/reviews/1219/plan"`
- Maximum reviewer handoffs: 10
- Waiting episode: at most 15 separately observed waits of 60 seconds

Run every protocol and repository command from the same canonical physical worktree above, using the shared ignored runtime above. Before each claim and handoff, verify the canonical `HEAD` and clean tracked state. Inter-round changes must be artifact-only changes to the authoritative artifact. Start the turn timer immediately when this handoff opens.

Every claim and handoff resolves exactly one provider-native session key from the current process environment. Keep the same provider/session pair for the whole role turn; the opposite role must use a different pair.

Treat repository and protocol state as authoritative after chat loss or compaction. Reread this entire handoff, then run:

```text
npx aitm co-review status --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-claude
```

An integrity refusal can be transient only during authorized snapshot publication, while a mutation publishes an event and its matching state. If status or wait exits 1 with an integrity diagnostic, run one settled status re-read after the command returns. If that re-read is healthy, continue from its reported state. If the mismatch persists, preserve every protocol file, report the exact diagnostic, and stop. Never steal or delete a protocol lock. Never edit an immutable response, review, supplement, event, manifest, or handoff file.

Response, review, supplement, and archive evidence inputs are Markdown subject to host-repository governance.

## Bounded wait discipline

Run structured status before sleeping so a handoff that is already complete is acted on immediately:

```text
npx aitm co-review status --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-claude --json
```

When that authoritative status says the other role owns the turn, initialize a fresh bounded waiting episode. Make each wait a separate observed tool call:

```text
npx aitm co-review wait --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-claude --actor claude --timeout 60
```

After every call, record `wait cycle N/15`. Each cycle must wait before you run the next structured status check. Exit 3 is an ordinary timeout: run structured status with `--json`, then wait again only while the peer still owns the turn and the cycle count remains. Exit 0 is a wake event: run structured status with `--json`, resolve the immutable peer artifact path from `lastHandoff.artifacts.response.path`, read those exact bytes, and continue only when status assigns this configured role. Exit 2 or a non-integrity exit 1 is a refusal: report the exact diagnostic and stop. For an integrity exit 1, follow the one-time settled re-read rule above. After cycle 15 times out, run structured status, report the exhaustion to the human, and stop without starting another batch. After every successful nonterminal handoff, the role that handed off must initialize a fresh bounded waiting episode.

After compaction, reread this file, run status, and resume from the last visible wait-cycle marker. If the completed count is uncertain, stop and report the ambiguity instead of resetting it.

Accepted is terminal: verify status and stop forever. Intervention-required is a human decision boundary: report status and stop. Do not adjust the budget, continue/refocus, supplement, or finalize good-enough acceptance unless the authenticated human authorizes the existing command. Any refusal or exhausted waiting episode also reports its structured status and stops; never begin an unbounded or silently reset batch.

Starting, routing, or continuing a session is operational routing only; it does not create human semantic approval or an approval marker.

Exit handling: 0 means the requested command completed (or a wait woke); 1 means runtime, Git, integrity, lock, role, or protocol refusal; 2 means invalid usage; 3 is only an ordinary bounded-wait timeout; 4 means acceptance is already durable while archive publication is pending. On exit 4, acceptance is already durable: never repeat the terminal handoff—run the exact printed finalize retry.

## Terminal archive

The repository host configured `"docs/superpowers/reviews/1219/plan"` for this `"plan"` review. After acceptance, including an exit-code-4 publication failure, use this exact explicit finalization command:

```text
npx aitm co-review finalize --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-claude --archive-dir docs/superpowers/reviews/1219/plan
```

An existing complete-identical archive is success. A conflicting or mixed destination is a refusal: preserve every file and report it without rewriting evidence. Only an authenticated human may authorize the separate `--good-enough` path.


## Reviewer turn

Run every protocol and repository command from the canonical worktree above. The co-review claim establishes reviewer provenance; it does not grant or remove ordinary tool capabilities. Use normal repository inspection, test, build, and Bash capabilities under the installed ordinary guards. Preserve role separation: never edit or commit the authoritative artifact or prior evidence. Create only the new review file under the ignored runtime. To write that review file, use a direct file-writing tool: Edit, Write, or apply_patch. Begin without an unrelated bound task and start the turn timer immediately.

Run status, then claim only when the reviewer role is available:

```text
npx aitm co-review claim --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-claude --actor claude
```

Review the exact artifact commit recorded by the author handoff. Read every required supplement. Write a new immutable Markdown review with unique finding identifiers and an explicit accepted or changes-requested decision. When the final allowed review requests changes, you may include optional exhaustion summary evidence.

Write each finding as `[finding:F-001]` using an identifier unique within the review. Acknowledge every required supplement with its exact `[supplement:S-1]` marker. Do not reuse or edit a prior review file.

Use the concrete current review path, reviewed commit, decision, optional summary, and message with:

```text
npx aitm co-review handoff --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-claude --actor claude --review /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-claude/round-N-reviewer-review.md --review-of COMMIT_SHA --decision accepted --message 'review complete'
```

If the lifecycle remains active after a successful handoff, follow the bounded wait discipline above.

For changes requested, replace the decision with `changes-requested`. On the final allowed reviewer handoff, you may additionally provide optional `--summary` with an immutable exhaustion-summary path.
