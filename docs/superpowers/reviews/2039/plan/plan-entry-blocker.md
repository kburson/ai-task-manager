# #2039 Plan-entry gate record

The owner requested advancing #2039 to Plan, authoring the implementation plan from the accepted specification, reviewing it with Astra 6/high SAR, committing all collateral and hydrating its tasks as children. Plan approval, Develop and implementation are outside this request.

## Observed state and refusal

Backlog → Refine completed through the registered refinement workflow. A second registered refinement invocation supplied XL, 96 hours, P0, rank 1 and a local engineering rationale. It refused Refine → Ready for Planning with exit 4:

> `refine-exit-missing: Start time is not set on the project board — re-enter Refine or backfill before promoting to Plan`

The subsequent current `npx aitm explain 2039 --json` returned action `promote`, status `blocked`, guard `plan-entry-fields-board`, code `unclassified-refusal`, and `noAutomaticRemediation.reason` equal to `legacy-guard-requires-human-investigation`. Its human decision requests a `human-operator` `manual-investigation`. There is no registered automatic remediation in that decision. The live body records Refine and `aitm-fields.values.startTime:null`.

The source helper `scripts/task-tracker/lib/stamp-start-time.mjs` owns the idempotent board Start time write and is called best-effort after successful Refine entry by `verbs/promote.mjs`. A successful transition does not prove this best-effort field stamp succeeded. The actual cause of its absence was not established; no transport failure is invented here.

## Boundary and concrete next action

A human operator must investigate and populate the missing Start time on #2039's project item, or authorize a specifically supported maintenance recovery. The retained Refine entry timestamp is `2026-10-20T03:56:27.558Z`; it is evidence for investigating that visit, not a fabricated field value or proof stamp. Preserve the field's native time representation and existing history.

After the operator resolves the field, query Explain again. Only a current ready decision permits the next registered step; continue Refine → Ready for Planning, then `npx aitm plan 2039`. Hydrate only the accepted committed plan, after enumerating existing children, with the exact specification and source-plan commit metadata. Do not create duplicate children after a partial split.

The parent has not bypassed this gate by raw board mutation, relabeling, demotion/reentry, changing configuration or forging lifecycle evidence. Plan drafting and document review may proceed in Refine; those documents must not claim Plan entry, approval, hydration or implementation occurred.
