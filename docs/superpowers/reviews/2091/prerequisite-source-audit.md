# Historical prerequisite diagnostic audit

Received from owning chat 01a16382-9511-7401-baed-5dd61fd8a380. This is historical prerequisite evidence, not the future implementation review or runtime proof. Reviewer /root/review_2090_native_publication, fresh GPT-6.1 Sol / medium, read-only, no source authorship.

The blocker is a native Refine defect. Within the stated constraints, I found no supported recovery that completes this exact pending operation on current code.

--rank is optional and omission consistently means leave rank alone except in body-cache refresh:

- refine.mjs:244 normalizes omitted rank to null.
- Lines292–294 omit the board rank update when absent.
- Lines152–155 omit rank from the rationale when absent.
- Lines353–362 nevertheless pass rank:null to ensureIssueFieldDb and include rank among overridden keys.
- issue-field-db.mjs:147 applies supplied override values last, replacing any persisted rank with null.
- refinement-snapshot.mjs:51 then rejects null rank.

A separate native rank update cannot overcome that deterministic overwrite when this pending fields effect invokes applyBody. Adding --rank changes the sealed intent key. Refresh cannot complete missing writer effects. Demotion, supersession substitutes, or manually manufactured completion evidence would not be proper recovery.

The minimal repair belongs in Refine’s body refresh: supply rank and authorize its override only when rank was supplied. Preserve the existing fresh-base persisted rank otherwise, in both changed-publication and unchanged branches. Keep the operation key’s absent rank as null; replacing it with an inferred live rank would break exact retry. Keep snapshot rank requirements unchanged.

There is no explicit rank-clearing grammar here: null/undefined/empty are treated as omission. Therefore omission must not clear. Any future explicit clearing action needs separate semantics; this repair should not invent one.

The regression seam is project-tether-publication.cases.mjs:339, using actual runRefine and publication ownership. Existing cases always supply rank and omit fetchLabels, which disables real snapshot stamping. New coverage should:

- Enable fetchLabels, retain real ensureIssueFieldDb, and begin in Refine with persisted rank and omitted --rank.
- Assert preserved rank, valid snapshot, complete publication and one normal promotion.
- Exercise interrupted exact retry with the same absent-rank key and unchanged operationID.
- Cover the unchanged publication path and explicit numeric rank update.
- Retain failure when rank is genuinely absent; preservation cannot manufacture required rank.

The narrower refine-fields-cache-refresh.test.mjs:77 also lacks a preserved-rank assertion and uses an orchestration fixture that disables snapshots by default.

This is separate from #2089’s intended product repair. The native workflow bug needs its own authorized correction before that blocked worker can safely finish refinement.

Root ruling: accepts diagnosis/minimal direction and stated source-only limits; actual failing snapshot pairs and native recovery were not independently executed by this reviewer. Your implementation still needs observed regression RED, GREEN and independent exact-source review.
