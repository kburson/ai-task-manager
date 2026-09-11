# Governed plan policy design

## Problem

AITM can stamp Plan approval after checking issue-body command declarations, but it does not validate the linked implementation plan itself. A ratified plan can therefore prescribe a live issue-body write outside the public `npx aitm issue-body` boundary or place disposable operator artifacts under `.tmp/`, which the two-bucket scratch contract reserves for machine runtime state and generated output.

The repository already established the intended split in #1178 and #1181:

- `.scratch/` owns disposable operator-authored material, including issue-operation files, body drafts, plan fragments, and ad hoc inspection artifacts.
- `.tmp/` owns machine-local runtime state and generated output, including `.tmp/aitm/`, reports, coverage, and test output.

Production helpers and command help mostly implement that contract. Several shared rules and guides still describe operator GitHub artifacts under `.tmp/`, and Plan approval has no deterministic policy check.

## Decision

Add a linked-plan policy validator at the Plan-approval boundary.

`runPlanApprove` resolves the active plan using the existing `Implementation-plan`, `Source-plan`, then `Plan` metadata precedence. If no plan is linked, the policy is not applicable and existing compatibility remains unchanged. If a plan is linked but cannot be resolved inside the repository, approval fails closed. If it is readable, validation runs before any approval marker, directory-contract seal, or Full-Auto audit write.

The validator reports stable rule identifiers, one-based line numbers, and bounded excerpts for:

1. direct GitHub issue-body replacement commands;
2. executable calls to the internal issue-body mutator;
3. one-off JavaScript mutator commands in disposable GitHub scratch;
4. operator-authored GitHub or plan artifacts placed in the `.tmp/` runtime tree.

The accepted form for live issue-body mutation is the declarative `npx aitm issue-body #N --operation-file .scratch/gh/N-body-operation.json` command. The operation schema and the existing fresh-base mutation transaction remain unchanged.

## Validation boundary

The validator inspects only the plan currently linked from the issue being approved. It does not scan `docs/superpowers/plans/**` as a corpus. This makes the rule enforceable for new approvals without retrofitting or invalidating historical plans, including archived review evidence.

Matching is deliberately narrow and deterministic. It rejects executable shapes and the unambiguous `.tmp/gh/` or `.tmp/plan/` drift tokens. Prose that names `mutateIssueBody` without an executable call is allowed so architecture and migration plans can discuss the internal boundary. Runtime paths such as `.tmp/aitm/` remain valid.

## Authority ordering

Plan approval follows this order:

1. validate lifecycle state and adaptive-estimation prerequisites;
2. validate issue-body checklist command syntax;
3. resolve and validate the linked governed plan;
4. seal a directory contract or stamp the standard approval marker;
5. record Full-Auto audit provenance when applicable.

A policy refusal has no write side effects. It returns one stable Plan-evidence exit code through the existing command catalog.

## Guidance reconciliation

Normative author and reviewer guidance will use `.scratch/gh/` for operation files, comment bodies, issue-body drafts, and issue-creation fragments. Shared scratch rules and preferences will explicitly retain `.tmp/` for runtime/generated output. `CLAUDE.md` will direct operators to the public AITM verbs; internal production code continues to use the canonical fresh-base mutator implementation.

Documentation-contract tests will pin the high-risk surfaces: runtime helper behavior, config defaults, command help, shared rules, the deep-dive procedure, README, and affected guides.

## Compatibility and risks

- Existing issues without a linked plan keep their current Plan-approval behavior.
- Historical plans are not scanned or rewritten.
- Linked plan paths remain repository-relative, readable, non-symlink files under the worktree through the existing resolver.
- Directory-contract approval cannot bypass the policy because validation occurs before the seal branch.
- A new shipped validator module is an intentional package entry and must be accounted for by package-boundary verification if required.

## Verification

The focused policy suite proves accepted and refused plan shapes, linked-plan resolution, deterministic diagnostics, no-plan compatibility, and pre-write Plan-approval refusal. Existing unit, integration, slow, lint, formatting, and package-boundary suites prove repository compatibility.
