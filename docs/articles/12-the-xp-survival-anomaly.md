# The XP Survival Anomaly

**XP's Practices Survived. Their Reasons Did Not.**

*Twelve practices, one bottleneck. The bottleneck moved — most of the practices moved with it.*

Here's a thing about Extreme Programming that gets lost when people argue about whether it's "dead": XP was never really about the twelve practices. It was a workaround for one constraint — humans were the only reviewers available, and human review is slow, expensive, and error-prone. Test-first gave a lone developer some design pressure before the code existed. Pairing put a second human in the loop in real time. The planning game kept scope negotiated instead of assumed. Collective ownership kept knowledge from getting stuck in one person's head.

Agentic AI just pulled that constraint out from under XP. But it didn't do it evenly, and that unevenness is the actual story worth telling. Some practices got mechanized outright. Some kept their shape and quietly lost their point. One lost its enforcement mechanism completely, and as far as I can tell, nothing has stepped in to replace it.

I've been building a skill for agentic agile delivery (`@kburson/ai-task-manager` — I'll call it **AITM** from here). It binds an AI coding agent to a GitHub project's backlog. Claude Code and Codex are the two adapters it supports today, but that's a starting point, not a ceiling — the structure is built to take more. It's a decent lens for this, because it's what happens when you actually try to run agile discipline against a fleet of agents instead of just talking about it. Six of XP's practices map onto this pretty cleanly. Let's walk through them.

## Testing: it used to be design pressure. Now it's a receipt.

Test-first was never really about coverage. The whole point was that writing the test *first* forced you to think through the interface before you built the thing — the test was a design tool, and the discipline of writing it early was where the value lived.

That discipline just doesn't survive an agent that writes the test and the implementation in the same breath. There's no gap in time between "decide the interface" and "build it" for the pressure to do its work in. So what's left is the artifact — a test that proves something happened, after the fact, instead of a test that shaped a decision before it happened. AITM leans into exactly this: a story can't move forward until it points at the specific test that proves each requirement — not "tests pass" in general, but this test proves this requirement, checked automatically before the gate opens. Same ritual, red then green. Completely different job. It used to be a design instrument. Now it's a receipt.

## Pair programming: one practice, four jobs, and only one job didn't survive

Pairing at a single keyboard bundled together four things that had no real reason to travel as a package, except that a human pair was the only tool available to do all four at once:

- **Catching mistakes in real time** — mechanized. CI, lint, and gates do
what a navigator used to do by looking over your shoulder.
- **Enforcing discipline** — "you don't get to skip the test" is now a
script that exits nonzero instead of a person insisting on it. That's literally what AITM's `verify-develop.mjs` and its evidence gates are: a state machine that just refuses to move forward.
- **Design conversation** — this one didn't disappear, it moved earlier
and went async. AITM's co-review tool has one agent write a spec or plan and a second agent review it, back and forth, before any implementation starts. Author and reviewer. Driver and navigator, just relocated to a different stage of the work.
- **Knowledge transfer** — nothing replaced it. This is the crack.

That last one is worth sitting on for a second, because it's the loss an old XP hand would actually recognize. Pair rotation existed so more than one person understood any given piece of the system. Nobody rotates through agent-generated code the same way. There's a real chance nobody on the team has actually read what shipped. Three of pairing's four jobs got automated cleanly. The fourth got quietly dropped on the floor.

There's a little irony here too. XP pairing was synchronous, real-time, and tied to two humans in a room — which is exactly why most organizations that tried it never made it stick. It was the right idea at a price nobody wanted to pay. Async, agent-driven co-review is cheap enough that the "second perspective on your work" part of pairing might actually survive better under agents than it ever did under XP.

## The planning game: from a meeting to something you actually read

The planning game kept the customer and the team negotiating scope together instead of drifting on stale assumptions. Under agentic delivery, that negotiation produces something a lot more durable than a shared understanding floating around in people's heads — it produces the backlog itself, and that's the thing a human is actually reading.

This is the part that changes what "review" even means day to day. You're not reading diffs line by line anymore. You're shaping the backlog — story boundaries, sequencing, dependencies, acceptance criteria. AITM treats the backlog as a control plane, not a status board, and pairs that with just-in-time planning: decompose a little at a time, do the deep dive right before you need it instead of trying to plan everything up front. The planning game's collaborative spirit made it through fine. It just moved from a meeting into a living document.

## Collective ownership: the one that actually broke

Collective ownership — anyone can touch any code — depended on pairing and rotation to mean something. Take the rotation away and the rule becomes a technicality. An agent can absolutely touch any file you point it at. That's permission, not comprehension. Nobody has to have read the code for the agent to be "allowed" to change it.

This is the one on this list I don't have a tidy answer for. Evidence gates prove the work happened and passed its checks. They don't prove a human actually understands the system well enough to change it safely later without going back to the same agent for help. That gap is real, none of the other five practices patch it, and I'd rather say that plainly than pretend it's solved.

## Sustainable pace: burnout prevention became a review bottleneck

Sustainable pace protected against the mistakes tired humans make typing code past a reasonable working day. Agents don't get tired. So on the production side, that constraint is just... gone.

It didn't vanish, though — it moved. The bottleneck now isn't how fast code gets produced, it's how fast a human can safely accept it. Review capacity is the new ceiling that pace used to protect. If you scale up agent throughput without scaling review capacity, you're not actually getting faster — you're stacking up a pile of unreviewed work that someone eventually has to absorb all at once, which is arguably a worse version of the exact thing sustainable pace was trying to prevent.

## On-site customer: from "always available" to "the tiebreaker"

The on-site customer's whole job was resolving ambiguity with real product authority, in real time, so nobody had to guess. That role becomes the human tiebreaker when two agents are reviewing each other's work — the person who steps in when two reviewers land on agreement for the wrong reasons.

This matters more than it sounds like it should. Two models converging on the same answer isn't automatically proof the spec is right — they can converge on a shared wrong answer, and the risk gets worse the longer a review cycles, because both sides keep anchoring on their own back-and-forth. XP never treated "two developers agree" as the acceptance criterion. A human with real authority was the criterion. Same role, same job, just refereeing a different kind of pair now.

## What I left off the list

Metaphor, coding standard, small releases, simple design, refactoring, and continuous integration aren't here because they either don't shift much under agentic delivery, or you'd have to force them to fit. That's on purpose. The six above are the ones where the original purpose visibly moved somewhere else, got mechanized, or just broke.

## The honest takeaway

None of XP's twelve practices got thrown out entirely, and none of them survived completely untouched either. Catching mistakes got mechanized. Enforcing discipline got mechanized. Design conversation moved earlier and went async. Planning turned into a living artifact instead of a meeting. Pace protection turned into a review-capacity ceiling. Customer authority turned into the tiebreaker for when agents agree on the wrong thing. Collective ownership is the one practice that lost its mechanism and got nothing back in its place.

Syntax gets cheaper. Intent, architecture, verification, and fit get more expensive. XP's practices were never really about process for its own sake — they were scaffolding built around a review bottleneck. That bottleneck moved. Most of the scaffolding moved with it. One piece didn't, and that's the piece worth keeping an eye on.

*(One thread I'm leaving open on purpose: the human tiebreaker only works if the human still understands the codebase well enough to make the call. That's not automatic for a person, and it's not automatic for an AI reviewer either. Next up — does a single reviewer, human or AI, actually know enough to say what's safe to land, and what happens when you hand that job to two reviewers instead of one.)*

## Bibliography

- Beck, Kent. *Extreme Programming Explained: Embrace Change.*
Addison-Wesley, 1999.
- AI Task Manager. "Measurement and ROI."
https://github.com/kburson/ai-task-manager/blob/trunk/docs/introduction/measurement-and-roi.md
- AI Task Manager. "How AI Task Manager Keeps Agent Context Small and
Rules Fresh." https://github.com/kburson/ai-task-manager/blob/trunk/docs/introduction/context-management-skill-architecture.md
- DORA. "State of AI-assisted Software Development 2025."
https://dora.dev/dora-report-2025/
