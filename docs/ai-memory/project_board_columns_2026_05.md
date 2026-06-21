---
name: Board columns mirror verb states (Groom/Analyze/Todo retired)
description: Current board columns and the retired vocabulary as of 2026-05 — do not use Groom/Analyze/Todo/old-Review
type: project
originSessionId: 485cd5ff-0dc3-459b-bbfe-a1318911129c
---

Board columns mirror the verb-state machine 1:1: **Backlog → On Deck → Refine → Plan → Develop → Test → Review → Done** (8 states as of #433, ~2026-06-16).

**On Deck** (added by #433): an inert, gateless waiting room / tranche filter between Backlog and Refine. Every item now passes through it — the old `backlog → refine` shortcut is gone. `backlog → on-deck` is gateless (only the universal blocked-by guard); the **Priority** entry gate and the two child-parent guards relocated from backlog-exit to **on-deck-exit** (`on-deck → refine`). Slug `on-deck`, display "On Deck", color GRAY, live board optionId `f627e155` (config key `kanbanOptionOnDeck`). Backward arc `on-deck → backlog` exists.

Retired ~2026-05-13: **Groom**, **Analyze**, **Todo**, and the previous **Review** column (which is now **Test**). The new **Review** column sits between Test and Done — it is the human-approval gate, not the validation gate.

**Why:** the column names diverged from the verb chain, causing constant translation. Aligning them removed the Groom-vs-grooming overload and the Todo "ready" tier.

**How to apply:**

- Sized + AC'd issues land in **Refine** (the column that replaced Groom), not Backlog and not "Todo".
- Use state names — `refine`, `plan`, `test`, `review` — when talking about board position. Never say "Groom", "Analyze", "Todo", or use the old meaning of "Review" (= today's Test).
- `project-tether.mjs --status` accepts state names (`refine`, `plan`, `develop`, `test`, `review`, `done`), not column display names. Its CLI help text still lists `groom|analyze|...` and silently drops unknown values — that's a separate stale-help bug, not a working API.
- Priority/Size/Estimate are set at **Refine** (formerly "at Groom").
- Three-stage estimation is now **Refine / Plan / Review** (mutate at Refine + Plan; Review is retrospective-only).
- Epics must reach **Develop** before sub-issues leave **Refine/Plan**.
