<!-- markdownlint-disable MD034 -->
<!-- DRAFT: placement in the series undecided. Title is a working title, not a final riff. See docs/superpowers/specs/2026-08-18-easy-come-easy-go-article-design.md -->

# Easy Come, Easy Go

**Regeneration Is Cheap. Hardening Isn't. Guess Which One Gets Skipped.**

_Money that arrives without earned effort gets spent without earned judgment. Agentic AI just handed product managers the same windfall, in code._

Behavioral economists call it the house money effect. Thaler and Johnson found it in 1990: people who've just won money take bigger, sloppier risks with it than they would with money they earned the hard way. It's not really about the dollar amount — a windfall dollar and an earned dollar spend the same at the register. It's about what the money cost you to get. Pay nothing, risk everything. That's the whole mechanism, and it shows up anywhere power or money arrives without the friction that used to force restraint.

Agentic AI just handed that same windfall to product management, denominated in code instead of cash. Building and rebuilding software used to cost something real — engineers to staff, schedules to slip, code to live with once it shipped. Agents collapse most of that cost. A manager can now regenerate an entire application from an updated spec in the time it used to take to schedule a planning meeting. That's a genuine, welcome change. It's also a windfall, and windfalls come with exactly the psychology Thaler and Johnson described: when the cost of losing something drops, so does the judgment applied to keeping it.

Call it what it looks like from the outside: a manager, newly handed agentic muscles they haven't developed judgment for yet, discovering they can rebuild instead of repair — and doing it, over and over, because nothing in the moment tells them not to. That's not a character flaw. Nobody hands you a new kind of power and expects you to lift conservatively on day one. But the pattern it produces is real, and it's worth naming before it becomes the industry's default posture.

Simon Willison gave a concrete, first-person version of it in April 2026: a working AI-built prototype, discarded because its high-level architecture didn't hold together, rebuilt from scratch rather than repaired. One data point isn't a trend. But it's the shape of the trend, and the shape is what this piece is about.

## The mechanism: regenerate versus refactor

Here's the fork in the road, and it's narrower than "AI makes code cheap to lose." When a spec changes — a new feature, a shifted workflow, a lesson learned from the last release — a manager has two options. Direct agents to refactor the existing codebase to meet the new spec. Or direct a fresh team of agents to build a new application from the new spec, from scratch.

The second option is almost always the easier ask, and it's the one that's easy to reach for without noticing what it costs. Agents building fresh don't see the old codebase's history. They don't inherit its hard-won structure, its patched edge cases, its scars. They see the spec, and they build to it — possibly in a different language, a different framework, a different file layout entirely. The spec can carry memory forward; the code, once it goes through full regeneration, cannot.

That's a genuinely different claim than "code rots" or "technical debt accumulates." Debt implies you're still standing on the same foundation, paying down what you owe. Regeneration means there's no foundation left to owe anything on. The feature list evolves. The workflow gets sharper. The code resets to zero, every time.

There's a structural reason regeneration keeps winning this fork, beyond it just being easier. Agent-authored code, at the macro level, can be genuinely hard to reason about — even when every individual piece is clean at the micro level. A human staring at a corpus they can't hold the shape of in their head is rightly nervous about pulling any one thread. That's not laziness. Refactoring code you can't see the blast radius of is a real, legitimate worse bet than rebuilding it clean. Which means regeneration isn't only the tempting choice, it's often the locally rational one — right up until you count what it costs at scale.

And what it costs is the part that's easy to skip past. Maintenance — not the initial build — is the expensive phase of any software's life. It's been measured at 60 to 80 percent of total lifecycle cost for as long as anyone's been tracking it (Erlikh, 2000; Glass, *Facts and Fallacies of Software Engineering*). Regeneration doesn't eliminate that cost. It defers it, and re-defers it, cycle after cycle — an org that keeps re-paying the cheap initial-build price while never once paying the expensive one it's actually going to owe.

## Two managers, one fork

Here's where the diagnosis gets more interesting than "cheap power corrupts." Not every manager holding this windfall is new to the job. Picture the manager who's been running an existing product for years — who has actual scars, who knows exactly which subsystem has caused three outages and which one nobody's touched since it shipped clean the first time. The house money effect doesn't erase that judgment. It tests it against a temptation cheaper than anything that manager has ever faced before. What that manager does with the windfall says more about the mechanism than the naive case does, because it isn't foregone.

The naive manager — new to agentic tooling, or running a product with no scar tissue yet — is the one who drifts into perpetual beta almost by default. Regenerate a product from an updated spec enough times and you get something that never leaves beta, not from bad luck but from what "leaving beta" structurally requires. A product graduates by surviving contact with real use: the edge cases nobody spec'd, the load nobody predicted, the bugs that only show up after the thing's been alive a while. That's what a hardening phase is for, and it's exactly what full regeneration skips, every cycle, by construction. The spec keeps compounding — features sharpen, workflows improve, because the spec is the artifact carrying memory forward. The code never compounds, because it's never the same code twice. Feature polish and foundation stability run on separate tracks, invisible to each other, until the bug reports make the gap obvious.

Scale that same drift past a single product and it gets worse, not just bigger. Enterprise software runs on a master spec plus a constellation of sub-specs. When a sub-spec gets regenerated independently — cleanly, by agents doing exactly what they were asked — the result is a module that's internally sound and structurally foreign to everything around it. A well-made limb, grafted onto a body it was never designed to match. That's a different failure than the pre-AI Big Ball of Mud (Foote & Yoder, 1997), which is organic — one mess, continuous, everywhere. Frankenstein bolt-ons are discrete: individually clean pieces, stitched together badly. The failure isn't inside any part. It's at the seams.

## The seasoned manager's fork

Now put the seasoned manager in front of the same cheap power, and the outcome isn't foregone at all. Three things can happen, and they're not equally likely or equally bad.

The first is the naive manager's failure transplanted onto someone who should know better: bolt-on everywhere, because it's so cheap, why not. Same Frankenstein mechanism, less excuse — this manager isn't confused about the architecture, they're just not paying the discipline tax because nothing in the moment forces them to.

The second is the windfall banked instead of spent: the manager directs agents to inspect the existing corpus, clean it, harden it. Same cheap agentic labor, opposite allocation — debt paydown instead of feature sprawl. The house money effect predicts reckless spending. It doesn't require it. Some people save the windfall.

The third is the one worth sitting with, because it isn't the villain case at all: targeted, wholesale replacement of one specific subsystem that's been a known, chronic problem for years. This manager isn't panic-rebuilding the whole product out of fear of illegible code — they're making a scoped, history-informed call against a part of the system they understand completely, because they've been living with its failures. That's not the house money effect running unchecked. That's judgment using the new power exactly as it should be used: bounded, deliberate, earned by scar tissue rather than avoided out of fear of it.

Put those three branches next to each other and the thesis sharpens considerably. It was never "regenerate bad, refactor good." It's that the same tool amplifies whatever judgment was already in the room — making good judgment cheaper to execute, and bad judgment cheaper to indulge. The house money effect explains who's vulnerable to the second outcome. It doesn't guarantee it.

## What actually fixes it

None of this argues for never regenerating. It argues for treating the seam — the moment a freshly regenerated piece meets the existing body — as a place that needs real engineering attention, not a place you drop new code and walk away. Before a regenerated sub-spec's code gets bolted on, agents need to actually investigate the surrounding corpus and propose the refactoring required to integrate cleanly, under real oversight from someone accountable for the fit — the same Technical Product Owner discipline this series has argued for from the start. That oversight is exactly what separates branch three from branch one: the difference between a scoped call and a habit.

That's not a platitude if the backlog is doing its job. A well-decomposed backlog isn't just a task queue — it's a refactoring reference. Tasks cite other tasks. Code carries comments back to the backlog item that produced it. A refactoring agent doesn't need to hold an entire illegible corpus in its head; it can walk a bounded, cited graph of what was built together before, and scope its work from there. That's the difference between "a control plane with no memory of its own history" — which is amnesia wearing governance's clothes — and one that actually remembers.

It costs something real to work this way. In one project's own numbers, a full automated test run takes roughly fifteen minutes, and a task that needs a few runs during implementation can stretch from thirty minutes to three hours. That's not a rounding error — it's a six-fold difference, paid in exchange for not being in perpetual beta. It's exactly the cost a manager riding a cheap-regeneration windfall is most tempted to skip, because in the moment, skipping it is free. It only stops being free once you count the seams.

Kent Beck and Martin Fowler, at a Thoughtworks retreat in February 2026, put a name on the version of this that shows up before the code ever gets touched: cognitive debt — the idea that disciplined practice isn't a luxury agentic tooling makes obsolete, it's the precondition for using that tooling well. That's the actual resolution here, not a return to writing everything by hand. The craftsmanship stance that "we don't ship shit" was always aiming at wasn't really about who typed the code. It was about whether anyone was accountable for what shipped. Agentic AI didn't remove that question. It just made it a lot cheaper to avoid asking.

Easy come, easy go was never really about the money. It was about what you didn't have to earn to get it — and what that does to your judgment once you have it.

## Bibliography

- Thaler, R. H., & Johnson, E. J. (1990). "Gambling with the House Money and Trying to Break Even." *Management Science*.
- Erlikh, L. (2000). "Leveraging legacy system dollars for e-business." *IT Professional*.
- Glass, R. L. *Facts and Fallacies of Software Engineering*.
- Foote, B., & Yoder, J. (1997). "Big Ball of Mud." Pattern Languages of Program Design.
- Willison, S. (April 2026). First-person essay on discarding an AI-built prototype.
- Beck, K., & Fowler, M. — "cognitive debt" framing, Thoughtworks Deer Valley retreat (February 2026), as reported.

_Working title, unplaced in the series. Full research and design context in [research-easy-come-easy-go.md](research-easy-come-easy-go.md) and [the design doc](../superpowers/specs/2026-08-18-easy-come-easy-go-article-design.md)._
