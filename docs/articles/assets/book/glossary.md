# Glossary

<!-- Definitions seeded from docs/articles/series-style-guide.md `## Preferred Terms`. -->

## Agent fleet

_Aliases:_ agent fleets

A coordinated set of implementation agents working under backlog, dependency, and evidence controls.

## AITM

_Aliases:_ @kburson/ai-task-manager

An AI skill and npm package that supports GitHub-backed task workflows with Claude Code and Codex.

## Backlog Manager Pattern

Using the backlog as a durable control plane for agentic execution.

## Code-construction layer

The implementation layer where agents operate: syntax, local structure, framework mechanics.

## Delivery architect

_Aliases:_ delivery architects

A human operator role for senior engineers, technical product owners, or technical product managers who own decomposition, sequencing, fit, risk, and review.

## Evidence gate

_Aliases:_ evidence gates, evidence-gated
_See also:_ Story-governed delivery

A transition check that requires observable proof before work advances.

## Implementation agent

_Aliases:_ implementation agents
_See also:_ Agent fleet

An AI agent responsible for local code construction, syntax, framework mechanics, test execution, and narrow task delivery.

## Story-governed delivery

_See also:_ Evidence gate

The AITM pattern where specs become stories, stories carry gates, and gates require evidence.

## Technical Product Operations

The discipline of turning product intent, architecture guardrails, and delivery risk into an executable backlog that implementation agents can safely act on.
