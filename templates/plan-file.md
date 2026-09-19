# <title>

## Scope

<what is being built and why; what is out of scope>

## Context

<background, constraints, key decisions made during discovery>

## Acceptance Criteria

- [ ] <criterion 1>
- [ ] <criterion 2>

## Plan Metadata

- Priority: <P0|P1|P2|P3>
- Size: <XS|S|M|L|XL>
- Estimate: <N hours>
- Labels: <label1>, <label2>

## Story Intent

<!--
The bracketed field values below deliberately reuse AITM's canonical story
placeholders so an untouched scaffold remains a draft at Plan approval.
-->

- **Beneficiary:** [who wants to accomplish something]
- **Capability:** [what they want to accomplish]
- **Need:** [what gap or failure makes it necessary]
- **Value or failure prevented:** [why they want to accomplish that thing]

## Implementation Tasks

### Task 1: <task title>

#### Story Intent

- **Beneficiary:** [who wants to accomplish something]
- **Capability:** [what they want to accomplish]
- **Need:** [what gap or failure makes it necessary]
- **Value or failure prevented:** [why they want to accomplish that thing]

#### Files

<task scope and implementation notes>

**Verification Commands:**

```sh
# <replace with an executable verifier>
```

## Worked example guide

The fenced example is guidance only. Copy and adapt it; fenced headings are not
live decomposition tasks.

````markdown
### Task 2: Prevent partial publication

#### Story Intent

- **Beneficiary:** release operator
- **Capability:** stop publication when registry checks fail
- **Need:** publication can otherwise expose an incomplete package
- **Value or failure prevented:** consumers receive only complete releases

**Verification Commands:**

```sh
node --test scripts/tests/unit/release.test.mjs
```
````
