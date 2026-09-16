# Full-Auto Review Continuation Design

## Problem

`review` closes the active timing session before it performs the agent Review action and does so in every mode. Full-Auto therefore loses the time spent on automated review and reaches governed delivery with a bound issue but no running timer. `deliver` correctly refuses that state, while the terminal Review handoff correctly suppresses synthetic stop/resume rows.

## Decision

Review work stays active until the Review action finishes. Only a real human-approval wait pauses the session and emits `PROMPT_REQUIRED: review-approval #N`.

Explicit Full-Auto (`TT_FULL_AUTO=1`) and configurations with `gateReviewToDone=false` do not wait for a human. They keep the exact issue binding and entry clock active, emit no human-approval prompt, and let the orchestrator run `approve`, `deliver`, and `close` without a resume event.

The approval verb remains separate so the existing human/full-auto provenance marker is preserved. Delivery's running-timer preflight remains unchanged.

## Ordering

The Review verb will:

1. Validate and stamp agent Review evidence while timing remains active.
2. Move Test to Review and emit `review:passed` on success.
3. Run timing-field synchronization.
4. Pause only when human approval is still required; otherwise leave the session active.

Human-gated Review retains its existing prompt. Full-Auto retains the canonical terminal sequence `review:passed → review:approved → issue:wrap → issue:closed` with no synthetic `resumed` or `stop` row.

## Verification

- Unit coverage pins the pause decision and proves pre-network agent Review no longer closes the timer.
- The real CLI review harness proves human mode pauses and prompts, while `TT_FULL_AUTO=1` stays active and emits no prompt.
- Existing approval, delivery, and terminal-timing tests protect the downstream contracts.
