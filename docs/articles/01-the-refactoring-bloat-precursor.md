# The Refactoring Bloat Precursor

**Before Agents Lived In The Clouds: A Brief History Of AI-Assisted Coding**

Every "AI-assisted development" conversation acts like it started in 2023. It didn't. The tooling that made AI-assisted coding thinkable — refactoring engines, lightweight editors, code-trained language models, a platform to hang all of it on — was built by hand, one grinding step at a time, for two decades before an agent ever opened a pull request. This is that lineage.

Consider this the prequel: the ground I want under your feet before I tell you what I've learned working with agentic delivery over the past year.

## The refactoring era and the tool that got too heavy

JetBrains shipped ReSharper in 2004 as a Visual Studio extension for .NET developers — not a standalone editor, a plugin that sat inside Microsoft's IDE and rewired how C# and VB.NET got written. Twenty years and 2,200+ built-in on-the-fly inspection rules later, JetBrains calls it their longest-standing commercial product and the most-downloaded extension in the Visual Studio Marketplace ([JetBrains: ReSharper 20 Years](https://blog.jetbrains.com/dotnet/2024/07/23/resharper-20-years/)). It's the direct ancestor of the "understand the code, not just the text" idea that every AI coding tool now takes for granted — real-time inspection, structural refactoring, navigation that follows semantics instead of grep.

ReSharper never touched JavaScript in any serious way, and it was never a JetBrains IDE feature — it was bolted onto *Microsoft's* IDE. JetBrains' own IDEs (IntelliJ IDEA, WebStorm) shipped that inspection engine natively; ReSharper was JetBrains porting the same idea into somebody else's editor.

And that plugin got heavy. JetBrains' own support documentation, going back to 2009-era beta notes and still open today, catalogs the complaint — Solution Wide Analysis alone could add gigabytes of memory overhead on a large solution (one cited case: 600MB without ReSharper, 2.3GB with it), and the standard fix was "turn off half the analysis, add more RAM" ([JetBrains: Visual Studio with ReSharper is slow](https://resharper-support.jetbrains.com/hc/en-us/articles/4405071760402-Visual-Studio-with-ReSharper-is-slow)). That tax on the full-IDE-plus-plugin model is not incidental to what came next — it's a direct cause. A generation of developers had it burned in that sitting a heavyweight analyzer on top of a heavyweight IDE meant your workstation ground to a crawl. That experience is a real part of why "a lightweight text editor with plugins" became an appealing category on its own, rather than "the IDE just gets more powerful."

## The editor that ate the IDEs

Microsoft announced Visual Studio Code at Build in April 2015, open-sourced it under MIT that November, and it graduated preview in April 2016 ([Wikipedia: Visual Studio Code](https://en.wikipedia.org/wiki/Visual_Studio_Code); [Swiftorial: History of VS Code](https://www.swiftorial.com/tutorials/development_tools/vs_code/introduction_to_vs_code/history_of_vs_code/)). It's built on Electron — a JavaScript/Chromium desktop shell — and on the Monaco editor component Microsoft had already shipped for browser-based code editing in 2013. VS Code positioned itself, and was broadly received, as a fast, free, extensible *editor* — not a competitor to the full IDEs it sat next to. IntelliJ IDEA and WebStorm (JetBrains) and Visual Studio proper (Microsoft) were IDEs in the traditional sense: project model, integrated debugger, integrated build, integrated everything. VS Code shipped thin and let extensions add the rest, which is exactly the reaction to the ReSharper-style bloat problem above — pay for the weight only in the areas you actually use.

## The compute encumbrance moves to the cloud

OpenAI announced Codex in July 2021 — a version of GPT-3 that OpenAI had fine-tuned specifically on source code, more than a year *before* ChatGPT existed ([OpenAI Codex, Wikipedia](https://en.wikipedia.org/wiki/OpenAI_Codex_(language_model))). Code-specific training came first for OpenAI's own model lineage; general-purpose chat came after. That ordering matters for what follows: the model existed before any editor product wrapped it.

Microsoft built Copilot on top of that Codex model and turned it into an online service wired into GitHub, the open-source-heavy hosted git platform Microsoft had acquired three years earlier, in 2018 ([Microsoft: Completes GitHub acquisition](https://blogs.microsoft.com/blog/2018/10/26/microsoft-completes-github-acquisition/)). Copilot launched as a technical preview in June 2021, branded as a GitHub product from the start — GitHub's own product layer on OpenAI's code-tuned GPT-3, and the acquisition's first real AI-era payoff. Copilot's first client happened to be a VS Code extension, because that's where the developers already were. It went GA in June 2022, and it landed in more editors over time — JetBrains IDEs, Neovim, Visual Studio proper — a genuine multi-editor spread, not a brand migration.

Worth being precise about what "ran on your desktop" meant, because it bundles two different things. The client — the extension you installed, that read your open files and rendered the suggestion inline — always ran locally. But the completions themselves never ran on that desktop. The extension shipped your surrounding code to a hosted Codex model over the network and streamed the suggestion back — there was no local inference. "A free plugin you installed in VS Code" and "a paid, cloud-hosted GitHub service" aren't competing descriptions of two different eras; they're the client half and the compute half of the same product, true at the same time, from the first technical preview.

That architecture is also the direct rebuttal to the ReSharper story above. ReSharper's failure mode was a heavyweight analyzer sitting on a workstation, eating gigabytes of RAM until the fix was "turn off half the analysis, add more RAM." Copilot never had that failure mode available to it, because the expensive part — the model — was never on the workstation in the first place. The editor-vs-IDE split happened because local tooling got too heavy; Copilot's cloud-inference client sidestepped that fight entirely by moving the weight off the desktop before it could accumulate. Two decades of "make local tooling lighter" gave way to "stop putting the heavy part locally at all."

Copilot eventually evolved, moving toward "automation partner in the cloud," and that shift is dated cleanly: GitHub shipped Copilot Workspace as a technical preview in April 2024 — hand it an issue, it produces a spec, a plan, and a diff — then folded what it learned into the general-availability Copilot coding agent in 2025, which runs autonomously in its own GitHub Actions-backed sandbox, opens branches, and asks for review ([GitHub: Coding agent for GitHub Copilot](https://github.com/newsroom/press-releases/coding-agent-for-github-copilot)). That's the pairing-tool-grew-into-a-cloud-agent arc, and it happened in 2024-2025 — three years after Copilot's own 2021 launch.

## The ChatGPT shockwave, and what it did and didn't start

ChatGPT launched November 30, 2022, and hit a million users in five days ([History.com: ChatGPT released](https://www.history.com/this-day-in-history/november-30/chatgpt-released-openai)). A lot of the public noise in that first year was low-stakes novelty — marketing copy, spam bots, gimmick emails. But it wasn't the beginning of AI writing code. Codex-powered Copilot had already been generally available for five months when ChatGPT shipped. What ChatGPT actually did was make natural-language interaction with a capable model something a non-specialist could do from a browser tab, which is what turned "AI can write code" from a GitHub-extension niche into a mainstream, cross-industry story — accounting, law, medicine, research, and eventually software all got pulled into the same wave, just because the interface got that much more accessible. 2022 was rough for *general-purpose* chat AI; code-generation AI had already had a full year of production use by then.

Worth separating two different kinds of viral, since GPT-3 (June 2020, API access) and Codex-powered Copilot (June 2021, editor extension) drove two different things. GPT-3's virality was diffuse — demos, screenshots, "look what this thing can write" — and largely confined to people with API access; it primed the cultural moment for "language models are getting good" without changing anyone's actual workflow. Copilot's reach was narrower but far stickier: it put a code-specific model directly inside the daily editing loop of everyone who installed it, which is a fundamentally different kind of adoption than a demo seen once and closed. GPT-3 primed the moment. Copilot is where the AI-assisted-coding paradigm actually landed.

## 2023-2024: the field actually opens up

Anysphere launched Cursor in March 2023 — a fork of VS Code with AI built into the core editing loop rather than bolted on as an extension ([Cursor, Wikipedia](https://en.wikipedia.org/wiki/Cursor_(code_editor))). By 2024 the roster — Cursor, Claude, ChatGPT, Gemini — were all genuinely live and competing on code generation, with Anthropic pushing its Opus line hard through 2024 and into 2026 ([hidekazu-konishi.com: Claude Release Timeline](https://hidekazu-konishi.com/entry/anthropic_claude_model_release_timeline.html)).

## The loop closes

As of ReSharper 2026.1, JetBrains extended its C# tooling beyond Visual Studio to support VS Code *and* Cursor — the tool that helped make "lightweight editor plus plugins" the dominant model is now shipping into the editors that model produced. Two decades on, refactoring-engine and AI-coding-agent lineages are converging back into the same editor surface.

The loop didn't stop moving once that convergence landed, either: on August 14, 2026, SpaceX closed a $60 billion all-stock acquisition of Cursor, folding it into a new SpaceXAI unit ([Wikipedia: Cursor (company)](https://en.wikipedia.org/wiki/Cursor_(company))). What it means to have a coding agent owned by a launch-and-compute company, rather than a cloud vendor or an AI lab, isn't settled yet — that's a thread for a later article in this series, not this one.

## Series Link

That's the prequel: two decades of tooling that made agent-based delivery thinkable before any agent could act on its own. Here's where the rest of the series picks up. Code production is no longer the bottleneck in getting an idea from concept to customer — the next article, [The Rise Of Technical Product Operations](02-the-backlog-governance-postulate.md), argues that the discipline that actually matters now is backlog governance and evidence-based acceptance of agent-produced work.

## Series Roadmap

| Status      | #      | Article                                                                                         | Role In Series                                       |
| ----------- | ------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **Current** | **01** | **[The Refactoring Bloat Precursor](01-the-refactoring-bloat-precursor.md)**                     | Prequel: history of AI-assisted coding before agents  |
|             | 02     | [The Rise Of Technical Product Operations](02-the-backlog-governance-postulate.md)               | Industry thesis: Technical Product Operations         |
|             | 03     | [The Vibe Coding Hangover](03-the-vibe-coding-deficiency.md)                                     | Failure mode: vibe slop and review debt                |
|             | 04     | [Spec-Driven Development Is Necessary But Not Sufficient](04-the-spec-driven-insufficiency.md)   | Why specs need execution governance                    |
|             | 05     | [The Rise Of The Technical Product Owner](05-the-product-owner-escalation.md)                    | Human operator: TPO/TPM as delivery architect          |
|             | 06     | [The Backlog Becomes The Control Plane](06-the-backlog-control-plane-conjecture.md)              | Backlog as executable control surface                  |
|             | 07     | [The Just-In-Time Planner](07-the-just-in-time-planning-paradox.md)                              | Progressive decomposition and deep dives                |
|             | 08     | [Context Durability Is A Feature](08-the-context-durability-corollary.md)                        | JIT loading and post-compaction recovery                |
|             | 09     | [Evidence Beats Trust](09-the-evidence-over-trust-theorem.md)                                    | Evidence gates and auditability                         |
|             | 10     | [The Adapter Future](10-the-adapter-convergence.md)                                              | Backlog and agent platform adapters                     |

## Bibliography

- JetBrains, ["ReSharper 20 Years!"](https://blog.jetbrains.com/dotnet/2024/07/23/resharper-20-years/), JetBrains Blog, 2024-07-23.
- JetBrains, ["Visual Studio with ReSharper is slow"](https://resharper-support.jetbrains.com/hc/en-us/articles/4405071760402-Visual-Studio-with-ReSharper-is-slow), ReSharper Support.
- JetBrains, ["More Performance Problems in 6.1: Slow and Excessive Memory Usage"](https://resharper-support.jetbrains.com/hc/en-us/community/posts/206666025-More-Performance-Problems-in-6-1-Slow-and-Excessive-Memory-Usage), ReSharper Support community post.
- Wikipedia, ["Visual Studio Code"](https://en.wikipedia.org/wiki/Visual_Studio_Code).
- Swiftorial, ["History of VS Code"](https://www.swiftorial.com/tutorials/development_tools/vs_code/introduction_to_vs_code/history_of_vs_code/).
- Microsoft, ["Microsoft completes GitHub acquisition"](https://blogs.microsoft.com/blog/2018/10/26/microsoft-completes-github-acquisition/), Official Microsoft Blog, 2018-10-26.
- Microsoft News, ["Microsoft to acquire GitHub for $7.5 billion"](https://news.microsoft.com/source/2018/06/04/microsoft-to-acquire-github-for-7-5-billion/), 2018-06-04.
- Wikipedia, ["OpenAI Codex (language model)"](https://en.wikipedia.org/wiki/OpenAI_Codex_(language_model)).
- GitHub Blog, ["Under the hood: Exploring the AI models powering GitHub Copilot"](https://github.blog/ai-and-ml/github-copilot/under-the-hood-exploring-the-ai-models-powering-github-copilot/).
- GitHub Newsroom, ["GitHub Introduces Coding Agent For GitHub Copilot"](https://github.com/newsroom/press-releases/coding-agent-for-github-copilot).
- Java Code Geeks, ["GitHub Copilot Workspace & The Agentic Era"](https://www.javacodegeeks.com/2026/02/github-copilot-workspace-the-agentic-era.html), 2026-02.
- History.com, ["ChatGPT, the generative AI chatbot, is released"](https://www.history.com/this-day-in-history/november-30/chatgpt-released-openai).
- Wikipedia, ["Cursor (code editor)"](https://en.wikipedia.org/wiki/Cursor_(code_editor)).
- Wikipedia, ["Cursor (company)"](https://en.wikipedia.org/wiki/Cursor_(company)).
- hidekazu-konishi.com, ["Anthropic Claude Model Release Timeline"](https://hidekazu-konishi.com/entry/anthropic_claude_model_release_timeline.html).
