# Research Foundation: "Easy Come, Easy Go"

Working research base for a not-yet-numbered, not-yet-placed article exploring whether agentic-AI-cheapened prototyping produces genuinely disposable codebases — and what that means for the series' Agentic Agile Delivery thesis. Mirrors the evidence-map structure of [research-synopsis.md](research-synopsis.md). This file is a research note, not a draft; it exists to answer one question before any drafting starts: **is the premise supportable, or does it need refactoring?**

## Executive Summary

The premise is supportable, but not in its raw form. The "house money effect" gives the title analogy a legitimate academic anchor. Pre-AI precedent for time-to-market eroding quality discipline is deep and well-documented. Current 2023-2026 data (GitClear's connectivity decline, the cognitive-debt framing from Beck/Fowler) supports a real, present-day version of the phenomenon. But two of the most obvious anchors — Brooks' "build one to throw away" and Boehm's cost-of-change curve — are compromised as citations and would undercut the article's credibility if used uncorrected. And one large counter-study complicates the story in a genuinely interesting way: agent-authored code isn't being thrown away more, it's being *touched* less — which may be a sharper, truer version of the same underlying problem.

**Verdict: proceed, with the premise adjusted from "code gets discarded" to "code stops being owned" as the sharper mechanism** — disposability and undertouched, unowned code are two faces of the same house-money psychology, and the article can hold both.

## Core Claim (as researched)

> When software is cheap to (re)build, the psychological cost of losing it drops — mirroring the house money effect in gambling and windfall-gain studies — so pressure that already existed to skip hardening in favor of shipping fast (time-to-market) now has a cheaper failure mode available: regenerate instead of repair. This produces either (a) literal disposal — throwing away and rebuilding from an evolving spec, or (b) ownership avoidance — code nobody touches because nobody feels responsible for code they didn't really "pay for." Both erode the compounding-improvement model (Kaizen, XP, "we don't ship shit") the series argues for.

## Evidence Map

### Positive Signal

- **Thaler & Johnson (1990), "house money effect"** — peer-reviewed, established behavioral-economics term for reduced loss aversion on windfall gains. Directly supports using "easy come, easy go" as more than a folk phrase.
- **Time-to-market / QA-shortcut precedent, pre-AI** — arXiv:1901.05771 (systematic review linking deadline pressure to defect rates), a PLOS ONE lab study, and named postmortems (Therac-25, Ariane 5, Knight Capital). Establishes this pathology predates AI; AI changes the economics, not the existence, of the pressure.
- **Ward Cunningham's technical debt metaphor (OOPSLA 1992)** — real anchor for the "alternative" framing, but a deliberately *different* concept from disposal: debt implies intent to repay/refactor. Worth naming the distinction explicitly rather than conflating debt and disposal.
- **Kaizen / Lean Software Development (Poppendieck, 2003)** — clean historical scaffolding for the incremental-improvement alternative.
- **GitClear 2026 "Maintainability Gap" report** (600M+ commits, quarterly refresh) — copy/paste up to 15.7%, cross-file connectivity down 35% since 2023. Strong, current, quantitative evidence that AI-era code is being bolted on rather than integrated.
- **Beck & Fowler, "cognitive debt" framing** (Thoughtworks Deer Valley retreat, Feb 2026, ~50 tech leaders) — craftsmanship-lineage figures arguing that disciplined practices are the *precondition* for effective AI collaboration, not an obsolete luxury. Likely the strongest single citation for the article's resolution/thesis section.
- **Simon Willison (April 2026)** — first-person account of discarding a working AI-built prototype over incoherent high-level architecture. Concrete, named, individual-level case evidence for literal disposal.

### Negative Signal

- **Brooks' 1995 retraction.** *The Mythical Man-Month*'s "plan to throw one away" is Brooks' own most-cited line — and he explicitly retracted it, calling it "too simplistic," in favor of incremental growth. Citing Brooks uncorrected as historical precedent for "planned disposal is fine" would be citing a position the author himself abandoned. If used at all, it must be used as the retraction, not the original claim.
- **Boehm's cost-of-change curve folklore problem.** The popular 1x/6.5x/15x/100x figures are challenged by Laurent Bossavit (*The Leprechauns of Software Engineering*) as unsourced, traced to unpublished IBM training material rather than a real study. The general shape (later fixes cost more) is defensible; the specific multipliers are not safe to cite as fact in a series that argues for evidence-based discipline.
- **Large-scale survival-analysis study** (932,791 PRs, 3,003 agent-authored, 201 repos) — found AI-agent-authored code is modified *less* often than human code (Hazard Ratio 0.842). This is direct counter-evidence to "AI code gets thrown away more." The authors' own caveat — this may reflect ownership-avoidance rather than code health — is the useful reframe: not "disposed of," but "orphaned."

### Complicating Signal

- **Uncle Bob Martin's own 2025-2026 pivot.** Reported to have stepped back from line-by-line review of AI-generated code in favor of a metrics/constraints framework. His original "we don't ship shit" stance still works as the historical position being contrasted — but presenting him as currently holding that line, unqualified, would be inaccurate. The article should use his *original* stance as the foil and can separately note his own evolution as evidence the field itself is still working this out.
- **"The Prototype Trap"** (Pramida Tumma, Medium, Apr 2026) — argues AI mainly compresses *initial build* time, not the dominant ongoing cost (running, scaling, securing, maintaining). Pushes back on the premise's core economic logic: if regeneration doesn't actually undercut the total cost of ownership, "cheap to rebuild" may be a partly false perception, which is itself worth writing about (the house-money effect works on *perceived* windfall, not necessarily real windfall).
- **Thin evidence at the organizational level.** Named case studies of companies deliberately choosing to harden and evolve AI-touched codebases under governed process are weak — mostly vendor blogs, one thinly-sourced Nubank/Devin migration claim. The article likely can't lean on third-party proof for "the alternative works at scale" and will need to argue from the series' own reasoning (and AITM's own internal signals, per the narrative-arc doc) instead.

## Positioning Principles (draft, pending user approval)

1. **Don't over-claim literal disposal.** The strongest, most defensible version of the thesis is narrower than "teams throw code away constantly" — it's "cheap regeneration changes the incentive calculus, and the observed effect is as much abandonment/orphaning as literal deletion."
2. **Correct Brooks and Boehm before using them, or don't use them.** Both are famous enough that an informed reader will know the complications; citing them cleanly would read as either uninformed or dishonest given this series' evidence-based-discipline thesis.
3. **Uncle Bob is a foil for a stance, not a currently-held position.** Frame "we don't ship shit" as the historical craftsmanship ethos being tested, not as Martin's unchanged 2026 view.
4. **Beck/Fowler's cognitive debt is the strongest resolution anchor** — consider it as the pivot point toward the article's Agentic Agile Delivery argument, the same role Cunningham's debt metaphor plays for classic technical debt.
5. **The survival-analysis counter-study is a gift, not a threat** — "code nobody touches" is a more precise and more unsettling claim than "code gets deleted," and ties cleanly back to ownership, review, and the series' broader "evidence beats trust" thesis (article 09).

## Sources (informal, as gathered by research agents — not yet fully normalized to a bibliography)

- Thaler, R. H., & Johnson, E. J. (1990). "Gambling with the House Money and Trying to Break Even." *Management Science*.
- Brooks, F. (1975/1995). *The Mythical Man-Month*, 20th Anniversary Edition (retraction of "build one to throw away").
- Cunningham, W. (1992). "The WyCash Portfolio Management System." OOPSLA experience report (technical debt metaphor origin).
- Boehm, B. — cost-of-change curve; critique: Bossavit, L. *The Leprechauns of Software Engineering* (2013).
- Poppendieck, M. & T. (2003). *Lean Software Development*.
- arXiv:1901.05771 — systematic review, deadline pressure and defect rates.
- PLOS ONE — laboratory study on time pressure and software quality.
- GitClear (2026). "Maintainability Gap" report.
- Beck, K. & Fowler, M. — "cognitive debt" framing, Thoughtworks Deer Valley retreat (Feb 2026), as reported.
- Survival-analysis study of 932,791 PRs / 3,003 agent-authored PRs across 201 repos (arXiv preprint, exact citation TBD — retrieve before drafting).
- Tumma, P. (Apr 2026). "The Prototype Trap." Medium.
- Willison, S. (Apr 2026). First-person essay on discarding an AI-built prototype.

**Note:** several sources above (survival study, GitClear specifics, Beck/Fowler retreat, Uncle Bob 2025-26 reporting) were surfaced by research agents without fully pinned URLs. Before drafting, verify and pin exact citations — do not publish soft-sourced claims as fact, consistent with the series' evidence discipline.
