# #2073 local source inventory and estimate

Scope: implementation forecast for the accepted specification whose SHA256 is `04682ad4c797d328b4675d866af6908e061b256cb15ad82fe523fb9363cc7d68`. Parent supplied its committed reference `52ff0fe73`; this reviewer has not run Git to attest that reference. Evidence is local source inspection only. No historical cloud tasks, live provider calls, implementation experiment or test runtime was used.

## Verdict

**The complete accepted scope does not have a credible four-hour estimate or a defensible five-hour integration exception from the inspected evidence. Planning estimate: 6.5 hours, with a plausible 6–9 hour range.** This is a reasoned forecast, not measured implementation duration or validated performance. The minimum plan already contains more than five hours of necessary implementation, adverse-case proof and integration work even with narrow fresh reads and existing transports. Do not enter a fabricated four-hour estimate or label the extra work a surprise integration complication: it is known scope now.

The specification requires a governed split or revised owner budget before implementation if the scope exceeds five hours. No split or revised budget is enacted here. The parent should present this concrete result before treating the unchanged full-scope plan as implementation-ready. Further local planning can proceed without implementation, but it cannot clear the owner scope/budget gate.

## Lowest-complexity compliant design

Choose fresh narrow readers for each effect read; do not add checkpoint sharing or modify `executeEstimateWriter`, `decomposition-publication` or ownership protocols. Existing ownership collectors and predecessor registry observations stay complete. Capture target identity in an invocation-local envelope and preserve durable subject/digest schemas. This removes the most expensive optional cache-invalidation work, but leaves required target validation, strict body parsing, parent continuity and integrated baseline evidence.

## Existing seams and precise limits of reuse

| Local source | Verified reusable seam | New work still required |
| --- | --- | --- |
| `scripts/gh/lib/gh-client.mjs` | Mutable `ghClient.execFile`, `.spawn` and `.pexec`; exported pexec resolves late. Default real-gh guard exists. | The driver must cover all three forms, including streamed GraphQL stdin; overriding only pexec does not cover github-projects. |
| `scripts/gh/lib/github-projects.mjs` | `gh` uses execFile for simple CLI reads and spawn for stdin; `gql` uses that same transport; membership returns issueId/itemId. | Stateful query-aware answers, exact selection projection, mutation application and dispatch classification. |
| `scripts/task-tracker/lib/decomposition-authority.mjs` | Default body read calls shared `gh`; the direct child_process pexec is only local plan git-show. `readPlanAtCommit` is injectable. | No production body-transport overlay is needed. Use local plan bytes; keep readIssue/readProject/readForecast production logic intact. |
| `scripts/task-tracker/lib/decomposition-hook-authority.mjs` | `deps.graphql` and `deps.readPlanAtCommit`; existing three-page, five-second remote/six-second total bounds. | Separate first child-presence query, strict-kind reuse, graph phase, identity checks and root fence, plus tests for visible drift and incomplete pagination. |
| `scripts/task-tracker/lib/decomposition-field-writer.mjs` | Three concrete adapters in makeEffects, writer subject available. | Narrow target query, typed field-definition/value/identity validation, invocation-local node identity and strict body-block reader. |
| `scripts/task-tracker/lib/estimate-writer-publication.mjs` | Existing full authorization, before-value records, ownership checkpoints and retry protocol can remain unchanged. | New readers need old-record compatibility and uncertain-outcome tests at real writer boundaries. |
| `scripts/tests/fixtures/estimation-publication.mjs` | Realistic issue-body builder and state patterns. | It mocks complete collector ports and membership, so it cannot prove dispatch budgets. Reuse raw fixture data only. |
| `scripts/tests/fixtures/publication-subprocess.fixture.mjs` | Stateful persistent provider example and cross-process recovery cases. | It also mocks collector ports and mutations; adapt ideas, not authority success values. |
| `scripts/tests/integration/task-tracker/lib/decomposition-hook.cases.mjs` | Native binding/hook fixtures and actual source-hook route. | Current snapshot fixture omits child presence and returns fixed oversized data; it must become query-aware for measurement. |
| `scripts/tests/unit/task-tracker/gh/lib/project-tether-publication.cases.mjs` | Real refine/tether integration and nested writer drift cases. | Production collector dispatches are replaced there; retain as compatibility coverage, add separate real-collector budget driver. |

The proposed overlay contingency in the specification can be resolved to **no overlay for the known remote seams**. Any additional baseline seam discovered during execution must be retained and reviewed as transport-only before claiming comparability; that would consume the risk range rather than erase the cap.

## Bottom-up allocation

| Work package | Hours | Why it remains necessary after simplifying |
| --- | ---: | --- |
| Strict leaf classification and phased parent/pagination continuity, including focused adverse cases | 1.50 | Existing collector is 333 lines; initial query is deeply nested, and phase evidence/final fence are new behaviors. |
| Fresh target observation module, typed definition/value proof, strict body parsing and three adapter wiring | 1.50 | Existing readers recollect authority; no helper currently provides the required combined identity, field-definition and null guarantees. |
| Query-aware stateful baseline/optimized harness, pinned local source replay, independent budget oracle and report | 1.75 | Existing tests supply high-level authority observations, not complete transport dispatch evidence. Three transport shapes and baseline source selection are required. |
| Public-route, old-manifest, shared-caller and uncertain-outcome compatibility matrix | 1.00 | Fresh narrow reads affect migration/reevaluation/refine; success counts alone cannot prove recovery or public activation. |
| Review, required checks and focused repair allowance | 0.75 | Author review and ordinary lifecycle validation are part of delivery, not free overhead. |
| **Total** | **6.50** | No optional checkpoint-sharing API, production telemetry overhaul or full-cloud comparison is included. |

These allocations assume a skilled agent already oriented to the inspected source, no publication schema change, no network troubleshooting, offline fixtures can use existing local authority data, and no unexpected provider schema mismatch. They are intentionally narrower than a general cache design. A 5h plan would have to remove or underbudget accepted tests/harness work rather than merely simplify implementation.

## Concrete split candidate for owner consideration

1. **Admission optimization with its own proof: 2.5–3h.** Conditional children, strict classification, bounded phase/fence safety, real hook/plan-exit routing and leaf-shape/bounded-count baseline. Independently useful and testable.
2. **Concrete field observations with publication proof: 4–4.5h.** Fresh typed readers, real refine routing, reusable stateful transport driver, pre-change publication baseline, independent dispatch budget and old/uncertain recovery compatibility.

The sum can exceed the single-plan estimate because each independently delivered slice needs its own integration/review boundary. This is a candidate, not a new issue, dependency edge or revised ownership decision. The current full specification remains unchanged. No implementation action is authorized or performed.
