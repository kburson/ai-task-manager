# The "Big Bang Theory" Title Formula — Reference Guide

A working reference for riffing article titles in this series off the
episode-title pattern from *The Big Bang Theory* (CBS, 2007–2019).

## The rule, in one line

Every episode title (except the pilot, literally titled "Pilot") follows:

> **"The" + [a concrete, often mundane or absurd noun phrase from the plot] + [a fake-scientific term: theory, principle, or phenomenon]**

The joke is the collision: something trivial or embarrassing (a hamburger, a
peanut, a dumpling, a pair of pants) gets dressed up in the vocabulary of a
physics paper (postulate, hypothesis, corollary, anomaly, decay). The title
sounds like it belongs on arXiv. The plot is Sheldon arguing about a
Halloween costume.

Source: [Wikipedia, "List of The Big Bang Theory episodes"](https://en.wikipedia.org/wiki/List_of_The_Big_Bang_Theory_episodes)
— confirms the formula explicitly: titles "always start with 'The' and
resemble the name of a scientific principle, theory or experiment,
whimsically referencing a plot point or quirk." Across the series' run the
writers used 169 distinct pseudo-scientific terms; the most reused were
"Reaction" (7x), "Excitation" (6x), and "Hypothesis," "Implementation,"
"Insufficiency," "Polarization," "Reverberation," "Vortex" (5x each).

## Anatomy of a title

Two slots, always in this order:

1. **The concrete noun phrase** — usually 2-3 words, always something
   small, physical, or embarrassing, pulled directly from an in-episode
   detail. Never abstract on its own.
   - `Fuzzy Boots`, `Dumpling`, `Panty Piñata`, `Electric Can Opener`,
     `Pulled Groin`, `Cushion`, `Wiggly Finger`, `Pants`
2. **The pseudo-scientific suffix** — a real (or real-sounding) term from
   physics, chemistry, math, or general "science paper" vocabulary. This
   word is doing all the comedic lifting; it's what makes the trivial noun
   phrase sound like a peer-reviewed finding.
   - `Hypothesis`, `Corollary`, `Effect`, `Postulate`, `Paradigm`,
     `Paradox`, `Anomaly`, `Duality`, `Conjecture`, `Reaction`,
     `Polarization`, `Decay`, `Theorem`, `Expansion`, `Triangulation`,
     `Conundrum`, `Instability`, `Permeability`, `Capacitance`,
     `Saturation`, `Decoupling`, `Deviation`, `Fluctuation`, `Deficiency`,
     `Vortex`, `Amplification`, `Formulation`, `Congruence`,
     `Approximation`, `Collision`, `Acquisition`, `Fragmentation`,
     `Alternative`, `Recurrence`, `Catalyst`, `Stimulation`,
     `Implementation`, `Excitation`, `Extrapolation`, `Revelation`,
     `Permutation`, `Diffusion`, `Maneuver`, `Contraction`, `Solution`,
     `Disintegration`, `Transformation`, `Convergence`, `Acceleration`,
     `Reflection`, `Indeterminacy`, `Sublimation`, `Equivalency`,
     `Turbulence`, `Isotope`, `Renormalization`, `Nanocluster`,
     `Juxtaposition`

## Worked examples from the source

| Concrete noun phrase | Suffix | Full title |
|---|---|---|
| Hamburger | Postulate | The Hamburger Postulate |
| Fuzzy Boots | Corollary | The Fuzzy Boots Corollary |
| Bat Jar | Conjecture | The Bat Jar Conjecture |
| Panty Piñata | Polarization | The Panty Piñata Polarization |
| Electric Can Opener | Fluctuation | The Electric Can Opener Fluctuation |
| Staircase | Implementation | The Staircase Implementation |
| Skank Reflex | Analysis | The Skank Reflex Analysis |
| Beta Test | Initiation | The Beta Test Initiation |
| Werewolf | Transformation | The Werewolf Transformation |
| Excelsior | Acquisition | The Excelsior Acquisition |

Note the last two rows: **"Acquisition," "Initiation," "Transformation,"
"Implementation"** are already close enough to real software vocabulary
that they barely need translating — that overlap is exactly why this
formula transplants well onto a software-delivery article series.

## Adapting the formula to this series

Swap the register but keep the two-slot structure exactly:

> **"The" + [a small, concrete, often slightly absurd detail from the article's actual argument] + [a term that sounds like it belongs in an SDLC/agile/CS paper]**

Where the sitcom's suffix vocabulary is drawn from physics and chemistry,
ours should be drawn from software engineering, agile ceremony, and CS
theory — words that already sound self-important in a standup meeting:
`Regression`, `Refactor`, `Rollback`, `Race Condition`, `Deadlock`,
`Convergence`, `Divergence`, `Drift`, `Latency`, `Backpressure`,
`Idempotency`, `Consistency`, `Invariant`, `Coupling`, `Cohesion`,
`Throughput`, `Saturation`, `Bottleneck`, `Escalation`, `Rollout`,
`Deprecation`, `Migration`, `Reconciliation`, `Consensus`, `Partition`,
`Timeout`, `Retry`, `Fallback`, `Handoff`, `Sprawl`, `Debt`.

The concrete-noun-phrase slot should pull from something genuinely small and
specific inside the article — a detail from an anecdote, an artifact name,
a tool, a moment of friction — not the article's thesis restated. The thesis
lives in the *subhead/dek*, same as the show never explained the science pun
in the title itself; the punch is in the mismatch, not the clarity.

### Quick riff pass on the current series (draft, not committed)

For reference only — none of these replace the working titles without your
sign-off. This is meant as a "what would it sound like" sandbox:

| # | Current working title | Big-Bang-style riff |
|---|---|---|
| 0 | The Rise Of Technical Product Operations | The Backlog Governance Postulate |
| 1 | The Vibe Coding Hangover | The Vibe Coding Deficiency |
| 2 | Spec-Driven Development Is Necessary But Not Sufficient | The Spec-Driven Insufficiency |
| 3 | The Rise Of The Technical Product Owner | The Product Owner Escalation |
| 4 | The Backlog Becomes The Control Plane | The Backlog Control-Plane Conjecture |
| 5 | The Just-In-Time Planner | The Just-In-Time Planning Paradox |
| 6 | Context Durability Is A Feature | The Context Durability Corollary |
| 7 | Evidence Beats Trust | The Evidence-Over-Trust Theorem |
| 8 | The Adapter Future | The Adapter Convergence |
| 9 | Agentic Concurrency Isn't Free | The Agentic Concurrency Deficiency |
| 10 | XP's Practices Survived. Their Reasons Did Not. | The XP Survival Anomaly |
| 11 | The Diff Isn't Where Your Judgment Lives Anymore | The Diff Displacement |
| 12 | It's All About Perspective | The Second Reviewer Corollary |
| 13 | Two PhDs and a Mutex | The Cross-Model Mutex Reverberation |
| — | (this prequel) | The Refactoring Bloat Precursor |

Some of these land better than others — that's expected from a first pass.
Use this table as raw material to riff from live, not as a proposed rename.

## Display format: riff title + working-title caption

Confirmed direction: each article keeps its riffed title as the H1, with the
original descriptive working title immediately underneath as a bold
caption/subtitle line. The riff is the hook; the caption is the thing a
reader actually skims to know what the article is about. Blank line between
the two, then the normal dek/opening line continues below as usual.

```markdown
# The Backlog Governance Postulate

**The Rise Of Technical Product Operations**

*A second opinion only counts if it didn't come from the same classroom.*
...
```

This makes the riff free to be as playful as it wants, since the caption
underneath always carries the literal meaning — same division of labor as
the show's title-vs-episode-plot relationship: the title is the joke, the
episode itself is the content.

## Guardrails, so the joke doesn't get precious

- **One pun per title, max.** The show never stacked jokes in a title; the
  concrete phrase carries the specificity, the suffix carries the punch.
  Two competing jokes in one title reads as trying too hard.
- **The suffix word should be real, or real-adjacent.** Part of what makes
  the format work is that "Corollary" and "Renormalization" are genuine
  terms — nonsense words break the illusion of a real paper title.
- **Don't force it onto every article.** The show itself had exceptions
  (the pilot). If a title works better straight, let it stay straight —
  this is a device to reach for, not a mandate to rename the whole
  masthead.
- **Titles still need to be legible on LinkedIn without the joke landing.**
  A reader who's never seen the show should still be able to guess the
  article's subject from the concrete-noun-phrase half, even if the
  pseudo-scientific half reads as pure flavor.

## Bibliography

- Wikipedia, ["List of The Big Bang Theory episodes"](https://en.wikipedia.org/wiki/List_of_The_Big_Bang_Theory_episodes) — naming-convention statement, full episode title list, term-frequency counts.
