# Evidence Beats Trust

<!-- markdownlint-disable MD034 -->

[Series](README.md) | Previous: [Context Durability Is A Feature](06-context-durability.md) | Next: [The Adapter Future](08-adapter-future.md)

## Draft Thesis

Agentic AI delivery should not ask teams to trust the agent. It should give teams evidence strong enough that trust becomes a byproduct.

## Core Argument

The trust gap is not abstract. Stack Overflow's 2025 survey found that more developers distrust AI output accuracy than trust it. METR found that experienced developers believed AI made them faster even when measured task time increased. OWASP and NIST both point toward the need for controls, risk management, and careful handling of AI behavior.

The lesson is direct: confidence without evidence is dangerous.

Agentic delivery needs observable proof:

- What issue was the agent working on?
- What state was the issue in?
- What acceptance criteria were checked?
- What tests ran?
- What failed?
- What changed after failure?
- What human decision was made?
- How much agent time and human review burden did the task consume?

Without that evidence, AI work becomes a chain of persuasive narratives.

Traditional SDLC ceremonies often degrade into status theater when evidence is weak. Agentic AI raises the cost of that weakness. If low-level code agents are producing work quickly, the TPO/TPM needs objective signals to decide whether work is really ready, blocked, defective, or done.

## AITM Perspective

AI Task Manager treats evidence as a first-class product of the workflow.

Examples:

- Timing logs show starts, pauses, updates, and closes.
- Context-word counters estimate human review burden.
- Gate checks prevent premature movement between workflow states.
- Pickup directives make tasks restartable after context resets.
- Post-compaction boot rules reload authoritative process files when compressed context can no longer be trusted.
- Deep-dive sections force the agent to inspect current repo state before implementation.
- Review gates require acceptance criteria and verification evidence before completion.

The goal is not bureaucracy. The goal is survivable autonomy.

Evidence is what lets the TPO/TPM supervise at a higher level without reading every generated line in real time. It turns agent output into inspectable delivery state.

## Better Executive Language

Avoid saying:

> This creates more trust than human teams.

Say:

> This creates more inspectable evidence than many human workflows currently capture.

That is both more defensible and more persuasive.

## Series Link

This article explains the trust mechanism. The final article, [The Adapter Future](08-adapter-future.md), explains why backlog systems and AI hosts need APIs that can carry these controls across platforms.

## LinkedIn Article Shape

Opening hook:

> I do not want to trust an AI agent. I want the agent to leave enough evidence that trust is no longer the main control.

Middle:

- Present the trust gap.
- Explain why chat logs are weak evidence.
- Show the evidence categories a governed workflow should capture.

Close:

> The mature AI delivery conversation will not be about whether the agent sounded confident. It will be about whether the work left a trail strong enough to review.

## Bibliography

- Stack Overflow. "2025 Developer Survey: AI." https://survey.stackoverflow.co/2025/ai
- Stack Overflow. "Mind the gap: Closing the AI trust gap for developers." https://stackoverflow.blog/2026/02/18/closing-the-developer-ai-trust-gap/
- METR. "Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity." https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
- DORA. "State of AI-assisted Software Development 2025." https://dora.dev/dora-report-2025/
- DORA. "ROI of AI-assisted Software Development." https://dora.dev/ai/
- OWASP. "Top 10 for Large Language Model Applications." https://owasp.org/www-project-top-10-for-large-language-model-applications/
- OWASP. "Agentic AI - Threats and Mitigations." https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/
- NIST. "AI Risk Management Framework." https://www.nist.gov/itl/ai-risk-management-framework
- NIST. "Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile." https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
- AI Task Manager. "Measurement and ROI." ../introduction/measurement-and-roi.md
- AI Task Manager. "How AI Task Manager Keeps Agent Context Small and Rules Fresh." ../introduction/context-management-skill-architecture.md
