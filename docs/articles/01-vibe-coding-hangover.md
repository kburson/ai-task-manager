# The Vibe Coding Hangover

<!-- markdownlint-disable MD034 -->

[Series](README.md) | Previous: [Research Synopsis](research-synopsis.md) | Next: [Spec-Driven Development Is Necessary But Not Sufficient](02-spec-driven-is-not-enough.md)

## Draft Thesis

The first wave of AI coding sold speed. The second wave has to answer for the cleanup.

AI can generate code quickly. That is no longer the interesting question. The useful question is whether the generated work reduces total delivery cost after review, integration, testing, rework, security checks, and long-term maintenance are counted.

That is where unmanaged "vibe coding" breaks down. A large prompt can produce a large result, but the human team still has to determine whether the result is correct, maintainable, secure, and aligned with product intent. When that review burden is invisible, AI looks more productive than it really is.

## Core Argument

AI coding fails most often as a management-system problem, not as a raw model-capability problem.

The failure pattern is familiar:

- A broad prompt asks for a complete feature or subsystem.
- The agent produces plausible code and persuasive explanations.
- The reviewer must reconstruct intent, compare the implementation to unstated assumptions, and find the hidden defects.
- The team discovers that speed at generation time became friction at review time.

The industry now has public evidence for this pattern. METR found that experienced open-source developers in mature repositories took 19% longer when AI tools were allowed, even though they expected to be faster. Stack Overflow found that AI tool adoption is high while trust in output accuracy is low. GitClear's code-quality research raises maintainability concerns around churn, copy/paste, and duplication. OWASP identifies risks such as prompt injection, insecure output handling, and excessive agency.

None of this proves AI coding is useless. It proves that AI coding needs better constraints.

This is where familiar SDLC and agile practices become more important. A fleet of independent agents can generate more code than a human team can comfortably inspect in the same time window. Without work slicing, acceptance criteria, dependency management, test gates, and review gates, the throughput advantage becomes a governance problem.

## AITM Perspective

AI Task Manager starts from a different premise: do not hand the agent a giant wish. Hand it a governed work item.

The work item should contain:

- A narrow outcome.
- Acceptance criteria.
- Relevant context and dependencies.
- A defined workflow state.
- Entry and exit gates.
- Required verification evidence.
- A way to pause, pivot, switch, or demote when reality changes.

That turns AI from a free-form code generator into a participant in a managed delivery system.

The human role also changes. The TPO/TPM is not merely writing prompts. They are shaping the work system. The agents are low-level code technicians working inside bounded assignments; the TPO/TPM preserves product vision, architectural intent, and delivery sequence.

## Series Link

This article establishes the failure mode. The next article, [Spec-Driven Development Is Necessary But Not Sufficient](02-spec-driven-is-not-enough.md), explains why specifications improve the situation but still need story-level execution governance.

## LinkedIn Article Shape

Opening hook:

> We spent the first year of AI coding asking, "How much can the agent build?" The better question is, "How much can the team safely accept?"

Middle:

- Summarize the productivity/trust/quality evidence.
- Explain why generation speed hides review burden.
- Introduce story-governed delivery as the missing control loop.

Close:

> The future is not less product management. It is product management with sharper technical boundaries, clearer acceptance criteria, and evidence trails strong enough for agentic work.

## Bibliography

- METR. "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity." https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
- Becker, Joel; Rush, Nate; Barnes, Elizabeth; Rein, David. "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity." https://arxiv.org/abs/2507.09089
- Stack Overflow. "2025 Developer Survey: AI." https://survey.stackoverflow.co/2025/ai
- Stack Overflow. "Stack Overflow's 2025 Developer Survey Reveals Trust in AI at an All-Time Low." https://stackoverflow.co/company/press/archive/stack-overflow-2025-developer-survey/
- GitClear. "AI Assistant Code Quality 2025." https://www.gitclear.com/ai_assistant_code_quality_2025_research
- OWASP. "Top 10 for Large Language Model Applications." https://owasp.org/www-project-top-10-for-large-language-model-applications/
- OWASP. "LLM06:2025 Excessive Agency." https://genai.owasp.org/llmrisk/llm06-sensitive-information-disclosure/
- DORA. "State of AI-assisted Software Development 2025." https://dora.dev/dora-report-2025/
