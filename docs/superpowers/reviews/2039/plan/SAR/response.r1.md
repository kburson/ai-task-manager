# #2039 plan SAR round 1

Reviewer requested and used: `gpt-6-astra`, reasoning `high`, persistent native SAR agent. Scope: document readiness, not SPR/XPR or lifecycle approval. Exact input: `plan.r0.md`, SHA256 `c39a5cd1c9c47db3907415a12b78a8927aa7f5d9c1aec335d87d6974dd446ab9`.

The parent authorized document revisions after reporting the actual issue remains Refine with a native Plan-entry field refusal. No API, lifecycle, Git or product-test action was taken by the reviewer. Source and accepted specification/probe evidence were read locally.

## Findings and dispositions

### P1 F1 — The plan asserted a lifecycle state not reached

The final paragraph said the parent remains in Plan, but the parent reported `plan-entry-fields-board` and a missing Start time with human-operator investigation. Hydration must not silently treat document readiness as lifecycle admission.

**Disposition:** Corrected the current-state observation to reported Refine, linked the parent-owned blocker record, and made Plan/hydration conditional on native admission. No field repair, Plan approval or implementation permission was invented.

### P1 F2 — Executable seeds depended on undefined data and helpers

Every task's code sketch relied on variables such as `identity`, `store`, `event`, `legacyV2`, `ports`, `minimal` or an invented `consumer.offlineRun('stage-note')`. This failed the writing-plans requirement for concrete code/test seeds and would obscure whether failure was from behavior or the sample itself.

**Disposition:** Replaced all twelve snippets with complete imports/data/assertions for their named future tests. Kept the full positive/integration scenarios as mandatory acceptance work, explicitly distinguished small seeds from workflow proof, and named the real package fixture/CLI seams. Existing verifier filepaths were checked locally; new ones are explicitly deliverables.

### P1 F3 — Persisted schemas and generation semantics were underspecified

Schema labels alone did not define interoperable records across twelve children. Storage generation changes on every local commit, whereas publication generation is allocated once per frozen transition batch. Conflating them could grant a tiny edit a new publication identity or lose crash consistency.

**Disposition:** Added exact manifest/generation/timing/claim/batch/receipt and forecast provenance field contracts, native observation rules and distinct storage/publication counters. No arithmetic local counter is cloud authority.

### P1 F4 — Estimation evidence could be stored in the wrong authority

Task 6 used the generic story `store` for local evidence and claimed the specification supplied an exact field schema. The accepted specification explicitly places immutable estimation evidence under native durable runtime storage; project `.tmp/gh` is the owner-selected authority for unpublished current story content.

**Disposition:** Split `evidenceStore` from story content storage, supplied concrete manifest/provenance records, and kept only selected input references/hashes in the story batch. No duplicate authoritative body/comment store was introduced.

### P1 F5 — Frozen final-body bytes could not contain unknown creation IDs

Task 8 froze candidates while Task 9 required actual newly created comment IDs and confirmed effect digests in the final body. Requiring both without a substitution contract either invents IDs or permits arbitrary late body changes.

**Disposition:** Freeze the exact template, all ordinary bytes/input hashes and allowed substitution slots; fill slots only from verified declared effects, then validate and durably freeze the realized body/digest before its single dispatch. Exclude the final body's own digest from its receipt to avoid circular hashing.

### P1 F6 — Caller census and public activation were deferred beyond the plan

The existing body helper returns verified cloud `body` with `status:ok|no-op`; the native completion probe uses an identity mutation as a remote read. Merely changing the writer to `staged` before migrating these callers would fabricate remote authority or break completion. The plan also omitted exact pre-dispatch paths and left creation/migration escape hatches unspecified.

**Disposition:** Added a source-grounded writer/consumer table with task/test routes, specific CLI/hook dispatch seams, creation/administrative classification, owned-comment adoption, proof-capability preservation and coordinated public activation in Tasks 9–10. Identity-mutate readers must choose working or published authority explicitly. No disabled-estimation exemption removes native editing/lifecycle guards.

### P1 F7 — Full native budget evidence had no fixed numeric acceptance fixture

Only the illustrative minimal eight-call case was numeric; the epic's G/D/V counts were left for implementation to choose after observing traffic. This contradicts the accepted specification's independently fixed full-native fixtures.

**Disposition:** Added exact solo (8), epic with two children and five effects (13), Plan-authority (10) and uncertainty/revalidation ceilings, with named G/V reasons and exact resource identities. Tests must exercise actual collector/preflight/guard/saga code with transport seams, cannot stub guards to pass or derive allowances from actual traffic. These are proposed acceptance limits, not measured achievements.

## Source verification and limits

Read the current body invariant helper and return contract, native completion probe/saga, decomposition hook collector/pagination, forecast validator/model tests, record-envelope/canonical-JSON modules, public dispatcher, existing helper/package fixtures and package scripts. The bounded native revision probe is parent-run evidence, not repeated by this reviewer. No product implementation tests ran. The document-write hook rejected one payload because a quoted source path resembled a prohibited state command; no command was dispatched and the next document-only payload omitted that redundant reference.

**Result: revise.** All seven findings have concrete revisions in formatted `plan.r1.md`, SHA256 `30637d3af07270cea3037a8c141298f1af055003fabf93f76a96f88b480c9158`. A subsequent full review is required; no convergence is claimed in this round.
