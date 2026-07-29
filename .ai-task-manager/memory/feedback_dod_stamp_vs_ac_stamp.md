---
name: feedback-dod-stamp-vs-ac-stamp
description: "dod-stamp ticks DoD Functional checkboxes with real verifier evidence; ac-stamp only touches Acceptance Criteria lines — don't conflate them"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 7dfc179a-dd63-409b-8a8a-4801e182a4bb
---

`node bin/aitm.mjs dod-stamp <key>` is the correct verb for DoD Functional checkboxes (`tests`, `lint`, `commits` are stampable — they run a real verifier command and stamp an `aitm-verified cmd=... sha=... ts=... exit=0` marker onto the `dod:functional:<key>` line). `ac-stamp` only operates on Acceptance Criteria lines carrying `aitm-verified-by` and will refuse with "no Acceptance Criteria line ... found" if pointed at a DoD line.

`acs` and `checkboxes` are DERIVED DoD keys — `dod-stamp` explicitly refuses to stamp them ("key is DERIVED — it is computed from the body at close time"). They auto-tick with `derive:*` evidence markers when `promote` moves the issue across a state boundary (confirmed: Test→Review promotion auto-ticked both with real evidence, no manual call needed).

**Why:** Discovered by trial-and-error while driving #670 through Test-stage DoD stamping — `ac-stamp tests`/`ac-stamp lint` both failed with the wrong-verb error before `dod-stamp.mjs` source was read directly to find the real API.

**How to apply:** When stamping DoD Functional evidence during a task drive, go straight to `dod-stamp <key>` for `tests`/`lint`/`commits`. Never attempt to manually stamp/tick `acs` or `checkboxes` — let the state-transition verb derive them.

**Two-step is mandatory (confirmed #692):** both `dod-stamp <key>` AND `ac-stamp "<label>"` only STAMP the evidence marker — they leave the box `- [ ]`. You must then run `npx aitm ensureChecked "<exact label>"` to flip it; the stamped `aitm-verified`/`aitm-ac-evidence` marker is what unlocks that tick's evidence gate. The gates that block on unticked boxes: `code-complete-ac-unticked` (Develop→Test promote, ACs) and `test-to-review-incomplete` (Test→Review promote, Functional DoD tests/lint/commits/checkboxes). Sequence per box: stamp → `ensureChecked` → promote. VC-section checkboxes are the exception — `/task test` auto-ticks those on the green sandbox run via `autoTickVerified`. The derived `checkboxes` key reconciles automatically on promote once all body boxes are ticked.
