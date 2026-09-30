# #1847 SAR selection refusal

Date: 2026-09-30.
Status: **review not performed; provider selection refused**.

- Artifact: `docs/superpowers/specs/2026-09-30-1847-governed-criteria-revisions-design.md`
- Reviewed commit requested: `b1c86bd8685910f6d172d876eb5a8ea8b3e8ab5d`
- Requested provider: Codex, authenticated ChatGPT account.
- Exact requested model: `gpt_6_1_astra`
- Requested effort: `medium`
- Transport: official Codex CLI `exec`, read-only sandbox.
- Provider-created session: `01a0f0f5-78ec-7763-af70-e20a8a46afbb`
- CLI exit: 1.
- Provider response: HTTP 400, `invalid_request_error`.
- Exact error: "The 'gpt_6_1_astra' model is not supported when using Codex with a ChatGPT account."

The provider refused the model before review analysis. This is not a review,
acceptance, ratification, or implementation approval. No substitute model was
launched. The first draft remains pending Refine acceptance in Backlog.

Raw provider events are retained in the bound worktree's ignored
`.scratch/gh/1847-sar-events.jsonl`. The refusal record preserves the decisive
provider error without copying unrelated runtime configuration or credentials.
