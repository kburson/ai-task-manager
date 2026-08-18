# Narrative Arc: Agentic Agile Delivery — Trust Through Review (Articles 10-13)

<!-- markdownlint-disable MD034 -->

## Status

- **Article 10** — drafted. Six-practice XP walk. No dependency on unfinished tooling.
- **Article 11** — **drafted** ("The Diff Isn't Where Your Judgment Lives Anymore"). Code review's evolution from checklist to judgment call, the SDD pivot (there's no diff worth reviewing when you didn't write the code), the design-review gap, and what a single reviewer — human or AI — actually misses.
- **Article 12** — **drafted** ("It's All About Perspective"). Same-model dual review (Codex) as a homogeneous ensemble, cross-model co-review (AITM) as a heterogeneous one, the driver/navigator iteration loop, and convergence theater as the honest risk.
- **Article 13** — **deferred** until the co-review tool itself gets usability improvements. Experiment design is settled; execution is not scheduled.

Series terminology note: use **Agentic Agile Delivery** (author is also weighing "Agile Agentic Delivery" — word order undecided, pick one and stay consistent within a given article), not "agentic development" — the frame is value delivery under agile discipline, not just tooling/dev-experience. Applies across the whole series, not just this group.

Style note for 11-13 specifically (per author direction): section headers should not state the thesis or give away the moral before the scenery is explained — no "X became Y" headers like article 10 uses. Keep headers topic/scene-based (e.g. "The quiet part," "Same classroom, different classroom"), let the reveal land in the prose.

## The Road So Far — corrected framing (2026-08-16, author correction)

Important correction to how this whole arc should treat spec-driven development: **SDD is a rung on a ladder, not the destination.** Article 11 currently opens the ladder at "linting → CI → agentic pattern review" and treats the SDD pivot as the endpoint worth dwelling on. That undersells the arc — SDD is one stop along a longer migration, and the actual destination (where AITM lives) is the next rung past it, currently being called **agent orchestration** in industry coverage (Forrester: "orchestrated SDLC agents"; Devoteam's 2026 SDD retrospective frames SDD itself as transitional). The author's preferred name for that next rung specifically is **Agentic Agile Delivery** — not a generic synonym for "agent orchestration," but a specific claim: orchestration done under agile discipline (small sequenced backlog items, evidence-based acceptance, a human tiebreak at authority boundaries), not just "agents coordinating agents."

The full ladder, each rung solving the previous rung's failure mode and introducing a new one:

1. **AI-as-pair (Copilot era).** AI sits next to a human who is still the author, highlighting and fixing errors in code the human wrote. Bundled function: real-time error-catching on human-authored code. Limitation: still bottlenecked on human typing speed and human-only authorship.
2. **Vibe coding.** AI goes from suggesting to generating, on loose natural-language prompts, minimal human effort. Genuinely exciting — people built things they couldn't have built alone. Failure mode: unshippable. What got created often cost more to fix than to rebuild from scratch, because nobody — human or AI — had verified intent survived translation at any checkpoint.
3. **Prompt engineering.** The industry's first fix for vibe coding's failure: tighten the prompt itself, add more explicit direction, try to keep the agent on-rails through better instruction-writing. Failure mode: still insufficient once the requested scope exceeds what fits in a reasonable context window — agents hallucinate under scope pressure regardless of how well the prompt is worded, because the problem isn't prompt clarity, it's scope size.
4. **Spec-driven development.** The fix for prompt engineering's failure: stop trying to over-specify a single giant prompt, and instead author a detailed specification that gets broken down into smaller tasks sized to fit a context window. This is where articles 11 and 12 currently center their argument, and it's real progress — but it has its own failure mode: a farm of agents working a decomposed backlog task-by-task loses the forest for the trees. Local task correctness doesn't guarantee the sum adds up to the spec's actual intent.
5. **Agent orchestration / Agentic Agile Delivery.** The fix for SDD's failure: don't just decompose once and release the farm — keep every agent's work legible and checked against the whole, end to end. In AITM's implementation specifically: vibe-level skills help a human draft an initial spec, that spec gets refined through cross-model co-review (the "tango" — see Article 12), a plan gets generated from the ratified spec and _also_ goes through a co-review tango (prose, structure, and feasibility checked against the spec), the ratified plan hydrates into a backlog of small, sequenced tasks, and one or more agents work that backlog along a fixed, instrumented process — a **racetrack** — that tracks and validates progress at every stage rather than releasing agents to run free.

### AITM's specific bet, and how it differs from the alternative already in the wild

Codex has been observed using an ADR-style approach: architectural decisions accumulate in a sidecar repository or database, and code gets generated from that store. AITM's bet is different: the **GitHub issue backlog is the metadata store of record**, supplemented by git commit logs and code diffs as the evidentiary trail — no separate sidecar store. Where AITM spends the most engineering effort (arguably over-engineers) is exactly the racetrack: keeping an agent on-task through every stage of delivery, and generating a detailed, demonstrable audit trail of what was planned, what was committed, and what was actually delivered, at every step. Whether the issue-backlog-as-source-of-truth bet is the _right_ architectural choice versus a sidecar ADR store is an open question the author is not claiming to have resolved — it's the path that felt right, not a proven-superior one. That epistemic honesty is worth preserving in prose, not smoothing over.

### What this means for the co-review framing specifically

Cross-model co-review (article 12's subject) is not the whole AITM story — it's the part of AITM currently being surfaced to readers first, because it's the most novel and least obviously-motivated piece if you only know the SDD version of the story. The series should keep sight of the full road (rungs 1-5 above) even while article 12 zooms into rung 5's review mechanic specifically. Two co-review tangoes actually happen in AITM's flow — one over the spec, one over the plan generated from that spec — and article 12 currently only describes the spec-level tango. Whether to fold the plan-level tango into article 12 or hold it for a later article is an open drafting decision, not yet made.

## Validation Pass + Overlap Check (2026-08-16)

Full claim-by-claim validation and bibliography now live in
[research-synopsis.md](research-synopsis.md#the-evolutionary-ladder-2026-08-16-addition)
and its new "Ladder & Agent Orchestration Sources" bibliography subsection.
Headline results:

- All five ladder rungs check out against citable sources. Nothing in the
  author's ladder message needed correcting — Copilot-as-pair (2021,
  GitHub's own "AI pair programmer" branding), vibe coding (Karpathy,
  Feb 2025, later disowned as a "throwaway tweet" for weekend projects),
  prompt engineering as a named transitional phase (Gartner 2024,
  promptware-engineering literature), SDD's context-window/scope
  limitation (Chroma Research's "Context Rot" study, July 2025), and
  "agent orchestration" as the live 2026 industry term for the rung past
  SDD (Forrester, Devoteam, plus a June 2026 arXiv taxonomy paper —
  "From Prompt to Process" — that independently converges on the same
  artifact/traceability/human-review pattern AITM bets on).
- "Agentic Agile Delivery" (and "Agile Agentic Delivery") is confirmed as
  the author's own coinage — no source found uses either phrase. Keep
  presenting it that way in prose: a specific branding claim layered on
  top of the observed industry term, not a synonym for it.
- The "farm of agents loses the forest for the trees" SDD failure mode is
  independently corroborated, not just an AITM-internal observation:
  2025-2026 multi-agent-coding research finds decomposed output stays
  internally consistent per task but drifts across the whole (naming,
  pattern fit) once budget is held constant, and uncoordinated swarms can
  silently burn budget without ever converging.
- Codex's ADR-sidecar pattern is a real, documented approach (sidecar
  `docs/adrs/` directories referenced via `AGENTS.md`, with compliance
  ranging from advisory to enforced) — the contrast drawn against AITM's
  issue-backlog bet is fair, not a strawman.

**Overlap check against articles 00-09** — read in full (00, 01, 02, 06, 10) or grepped for the relevant terms (all others) before writing this:

- **Rungs 1-4 of the ladder are already asserted, piecemeal, in the
  existing series** — just never laid out as a single numbered
  progression. Article 00 already says Technical Product Operations
  "is not prompt engineering with a better title." Article 02 already
  says "Specification engineering is replacing prompt engineering as the
  entry point." Article 01 already fully owns the vibe-coding failure
  mode under the "vibe slop" / review-debt framing, with its own
  bibliography (METR, Stack Overflow, GitClear, WSJ, OWASP) — that
  ground should not be re-plowed with new citations, just referenced.
  **Implication for drafting:** the ladder should read as _connective
  tissue that names the throughline already implicit across articles
  00-02_, not as new territory. A single compact paragraph or footnote
  gesturing back to those articles ("if you've read this far in the
  series, rungs 1-4 are the road already walked") does more work than
  re-arguing each rung from scratch.
- **Article 10 already uses "driver and navigator" for the co-review
  pairing analogy** (in its pair-programming section), and article 12
  reuses that same pairing independently — this is continuity, not
  repetition, and worth leaving as-is; it rewards a reader of the full
  series without confusing a reader who starts at 12.
- **No factual conflicts found** between the new arc's claims and
  articles 00-09's existing claims about the industry timeline. The
  original series already frames SDD as "necessary but not sufficient"
  (article 02's own title) — i.e., it already treats SDD as a
  way-station, not an endpoint. That means article 11's current opening
  (which reads like SDD is the destination) is inconsistent with the
  original series' own article 02, not just with the new correction —
  an additional, independent reason to revise article 11's framing.
- **Nothing in 00-09 mentions "agent orchestration" or names a rung past
  SDD** — that's genuinely new ground for article 11+ to cover, not a
  repeat.

**Action still open:** revise article 11's opening so SDD reads as a rung
the series already covered (with a light backward gesture to articles
00-02) rather than the endpoint of the climb, and to accurately name
agent orchestration / Agentic Agile Delivery as the rung this new arc is
actually climbing toward. Not yet done — holding per the author's own
sequencing (validate → review arc → review 0-9 → _then_ revise prose).

## Group Thesis

XP's twelve practices were bundled solutions to problems created by one constraint: humans were the only available reviewers, and human review was slow and expensive. Agentic delivery relaxes that constraint unevenly. Some XP practices got mechanized outright. Some had their underlying purpose relocated to an earlier phase of delivery. At least one — collective ownership — lost its enforcement mechanism and nothing replaced it. And at least one XP argument, the flattened cost-of-change curve, may partially invert under agents rather than persist.

The pairing across all four articles: **10 makes the general claim** (practices survived, their reasons didn't, here's the map — and it ends on the honest crack: the human tiebreak only works if someone still understands the code well enough to use it). **11 and 12 walk the design-review question that crack opens up** — does a single reviewer, human or AI, actually know a codebase well enough to say what's safe to land, and does adding a second reviewer fix that or just add noise, depending on whether the second reviewer thinks anything like the first. **13 tests the resulting claim empirically** — does front-loaded cross-model spec review actually pay for itself in reduced implementation cost, which is a direct rebuttal of Beck's "defer decisions, change is cheap" argument, updated for a world where context is not free and rework cascades across an already-generated backlog.

## Article 10 — "The XP Survival Anomaly" ("XP's Practices Survived; Their Reasons Did Not")

### Structure

Six XP practices, each mapped to what happened to it under agentic delivery:

| XP Practice          | Original Purpose                                                                                                                | What Happened Under Agentic Delivery                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testing (test-first) | Design pressure — writing the test first forces confronting the interface before building it                                    | Became an **evidence artifact**, not a design instrument. Agents emit test + implementation together; the test is now a receipt, not a forcing function.                                                                                                                                                      |
| Pair programming     | Bundled four functions at one keyboard: real-time defect detection, discipline enforcement, design dialogue, knowledge transfer | **Disaggregated.** Defect detection → CI/lint/gates. Discipline enforcement → state-machine refusal (`verify-develop.mjs`, evidence gates). Design dialogue → moved earlier and async (co-review at spec/plan stage, driver/navigator vocabulary intact). Knowledge transfer → **no replacement. The crack.** |
| Planning game        | Customer and team negotiate scope collaboratively, iteration by iteration                                                       | Became **backlog as control plane** — the artifact the human actually reviews and holds in their head, instead of syntax. JIT planning replaces up-front exhaustive planning.                                                                                                                                 |
| Collective ownership | Anyone can change any code; shared understanding prevents silos                                                                 | **Broken, unreplaced.** Pairing enforced this by rotation; nobody rotates through agent-generated code the same way. Nobody on the team necessarily reads what shipped.                                                                                                                                       |
| Sustainable pace     | Protect against burnout-driven defects from overwork                                                                            | **Inverted.** Agents don't tire. The ceiling is now human review capacity, not implementation capacity — the bottleneck moved from code production to safe acceptance.                                                                                                                                        |
| On-site customer     | A human with product authority is always available to resolve ambiguity and arbitrate                                           | Becomes the **human tiebreak / gate approver** — the role that stops two agents from reaching false consensus (see Article 12's "convergence theater" risk).                                                                                                                                                  |

Practices intentionally left out of the walk (metaphor, coding standard, small releases, simple design, refactoring, continuous integration): either don't shift materially under agents, or would be a stretch to force into the six-practice frame without diluting it.

### Key reframes to hit

- Not "pairing declined" — pairing's four bundled functions separated, and three were replaced while one wasn't.
- Not "we still do TDD" — the red-green ritual survived, its _reason_ (design pressure via forced interface confrontation) evaporated. Same artifact, different function.
- XP pairing was synchronous, real-time, human-bound, and expensive — which is why it never stuck economically at most orgs. Co-review is asynchronous and mechanized, which is why the _reviewed-by-a-second-perspective_ function of pairing might actually survive better under agents than it did under humans.
- Collective ownership is the honest crack in the piece — the practice XP most depended on for defect prevention and knowledge continuity has no agentic-era analog yet. Don't paper over this with a tidy resolution.

### Closing thread (into Article 11)

The on-site customer became the human tiebreak — the role that catches false consensus before it ships. But a tiebreak only works if the human calling it still understands the codebase well enough to make the call. That's not a given, for a human _or_ an AI reviewer. Article 11 opens on exactly that question.

## Article 11 — "The Diff Displacement" ("The Diff Isn't Where Your Judgment Lives Anymore") (drafted)

See [13-the-diff-displacement.md](13-the-diff-displacement.md).

Opens on code review's climb from checklist (linting, static analysis) to judgment call (pattern fit, decomposition) — familiar ground for the reader. Pivots on the SDD reality: if you authored the spec and the agent did everything downstream (implementation, tests, PR, merge), there's no diff worth reviewing line by line, because it can't tell you whether your intent survived translation. That relocates the real review target from code to spec — and observes that spec review hasn't climbed the same ladder code review has. Closes on what a single reviewer, human or AI, actually misses (no ground truth, hallucination, one set of blind spots applied consistently) — including the honest human-review failure mode (approving diffs without holding the blast radius in your head) as the parallel case, not a strawman unique to AI. Ends teasing: a second reviewer only helps if it can see something the first one couldn't, which depends on who you pick.

## Article 12 — "The Second Reviewer Corollary" ("It's All About Perspective") (drafted)

See [14-the-second-reviewer-corollary.md](14-the-second-reviewer-corollary.md).

### Core claims covered

1. **Same-model dual review is a homogeneous ensemble.** Codex's dual-agent review is two samples from one model. Sampling twice reduces variance (catches things one pass happened to miss) but not bias, because both reviewers share the same training distribution and the same blind spots. Agreement between them is weaker evidence than it feels like.
2. **Cross-model co-review is a heterogeneous ensemble.** AITM's co-review (currently Opus 5 vs. Codex Sol 5.6) partially decorrelates the errors. Agreement between two systems that fail _differently_ is much stronger evidence than agreement between two systems that fail the _same_ way. Delivered via a "two grad students from the same cohort" (correlated training) vs. "swap one for a student from a different program entirely" (decorrelated training) analogy, plus the mechanics of the fixed, non-swapping author/reviewer loop: the author always revises in response to feedback, the reviewer always evaluates the revision and whatever wasn't addressed, each taking in new input every turn — cycling until there's nothing left either side is willing to contest.
3. **Convergence theater is the honest risk.** Two models can converge on a shared wrong answer, and the risk compounds across turns because both agents anchor on the accumulated review record. "Cycle until both agree" is satisfiable by mutual accommodation and reviewer fatigue, not just by the spec actually improving. XP's answer to a similar risk was the on-site customer: two developers agreeing was never the acceptance criterion, a human with product authority was. The article names the specific tell to watch for: a reviewer _withdrawing_ an objection rather than getting it resolved — that's the turn that needs a human tiebreak.

### Closing thread (into Article 13)

None of this is free. A co-review session that runs a dozen turns to reach consensus burns real tokens before a single line of implementation code exists. The obvious objection: doesn't that front-loaded cost just relocate the expense instead of saving it? That's the empirical question Article 13 tries to answer.

## Article 13 — "The Cross-Model Mutex Reverberation" ("Two PhDs and a Mutex") (working title, deferred)

### Core claim to test

**The un-flattened cost-of-change curve.** Beck's XP argument was that testing, refactoring, CI, and simple design **flatten the cost-of-change curve**, which is why XP could defer decisions instead of doing big design up front. The candidate counter-argument for agentic delivery: late change stopped being cheap the way it was under XP, because (a) context is no longer resident and free — it has to be reconstituted from durable artifacts, and (b) a spec defect doesn't cost one change, it cascades across an already-generated backlog of N work items that each already burned implementation tokens. If that's right, agentic delivery partially _un-flattens_ the curve, and that restores the economic case for up-front rigor — but at the spec layer, not the design-document layer XP was arguing against. Front-loaded review cost is hypothesized to be recovered, and then some, by avoiding that cascading rework.

### Back-of-envelope economics (estimates only, not measured)

- A spec: single-digit thousands of tokens.
- A review turn: spec + JIT codebase sampling + analysis — tens of thousands in, a few thousand out.
- A dozen turns: high hundreds of thousands to low millions of tokens.
- An epic's full implementation (worktrees, test suites, debug loops, demote/rework cycles, review stages): comfortably several million tokens.
- Implied overhead: co-review is roughly 10-20% of total epic cost. Break-even requires preventing about one story's worth of rework. That's a low bar — the interesting question isn't whether it pays off, it's _how much_ and _which failure modes it actually catches_.

### Measurement design (settled, execution deferred)

**Rejected approach:** compare #1268 (the co-review tool itself, already co-reviewed) against other closed epics that weren't co-reviewed. Fails on four counts: n=1, extreme selection bias (author knows this epic best), author effect (not blind to the treatment), no baseline distribution to compare against.

**Rejected approach 2:** fork the real repo at the pre-implementation commit for #1268, replay the pre-co-review spec draft, measure the diff against the actual (post-review) implementation. Better — matched pair, same codebase, same starting state — but **not blind**: the implementer has already built this once with the reviewed spec, so knowledge of the destination will leak into how the unreviewed run is driven, biasing the result in favor of the reviewed spec for reasons unrelated to spec quality.

**Adopted approach — blind A/B in an isolated sandbox:**

- Repo: `aitm-test` (separate repo, AITM installed via package tarball, already exists as a working sandbox).
- **Two GitHub repos**, not one — `aitm-test-unreviewed` / `aitm-test-reviewed` (or equivalent) — because a full-auto agent doing `gh issue list` / `gh api` can see the other arm's issue and PR history even from a different local clone if they share a remote. GitHub-visible state is the contamination vector that's easy to miss; local directory and session isolation alone don't cover it.
- **Two local clones**, each its own working-directory path, so Claude's memory system (scoped by absolute path) is isolated by construction — no special "don't remember" instruction needed, isolation is structural.
- **Two fresh sessions** (new chat, not a continuation) per arm, to prevent within-session transcript contamination.
- Fake feature spec authored once. One arm gets the pre-co-review draft; the other gets the spec after a **real** co-review run (Opus vs. Codex, run for real on the fake feature, not hand-simulated) — this also produces the review-phase token cost as a first-class measurement, not just the downstream implementation savings.
- Both arms otherwise run the full AITM flow untouched (issue creation → develop → test), full-auto, identically.

### Metrics to capture per arm

- Total tokens (review-phase and implementation-phase, reported separately)
- Session / wall-clock time
- Number of `demote --rework` cycles
- Defect issues spawned mid-task
- AC/scope edits made after plan approval
- Final test-pass state

### Why this is deferred

The co-review tool itself (issue #1268) is still being implemented — the experiment can't run cleanly until the tool it's testing is stable enough to use without babysitting. Revisit once #1268 ships and the co-review UX no longer requires manual intervention mid-run.

## Data Accumulated So Far

- Epics that have gone through real co-review to date: **#1117, #1268, #1269**.
- #1268 (the co-review tool itself) is currently in implementation, using the co-reviewed spec.
- Candidate baseline epics for a _future_ retrospective distribution (not part of the article-13 blind experiment, but useful context and a possible follow-on measurement): #508, #727, #859, #905, #912 — all closed, all instrumented by AITM's existing signals:

| Signal                                                 | Where it lives                 | What it proxies                 |
| ------------------------------------------------------ | ------------------------------ | ------------------------------- |
| `demote --rework` events per story                     | timing log / state transitions | implementation-time pivots      |
| Defect issues spawned mid-task (`BLOCKED` annotations) | issue graph                    | scope discovered late           |
| AC/scope edits after `aitm-plan-approved`              | issue body markers             | plan churn                      |
| Develop→Test dwell time                                | stage entry markers            | implementation friction         |
| Context words per delivered item                       | timing log                     | token cost per unit of delivery |
| `Actual Session Time`                                  | project board                  | human cost                      |

This baseline work is not scheduled — captured here so it isn't lost, and so a future retrospective comparison has a ready-made signal list instead of starting from scratch.
