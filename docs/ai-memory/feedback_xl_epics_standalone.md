---
name: Epic title prefix is the 🧑‍🧒‍🧒 [Epic] emoji, not "EPIC:"
description: Epics are titled with the "🧑‍🧒‍🧒 [Epic] " prefix; the old "EPIC: " text-prefix rule is retired. Sub-epics under a root epic are allowed.
type: feedback
originSessionId: ab7187c6-1bbe-4a2e-83e6-8b79c7be0087
---
The correct, current title prefix for an epic is `🧑‍🧒‍🧒 [Epic] ` (the
family emoji + `[Epic]`). The historical `EPIC: ` text-prefix convention is
**retired** — do not inject it and do not "fix" an emoji-prefixed title to add it.

Multi-level nesting is supported and intentional: a **sub-epic may have a parent
epic** (root epic → sub-epics → story children). The old "XL epics must be
standalone / only one level of nesting" claim is superseded — see CLAUDE.md
"Nesting" and [[project_integrity_epic_521]]-style deliberate scope groupings.

**Why:** User correction (2026-06-28): the emoji prefix already encodes the epic
role at board/list level; `EPIC: ` is redundant. And the board genuinely supports
sub-epic chains, so forcing epics standalone breaks legitimate groupings.

**How to apply:** When picking up an epic, do NOT rename to add `EPIC: `. Accept
`🧑‍🧒‍🧒 [Epic] ` as correct. Sub-epics carrying a parent link are fine.
