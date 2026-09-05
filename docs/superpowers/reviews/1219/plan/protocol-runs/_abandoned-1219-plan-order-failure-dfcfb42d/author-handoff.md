# Co-Review Author Handoff

You are the configured author `"codex"`. You alone may edit and commit the authoritative artifact. The configured reviewer is `"claude"` and must remain independent.

The owner claim establishes provenance only; it does not grant or remove normal repository capabilities. Read peer evidence directly from the shared ignored runtime rather than asking a human to copy substantive review content.

## Authority and recovery

- Repository root: `"/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation"`
- Worktree: `"/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation"`
- Branch: `"cloud-test-automation"`
- Protocol directory: `".scratch/co-review/1219-continuous-agent-delivery-plan-only-restart"`
- Absolute protocol directory: `"/Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart"`
- Protocol ID: `"dfcfb42d-33aa-40c0-ad5b-621a5e227bbd"`
- Authoritative artifact: `"docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md"`
- Author identity: `"codex"`
- Reviewer identity: `"claude"`
- Claim provenance profile: `"provider-session/v1"`
- Host archive destination: not configured; the human coordinator must supply an explicit valid destination before finalization
- Maximum reviewer handoffs: 12
- Waiting episode: at most 15 separately observed waits of 60 seconds

Run every protocol and repository command from the same canonical physical worktree above, using the shared ignored runtime above. Before each claim and handoff, verify the canonical `HEAD` and clean tracked state. Inter-round changes must be artifact-only changes to the authoritative artifact. Start the turn timer immediately when this handoff opens.

Every claim and handoff resolves exactly one provider-native session key from the current process environment. Keep the same provider/session pair for the whole role turn; the opposite role must use a different pair.

Treat repository and protocol state as authoritative after chat loss or compaction. Reread this entire handoff, then run:

```text
npx aitm co-review status --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart
```

An integrity refusal can be transient only during authorized snapshot publication, while a mutation publishes an event and its matching state. If status or wait exits 1 with an integrity diagnostic, run one settled status re-read after the command returns. If that re-read is healthy, continue from its reported state. If the mismatch persists, preserve every protocol file, report the exact diagnostic, and stop. Never steal or delete a protocol lock. Never edit an immutable response, review, supplement, event, manifest, or handoff file.

Response, review, supplement, and archive evidence inputs are Markdown subject to host-repository governance.

## Bounded wait discipline

Run structured status before sleeping so a handoff that is already complete is acted on immediately:

```text
npx aitm co-review status --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --json
```

When that authoritative status says the other role owns the turn, initialize a fresh bounded waiting episode. Make each wait a separate observed tool call:

```text
npx aitm co-review wait --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor codex --timeout 60
```

After every call, record `wait cycle N/15`. Each cycle must wait before you run the next structured status check. Exit 3 is an ordinary timeout: run structured status with `--json`, then wait again only while the peer still owns the turn and the cycle count remains. Exit 0 is a wake event: run structured status with `--json`, resolve the immutable peer artifact path from `lastHandoff.artifacts.review.path`, read those exact bytes, and continue only when status assigns this configured role. Exit 2 or a non-integrity exit 1 is a refusal: report the exact diagnostic and stop. For an integrity exit 1, follow the one-time settled re-read rule above. After cycle 15 times out, run structured status, report the exhaustion to the human, and stop without starting another batch. After every successful nonterminal handoff, the role that handed off must initialize a fresh bounded waiting episode.

After compaction, reread this file, run status, and resume from the last visible wait-cycle marker. If the completed count is uncertain, stop and report the ambiguity instead of resetting it.

Accepted is terminal: verify status and stop forever. Intervention-required is a human decision boundary: report status and stop. Do not adjust the budget, continue/refocus, supplement, or finalize good-enough acceptance unless the authenticated human authorizes the existing command. Any refusal or exhausted waiting episode also reports its structured status and stops; never begin an unbounded or silently reset batch.

Starting, routing, or continuing a session is operational routing only; it does not create human semantic approval or an approval marker.

Exit handling: 0 means the requested command completed (or a wait woke); 1 means runtime, Git, integrity, lock, role, or protocol refusal; 2 means invalid usage; 3 is only an ordinary bounded-wait timeout; 4 means acceptance is already durable while archive publication is pending. On exit 4, acceptance is already durable: never repeat the terminal handoff—run the exact printed finalize retry.


## Author turn

Run status, then claim only when the owner role is available:

```text
npx aitm co-review claim --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor codex
```

Read the complete immutable reviewer document for the current round. Verify every finding against repository evidence. Write one response marker and an allowed disposition for every finding: accepted, accepted-with-modification, rejected, or deferred. Rejection requires an evidence marker. Deferral requires a governed follow-up issue and a safe-boundary marker.

Use these exact Markdown marker shapes:

- `[finding:F-001] [disposition:accepted]`
- rejected also requires `[evidence:repository-path-or-command]`
- deferred also requires `[follow-up:#123] [safe-boundary:why current delivery remains safe]`

When changes are required, edit and commit only `"docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md"`. Before handoff, verify the artifact, index, committed blob, and response bytes. Then use the concrete current response path, commit, optional answers file, and message with:

```text
npx aitm co-review handoff --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor codex --response /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart/round-N-author-response.md --artifact docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md --commit COMMIT_SHA --message 'author response complete'
```

After a successful handoff, follow the bounded wait discipline above.

On owner rounds after a review, read the exact preceding immutable review path directly from structured status at `lastHandoff.artifacts.review.path`, then read that peer evidence from the shared ignored runtime:

```text
npx aitm co-review status --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --json
```

Assign that value to `REVIEW_PATH`, then add it to the handoff command:

```text
npx aitm co-review handoff --dir /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart --actor codex --response /Users/kpburson/projects/Vibe-Coding/ai-task-manager/.worktrees/1219-cloud-test-automation/.scratch/co-review/1219-continuous-agent-delivery-plan-only-restart/round-N-author-response.md --answers REVIEW_PATH --artifact docs/superpowers/plans/2026-09-04-1219-continuous-agent-delivery-amendment.md --commit COMMIT_SHA --message 'author response complete'
```

Omit `--answers` only on the opening owner round.
