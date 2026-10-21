1. Attach a valid `aitm.workflow-exception/v1` record that waives the semantic implementation-review requirement for an issue and denies managed provider execution.
2. Run the issue through Test and invoke `npx aitm review N`. Review records `review:waived`, leaves Agent Review Passed false, and advances the issue to Review without emitting false success evidence.
3. Invoke `npx aitm deliver N` for the same accepted head.
4. Observe the hard refusal `delivery-preflight:agent-review-evidence` even though the current workflow-exception authority intentionally requires the distinct waived outcome.

Observed while delivering `kburson/ai-peer-review` issue #60 at source commit `99d6a3033cedc595fa2349130e36ff78fdd86e19`.
