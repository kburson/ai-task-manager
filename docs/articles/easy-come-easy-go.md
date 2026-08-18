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

## Perpetual beta

Run that fork enough times and you get a product that never leaves beta — not because anything went wrong, but because of what "leaving beta" actually requires. A product graduates out of beta by surviving contact with real use: the edge cases nobody spec'd, the load patterns nobody predicted, the bugs that only show up after the thing has been alive for a while. That's what a hardening phase is for. It's also exactly the phase full regeneration skips, every single cycle, by construction.

The spec keeps compounding — features sharpen, workflows get better thought through, UX improves release over release, because the spec is the one artifact carrying memory forward. The code never compounds, because it's never the same code twice. So you end up with a product whose feature set keeps visibly getting better while its foundation resets to alpha-grade every cycle, and the two facts don't cancel out — they just run in parallel, invisible to each other, until the bug reports make it obvious.

## Frankenstein bolt-ons

Scale that same mechanism past a single product and it gets worse, not just bigger. Enterprise software can't run on one spec. It runs on a master spec plus a constellation of sub-specs, each covering a slice of the whole. When a sub-spec gets updated and its code gets regenerated independently — cleanly, by agents doing exactly what they were asked — you get a module that's internally sound and structurally foreign to everything around it. A different limb, well-made, grafted onto a body it was never designed to match.

Pre-AI software had its own version of this: the Big Ball of Mud, Foote and Yoder's 1997 name for what happens when a codebase decays continuously under years of small, uncoordinated compromises. That's not what this is. A Big Ball of Mud is organic — one mess, everywhere, all the time. What full regeneration produces at enterprise scale is discrete: individually coherent pieces, built clean, stitched together badly. The failure isn't inside any one part. It's at the seams.

## What actually fixes it

None of this argues for never regenerating. It argues for treating the seam — the moment a freshly regenerated piece meets the existing body — as a place that needs real engineering attention, not a place you drop new code and walk away. Before a regenerated sub-spec's code gets bolted on, agents need to actually investigate the surrounding corpus and propose the refactoring required to integrate cleanly, under real oversight from someone accountable for the fit — the same Technical Product Owner discipline this series has argued for from the start.

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
