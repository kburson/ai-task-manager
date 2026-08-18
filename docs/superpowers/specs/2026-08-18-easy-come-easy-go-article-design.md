# Article Design: "Easy Come, Easy Go"

Status: draft design, pending user review
Series: AI Task Manager Article Series (docs/articles/)
Placement: **deliberately undecided.** Per explicit user instruction, this
article is drafted first and evaluated for tone/fit before any decision on
where it lands in the series (front, end, standalone/unlisted) or whether
the Draft Sequence gets renumbered. Nothing in this design should assume a
slot number.

Research foundation: [research-easy-come-easy-go.md](../../articles/research-easy-come-easy-go.md)

## Premise

Money that arrives without earned effort gets spent without earned judgment
— the "house money effect" that shows up in gambling, windfall investing,
and (per the original pitch) in the folk psychology around prostitution and
political money. Agentic AI tooling hands product managers the power to
build and rebuild software without the earned cost that used to force
restraint — writing the code, staffing engineers, living with schedule
pain. Without that earned cost, some managers — intoxicated by newly
developing agentic muscles, not fundamentally worse people — default to
regenerating rather than hardening whenever the software needs to change.
This produces genuinely disposable, ever-shifting codebases instead of one
evolving, hardened codebase, directly contradicting the "we don't ship
shit" craftsmanship ethos and the series' own Agentic Agile Delivery
thesis.

## Core thesis (converged through research + discussion)

The mechanism is not "AI makes code cheap to lose." It's narrower and
sharper: **when a manager regenerates a product from an updated spec
instead of directing agents to refactor the existing codebase to meet that
spec, the code is fully replaced — different language, structure, and
patterns are all live possibilities — while only the *product* (features,
workflow, UX) actually evolves.** The spec can carry memory forward
(Kaizen); the code underneath it, in a full-regeneration cycle, cannot.

Two consequences follow, at two different scales:

1. **Perpetual beta (single-product scale).** Every regeneration cycle
   resets code maturity to zero. Feature polish and workflow thinking
   compound cycle over cycle (because that lives in the spec); code
   stability never compounds, because the product never goes through a
   hardening phase before the next rebuild. The product can never leave
   beta, by construction — not because of bad luck, but because the org
   keeps re-paying the cheap initial-build cost and never pays the
   expensive, unavoidable maintenance cost. (Maintenance is well-documented
   as 60-80% of total lifecycle cost — Erlikh 2000, Glass's *Facts and
   Fallacies of Software Engineering* — a distinct, safe claim from Boehm's
   contested cost-of-change multipliers, which this article does not cite.)

2. **Frankenstein bolt-ons (enterprise scale).** Large products can't be
   defined by one spec — a master spec plus sub-specs refine different
   portions. When a sub-spec is regenerated independently, the new module
   can be internally well-built (agents aren't sloppy) while being
   structurally incoherent with the rest of the body — a different style
   limb grafted onto an existing torso. This is categorically different
   from the pre-AI "Big Ball of Mud" anti-pattern (Foote & Yoder, 1997):
   BBoM is organic, continuous decay of one codebase; Frankenstein is
   discrete incoherence between separately-generated, individually-clean
   pieces. The failure is at the seams, not inside the parts.

**Resolution:** the fix is not "never regenerate." It's that **stitching
becomes a deliberate, governed engineering activity** — before a
regenerated sub-spec's code gets bolted on, agents (under real Technical
Product Owner oversight, per the series' existing Agentic Agile Delivery
model) investigate the surrounding corpus and propose the refactoring
needed to integrate the new piece, rather than dropping it in next to the
old. This is the same evidence-based-oversight mechanism the series already
argues for (articles 05, 09) — applied specifically at integration seams,
where regeneration cycles are most likely to introduce incoherence.

## Structure (three acts, thesis-first)

Matches the series' existing analytical-essay voice (articles 04, 09) —
concept-first, not narrative-first — per the earlier structural discussion.

1. **Hook + analogy.** Open on the "easy come, easy go" phrase and the
   house money effect (Thaler & Johnson, 1990) as a legitimate academic
   anchor, then the "power drunk manager with newly developing muscles"
   image — not a moral failing, an immature-skill problem, which is what
   makes the resolution optimistic rather than cynical. Ground it with one
   concrete case (Willison's April 2026 essay on discarding a working
   AI-built prototype) before generalizing.
2. **The mechanism.** Regenerate vs. refactor as the actual fork in the
   road. Distinguish spec evolution (can carry memory, is often genuinely
   good — better UX, better feature balance) from code evolution (does not
   automatically follow from spec evolution in a full-regeneration
   pattern). Introduce the maintenance-cost economics here: regeneration
   defers the expensive phase, it doesn't eliminate it.
3. **Two scales of consequence.**
   - Perpetual beta at product scale.
   - Frankenstein bolt-ons at enterprise scale (contrast explicitly with
     Big Ball of Mud to make the "discrete incoherence vs. organic decay"
     distinction legible).
4. **The Agentic Agile Delivery answer.** Governed stitching as a concrete
   practice, not a platitude — corpus-aware refactoring proposals as a
   first-class, evidenced step at every regeneration/integration boundary.
   Land on Beck & Fowler's "cognitive debt" framing (Thoughtworks Deer
   Valley retreat, Feb 2026) as the resolution anchor: craftsmanship
   discipline is the precondition for effective AI collaboration, not an
   obsolete luxury.

## Citations: use, correct, or avoid

Full detail in the research file; summary for drafting discipline:

- **Use as-is:** Thaler & Johnson (1990) house money effect; Foote & Yoder
  (1997) Big Ball of Mud; Erlikh (2000) / Glass maintenance-cost-share
  literature; GitClear 2026 Maintainability Gap report; Beck & Fowler
  cognitive-debt framing; Willison's April 2026 essay.
- **Use only in corrected form:** Uncle Bob Martin's "we don't ship shit" —
  present as the historical craftsmanship stance being tested, not as his
  current unqualified position (he has reportedly stepped back from
  line-by-line AI code review in 2025-2026). Do not imply he still holds
  the line unchanged.
- **Do not cite as fact:** Boehm's cost-of-change curve multipliers
  (1x/6.5x/15x/100x) — flagged as likely-fabricated folklore by Bossavit.
  Brooks' "build one to throw away" — he retracted this himself in 1995;
  do not use as clean precedent for planned disposal.
- **Note but do not lean on:** the 932K-PR survival-analysis study (AI code
  modified less often). Established in discussion that this measures a
  different phenomenon (human ownership-avoidance in mixed codebases) than
  this article's core mechanism (wholesale regeneration with no human
  code-layer decision at all). May get a single-sentence mention as a
  related-but-distinct pattern; should not be treated as primary evidence
  for this article's claim.
- **Verify before drafting:** exact citations for the survival study, the
  Beck/Fowler retreat reporting, and Uncle Bob's 2025-2026 pivot were
  gathered by research agents without fully pinned URLs. Pin sources before
  they appear in published prose.

## Tone / voice notes

- Match established series voice: analytical essay, first person plural or
  direct address as used elsewhere in the series (confirm against
  article-production-plan.md's voice guide during drafting).
  - No emoji per repo-wide formatting rule.
  - No trailing summaries in the article itself — the piece should end on
    the resolution, not a recap.
- The "power drunk manager" framing should read as diagnosis, not
  contempt — the article's own resolution (governed stitching, evidence-
  based oversight) only lands as credible if the diagnosis stays
  sympathetic to the underlying incentive (nobody hands you new muscles and
  expects you to lift conservatively on day one).
- Big Bang Theory-style riff title deferred along with placement — do not
  title this article yet. If/when titling happens, "Frankenstein" and
  "Perpetual Beta" are both strong concrete-noun-phrase candidates per the
  style guide, worth revisiting then.

## Open questions / explicitly deferred

- **Placement in the series** — front, end, or standalone. Deferred until
  the drafted article's tone and transitional fit can be evaluated, per
  explicit user instruction.
- **Title** — deferred alongside placement.
- **Whether "orphaned code" gets any mention at all** — current design
  treats it as, at most, a single contrasting sentence ("even short of full
  regeneration, the same psychology shows up as code nobody touches") to
  avoid diluting the sharper two-act (perpetual beta / Frankenstein)
  structure. Confirm this scope call during the write.

## Success criteria

- The article is honest about the complicating research (Brooks' own
  retraction, the disputed Boehm curve, Uncle Bob's pivot) rather than
  citing them uncorrected — this was the user's explicit bar for the
  research phase and should carry into drafting.
- A reader can walk away with a concrete, testable diagnostic: look at
  whether your spec revisions carry memory of what broke, and look at
  whether your codebase has ever been through a real hardening phase versus
  being perpetually regenerated.
- The article functions as a credible bridge from "the dawn of Agentic
  Development" toward "the need for governed Agentic Agile Delivery,"
  regardless of where it ultimately sits in the series — this was the
  user's original test for whether the piece belongs in the series at all.
