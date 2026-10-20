# Implementation review request

Requested reviewer: `gpt-6-astra`, reasoning `high`, fresh context (`fork_turns: none`). Agent: `/root/review_2073_implementation`. This records the dispatch parameters and scope; it is not an independent provider attestation.

Range: 69b5b18b377d7fe886390b4d98d2fa0d6d41e85f to ca8e27895259537d8ebbe634e4023d77b7b37f28. Exact package: [review diff](review-69b5b18b3..ca8e27895.diff). Authority: accepted #2073 spec and plan; rubric: requesting-code-review/code-reviewer.md. Author rulings: [execution ledger](progress.md).

The fresh reviewer was asked to inspect the whole implementation read-only, write only its report, make no GitHub/AITM/Git mutations, and dispatch no other reviewer. Review production admission, target readers, unchanged publication integration, transport selection fidelity, deadline and pagination safety, retained traffic reports and test coverage. Return actionable findings with severity and a complete declined-to-judge list. Native CI, Test and Review were explicitly pending. The baseline-only membership amendment, preserved 51-child readiness refusal and narrowly scoped historical lint exceptions were disclosed.

## Plan Review Focus supplied verbatim

1. An unmarked legitimate leaf is admissible, but malformed, misplaced, duplicate and unknown kind markers must refuse (Task 1).
2. Missing values are legitimate null only with complete current field definitions, correct type and exact item ownership; unrelated field variants must not create false missing evidence (Task 2).
3. A provider may apply a mutation and then lose its acknowledgement; recovery must read fresh state and not duplicate an applied effect (Task 2).
4. An offline fixture that returns fields not selected can invent a traffic win; selection-aware responses and independent request budgets must expose that defect (Task 1).
5. Older publication records have no new node IDs; target identity must be reacquired without rewriting subject, intent or ownership evidence (Task 2).

## Stopping policy

One fresh whole-implementation review, followed by one author TDD correction pass for Important/Critical findings and a full suite. No second review dispatch. All findings, author dispositions and declined-to-judge rulings are retained.
