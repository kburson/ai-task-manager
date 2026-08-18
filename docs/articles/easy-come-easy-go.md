<!-- markdownlint-disable MD034 -->
<!-- DRAFT: placement in the series undecided. Title is a working title, not a final riff. See docs/superpowers/specs/2026-08-18-easy-come-easy-go-article-design.md -->

# Easy Come, Easy Go

**Regeneration Is Cheap. Hardening Isn't. Guess Which One Gets Skipped.**

_Money you didn't earn gets spent like it doesn't matter. Agentic AI just handed product managers the same windfall — in code._

Gamblers have a name for it: house money. Win a hand, and those chips stop feeling like real money — so you bet bigger, dumber, faster, because losing them wouldn't cost you anything you actually earned. Behavioral economists confirmed the effect decades ago (Thaler & Johnson, 1990), but you didn't need a study to know it. Ask anyone who's ever walked out of a casino holding less than they walked in with, shrugging it off with "eh — easy come, easy go."

Software just got its own version of the casino floor. Building an app used to cost something real — engineers to hire, months to wait, a codebase you'd better believe you'd have to live with. Agents blow most of that away. Point a fleet of them at an updated spec and you can have a whole new application before lunch. Genuinely great. Also, structurally, a windfall — and windfalls come with exactly the psychology Thaler and Johnson described. When it stops costing you anything to lose something, you stop being careful with it.

So picture the manager who just discovered this. Not a villain — nobody hands you a superpower on day one and expects restraint. Just someone who's noticed that "rebuild it" is now easier than "understand it and fix it," and hasn't yet developed the judgment to ask which one they actually need. They rebuild. Then they rebuild again. Nothing in the moment tells them to stop.

Simon Willison wrote about doing exactly this in April 2026 — an AI-built prototype whose architecture had gone sideways, tossed rather than repaired. One anecdote isn't a trend. But it's a recognizable shape, and this piece is about the shape.

## The fork: rebuild it, or actually fix it

Here's the choice, stripped down. Spec changes — new feature, a lesson learned, a workflow that needed sharpening — and the manager picks one of two doors. Door one: send agents in to refactor what's already there. Door two: send a fresh crew at the new spec and build from zero.

Door two is almost always the easier ask, which is exactly why it's dangerous. Agents starting fresh don't know the old codebase's scars — the edge case that took three outages to find, the weird workaround nobody loves but everybody needs. They just build to spec, maybe in a different language this time, maybe with a different file layout, because why not. The spec remembers what it learned last time. The code, rebuilt from scratch, remembers nothing.

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

That only works if the backlog is actually doing its job. A well-built backlog isn't just a to-do list — it's a map. Tasks point at other tasks. Code carries comments back to the ticket that built it. An agent scoping a change doesn't have to hold the whole illegible corpus in its head; it can follow a trail of what was built alongside what, and figure out the blast radius from there. A backlog with no memory of its own history is just amnesia wearing a governance badge. One that remembers is an actual map.

That map costs something to keep current, and it's worth saying the price out loud instead of pretending it's free. One project's own numbers: a full test run takes about fifteen minutes, and a task that needs a couple of those during implementation turns a thirty-minute job into a three-hour one. That's not rounding error — that's six times longer, paid specifically so the product doesn't stay in beta forever. It's exactly the bill a manager riding a cheap-regeneration high is most tempted to skip, because skipping it is free right up until the seams start showing.

Kent Beck and Martin Fowler put a name on the version of this that happens before anyone even touches the keyboard: cognitive debt (Thoughtworks Deer Valley retreat, February 2026) — the idea that discipline isn't some old-fashioned habit AI made obsolete, it's the actual precondition for using AI well. "We don't ship shit" was never really about who typed the code. It was about whether anyone was on the hook for what shipped. Agentic AI didn't retire that question. It just made it a lot cheaper to dodge.

Easy come, easy go was never really about the money. It's about what you didn't have to earn to get it — and what that does to how carefully you hold onto it.

## Bibliography

- Thaler, R. H., & Johnson, E. J. (1990). "Gambling with the House Money and Trying to Break Even." *Management Science*.
- Erlikh, L. (2000). "Leveraging legacy system dollars for e-business." *IT Professional*.
- Glass, R. L. *Facts and Fallacies of Software Engineering*.
- Foote, B., & Yoder, J. (1997). "Big Ball of Mud." Pattern Languages of Program Design.
- Willison, S. (April 2026). First-person essay on discarding an AI-built prototype.
- Beck, K., & Fowler, M. — "cognitive debt" framing, Thoughtworks Deer Valley retreat (February 2026), as reported.

_Working title, unplaced in the series. Full research and design context in [research-easy-come-easy-go.md](research-easy-come-easy-go.md) and [the design doc](../superpowers/specs/2026-08-18-easy-come-easy-go-article-design.md)._
