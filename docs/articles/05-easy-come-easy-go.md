<!-- markdownlint-disable MD034 -->
<!-- DRAFT: placed at series position 05, pending review. Title is a working title, not a final riff. See docs/superpowers/specs/2026-08-18-easy-come-easy-go-article-design.md -->
<!-- TEMPORARY ARTWORK: article-05-header.png intentionally duplicates article-06-header.png. Replace that one file when final Chapter 5 artwork is ready. -->

# Easy Come, Easy Go

**Regeneration Is Cheap. Hardening Isn't. Guess Which One Gets Skipped.**

![Regeneration Is Cheap. Hardening Isn't. Guess Which One Gets Skipped.](assets/article-headers/article-05-header.png)

_Part 5 of a series of articles on succeeding with Agentic Agile Delivery_

_Money you didn't earn gets spent like it doesn't matter. Agentic AI just handed product managers the same windfall — in code._

Gamblers have a name for it: house money. Win a hand, and those chips stop feeling like real money — so you bet bigger, dumber, faster, because losing them wouldn't cost you anything you actually earned. Behavioral economists confirmed the effect decades ago (Thaler & Johnson, 1990), but you didn't need a study to know it. Ask anyone who's ever walked out of a casino holding less than they walked in with, shrugging it off with "eh — easy come, easy go."

Software just got its own version of the casino floor. Building an app used to cost something real — engineers to hire, months to wait, a codebase you'd better believe you'd have to live with. Agents blow most of that away. Point a fleet of them at an updated spec and you can have a whole new application before lunch. Genuinely great. Also, structurally, a windfall — and windfalls come with exactly the psychology Thaler and Johnson described. When it stops costing you anything to lose something, you stop being careful with it.

So picture the manager who just discovered this. Not a villain — nobody hands you a superpower on day one and expects restraint. Just someone who's noticed that "rebuild it" is now easier than "understand it and fix it," and hasn't yet developed the judgment to ask which one they actually need. They rebuild. Then they rebuild again. Nothing in the moment tells them to stop.

Simon Willison wrote about doing exactly this in April 2026 — an AI-built prototype whose architecture had gone sideways, tossed rather than repaired. One anecdote isn't a trend. But it's a recognizable shape, and this piece is about the shape.

## The fork: rebuild it, or actually fix it

Here's the choice, stripped down. Software never sits still — new features get asked for, and defects keep turning up in whatever already shipped. Sooner or later the spec has to catch up with what's been learned. When it does, the manager picks one of two doors: send agents in to refactor what's already there, or send a fresh crew at the new spec and build from zero.

Door one used to be the obvious pick — nobody wanted to pay a team to rebuild a whole app just because the spec picked up a wrinkle. Agents flipped that math. Now the rabbit's out of the hat, and door two keeps looking like the easier ask, which is exactly why it's dangerous. Agents starting fresh don't know the old codebase's scars — the edge case that took three outages to find, the weird workaround nobody loves but everybody needs. They just build to spec, maybe in a different language this time, maybe with a different file layout, because why not. The spec remembers what it learned last time. The code, rebuilt from scratch, remembers nothing.

That's a sharper problem than "technical debt," and worth keeping separate from it. Debt at least implies you're standing on something — a foundation you still owe money on. Full regeneration means there's no foundation left to owe anything to. The product gets smarter every cycle. The code forgets everything it ever knew, every single time.

And here's the part that makes it worse than plain laziness: sometimes rebuilding really is the smarter call in the moment. Agent-written code can be clean up close and completely unreadable from a distance — tidy little rooms that don't add up to a house anyone can find their way around. Nobody wants to pull a thread in a corpus like that. So refactoring a system you can't picture the shape of genuinely is the worse bet, and rebuilding it clean genuinely is the better one — right up until you add up what skipping maintenance costs. And maintenance isn't the cheap part of a software project. It's most of it — 60 to 80 percent of the total bill, by every serious estimate anyone's bothered to run (Erlikh, 2000; Glass). Rebuilding doesn't make that bill go away. It just keeps it from ever showing up, which is not the same thing.

## The rookie's slide

Do this enough times on one product and you get something that never grows up. Software leaves beta by surviving contact with real users — the weird inputs nobody planned for, the load nobody predicted, the bugs that only surface after the thing's been alive a while. That's what hardening is for. Full regeneration skips it, on purpose, every single cycle.

The spec keeps getting smarter. The features keep getting sharper. The code resets to zero every time the spec does. So you end up with a product that's visibly improving on paper while its actual foundation never once finishes drying — two tracks running side by side, not talking to each other, until a bug report makes the gap impossible to ignore.

Scale that past one product and it turns into something worse. Big software isn't one spec, it's a spec with a bunch of sub-specs hanging off it. Regenerate one sub-spec's code on its own — cleanly, competently, exactly as asked — and you get a module that's internally fine and a total stranger to everything next to it. A well-built arm, grafted onto a body it was never measured for. That's not the classic Big Ball of Mud (Foote & Yoder, 1997) — mud is one continuous mess that rotted in place over years. This is different: individually tidy pieces, stitched together badly. Frankenstein's monster, not a junk drawer. The problem isn't in any single part. It's at the seams.

## The veteran's actual choice

Now hand the same cheap power to someone who's been running this product for years — who already knows which subsystem has caused three outages and which one hasn't needed a second look since launch. The house money effect doesn't erase that knowledge. It just puts it up against a much cheaper temptation than this manager has ever faced. What they do next actually tells you something, because it isn't decided in advance.

Three things can happen, and they're not equally likely, or equally forgivable.

One: they bolt features on everywhere, because it's so cheap now, why not. Same failure as the rookie, except this manager doesn't have the excuse of not understanding the system — they're just not paying the discipline tax because nobody's making them.

Two: they bank the windfall instead of spending it. Point the same cheap agents at cleaning house — hardening what's there instead of piling more on top. Same tool, opposite instinct. The house money effect predicts recklessness. It doesn't require it.

Three, and this is the one worth actually sitting with: they replace one specific subsystem, wholesale, on purpose — the one that's been a known headache for years, the one they could sketch the failure modes of from memory. This isn't panic. It's not the rookie's fear of illegible code driving a full rebuild. It's someone who knows exactly what's broken, deciding a clean rebuild of that one part beats another year of patching it. That's not house money burning a hole in anyone's pocket. That's judgment, using the new power for exactly what it's good for.

Line those three up and the whole thesis gets sharper. It was never "rebuilding is bad, refactoring is good." The tool just amplifies whatever judgment was already in the room. Good judgment gets cheaper to act on. Bad judgment gets cheaper to indulge. The house money effect tells you who's at risk of the second one. It doesn't guarantee it happens.

## What actually fixes it

None of this is an argument for never rebuilding. It's an argument that the seam — the exact spot where a freshly rebuilt piece meets everything around it — is where the real work has to happen, not the place you drop new code and walk off. Before that regenerated piece gets bolted on, agents should have to actually look at what's already there and propose how to fit it in, under real oversight from someone who owns the outcome. That's the difference between the veteran's third choice and their first one: a deliberate call versus a habit nobody's watching.

There's a tempting rationalization worth naming instead of dodging: maybe you never harden anything, and you still come out ahead — banking on next quarter's revisions, or next year's smarter agents, to quietly absorb the bill before anyone's forced to pay it. It's the same trick politicians play with national debt: kick it forward, market the ride, let someone else hold the note. Debt-kicking can work forever for a government, because there's a sovereign behind the currency who can always roll it over. Code has no such backstop. Nobody refinances your seams. When the bill comes due it doesn't arrive as a rollover — it shows up as an outage, a breach, or a customer who's finally had enough of the third broken release in a row. The bet might even pay off, if agents keep improving faster than the product keeps getting more complicated. But that's a wager on a trend line holding, not a fact anyone's actually checked — and nobody's volunteering to be the one who's wrong when it doesn't. Which is the actual argument for doing the seam work now, while it's still a choice you're making and not a bill somebody else already called.

That only works if the backlog is actually doing its job. A well-built backlog isn't just a to-do list — it's a map. Tasks point at other tasks. Code carries comments back to the ticket that built it. An agent scoping a change doesn't have to hold the whole illegible corpus in its head; it can follow a trail of what was built alongside what, and figure out the blast radius from there. A backlog with no memory of its own history is just amnesia wearing a governance badge. One that remembers is an actual map.

That map costs something to keep current, and it's worth saying the price out loud instead of pretending it's free. One project's own numbers: a full test run takes about fifteen minutes, and a task that needs a couple of those during implementation turns a thirty-minute job into a three-hour one. That's not rounding error — that's six times longer, paid specifically so the product doesn't stay in beta forever. It's exactly the bill a manager riding a cheap-regeneration high is most tempted to skip, because skipping it is free right up until the seams start showing.

Kent Beck and Martin Fowler put a name on the version of this that happens before anyone even touches the keyboard: cognitive debt (Thoughtworks Deer Valley retreat, February 2026) — the idea that discipline isn't some old-fashioned habit AI made obsolete, it's the actual precondition for using AI well. "We don't ship shit" was never really about who typed the code. It was about whether anyone was on the hook for what shipped. Agentic AI didn't retire that question. It just made it a lot cheaper to dodge.

Easy come, easy go was never really about the money. It's about what you didn't have to earn to get it — and what that does to how carefully you hold onto it.

## Series Link

This article shows what ungoverned execution looks like once specs start moving fast enough to make regeneration cheaper than repair — the failure mode waiting on the other side of the gap the [previous article](04-the-spec-driven-insufficiency.md) named. The next article, [The Rise Of The Technical Product Owner](06-the-product-owner-escalation.md), introduces the human role whose judgment is exactly what keeps a cheap windfall from turning into a Frankenstein's monster of ungoverned seams.

## Series Roadmap

| Status      | #      | Article                                                                                                            | Role In Series                                       |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
|             | 01     | [The Refactoring Bloat Precursor](01-the-refactoring-bloat-precursor.md)                                           | Prequel: history of AI-assisted coding before agents |
|             | 02     | [The Rise Of Technical Product Operations](02-the-backlog-governance-postulate.md)                                 | Industry thesis: Technical Product Operations        |
|             | 03     | [The Vibe Coding Hangover](03-the-vibe-coding-deficiency.md)                                                       | Failure mode: vibe slop and review debt              |
|             | 04     | [Spec-Driven Development Is Necessary But Not Sufficient](04-the-spec-driven-insufficiency.md)                     | Why specs need execution governance                  |
| **Current** | **05** | **[Regeneration Is Cheap. Hardening Isn't. Guess Which One Gets Skipped.](05-easy-come-easy-go.md)**               | Failure mode: cheap regeneration without governance  |
|             | 06     | [The Rise Of The Technical Product Owner](06-the-product-owner-escalation.md)                                      | Human operator: TPO/TPM as delivery architect        |
|             | 07     | [The Backlog Becomes The Control Plane](07-the-backlog-control-plane-conjecture.md)                                | Backlog as executable control surface                |
|             | 08     | [The Just-In-Time Planner](08-the-just-in-time-planning-paradox.md)                                                | Progressive decomposition and deep dives             |
|             | 09     | [Context Durability Is A Feature](09-the-context-durability-corollary.md)                                          | JIT loading and post-compaction recovery             |
|             | 10     | [Evidence Beats Trust](10-the-evidence-over-trust-theorem.md)                                                      | Evidence gates and auditability                      |
|             | 11     | [The Adapter Future](11-the-adapter-convergence.md)                                                                | Backlog and agent platform adapters                  |
|             | 12     | [Agentic Concurrency Isn't Free — And "50 Parallel Agents" Is Hyperbole](12-the-agentic-concurrency-deficiency.md) | Concurrency ceiling and coordination cost            |
|             | 13     | [XP's Practices Survived. Their Reasons Did Not.](13-the-xp-survival-anomaly.md)                                   | XP practices under agentic delivery                  |
|             | 14     | [The Diff Isn't Where Your Judgment Lives Anymore](14-the-diff-displacement.md)                                    | Spec review displaces code review                    |
|             | 15     | [It's All About Perspective](15-the-second-reviewer-corollary.md)                                                  | Cross-model review for a genuine second opinion      |

## LinkedIn Article Shape

Opening hook:

> Agentic AI just made regeneration cheaper than repair. That's a windfall — and windfalls come with the same psychology as house money at a casino.

Middle:

- Introduce the house money effect and the regenerate-vs-refactor fork it creates.
- Show the rookie's slide into perpetual beta, then the veteran's three branches — same failure, banked windfall, or deliberate targeted rebuild.
- Name the seam as the real point of failure, and the backlog as the map that lets an agent scope it.

Close:

> Easy come, easy go was never really about the money. It's about what you didn't have to earn to get it — and what that does to how carefully you hold onto it.

## Bibliography

- Thaler, R. H., & Johnson, E. J. (1990). "Gambling with the House Money and Trying to Break Even." _Management Science_.
- Erlikh, L. (2000). "Leveraging legacy system dollars for e-business." _IT Professional_.
- Glass, R. L. _Facts and Fallacies of Software Engineering_.
- Foote, B., & Yoder, J. (1997). "Big Ball of Mud." Pattern Languages of Program Design.
- Willison, S. (April 2026). First-person essay on discarding an AI-built prototype.
- Beck, K., & Fowler, M. — "cognitive debt" framing, Thoughtworks Deer Valley retreat (February 2026), as reported.

_Placed at series position 05, pending review. Full research and design context in [research-easy-come-easy-go.md](research-easy-come-easy-go.md) and [the design doc](../superpowers/specs/2026-08-18-easy-come-easy-go-article-design.md)._
