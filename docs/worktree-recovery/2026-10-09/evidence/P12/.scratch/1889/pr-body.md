Native start/resume/switch claims an occupancy generation but previously dropped it before saving the per-session binding, so genuine epic rank-wave preparation rejected its own parent session. Persist the exact successful claim generation through all bind paths and state round trips, isolate it from shared state, and allow an explicit missing claim to clear stale authority.

Refs #1889

Validation: 15 focused regression checks pass, including an offline npm-packed consumer with a real native bind and missing/mismatched/foreign generation refusals. Repository lint and format checks pass. The canonical 599-file affected selection is running locally; full suite verification will use exact-head CI artifact receipts. This draft is pending that broader verification and independent review.
