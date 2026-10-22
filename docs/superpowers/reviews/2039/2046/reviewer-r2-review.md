**Important — [P1] Bind v3 calculation inputs to the retained payloads. — NOT ADDRESSED.** `scripts/task-tracker/lib/estimation/forecast-model.mjs:71-88` correctly requires raw evidence and rejects static rubric/outcome payload mismatches. However, `:77` compares the current value of caller-owned `rubric.payload`, then `:91-99` and subsequent arithmetic read that property again. The checked value is neither captured nor replaced with the validated retained payload.

A focused read-only probe used a rubric wrapper whose `payload` getter returned the genuine retained payload for the comparison and an altered implementation coefficient afterward. Both returned payloads were ordinary JSON objects with unchanged version, confidence and cohort. The builder returned a v3 forecast, and its final retained provenance validation accepted it:

```text
Baseline human hours: 44
Actual human hours: 83
rubric.payload reads: 14
localEvidence unchanged: true
Retained validation accepted: true
```

This preserves the original defect for accessor-bearing caller inputs: the payload compared with retained bytes can differ from the payload used for calculation. Canonical serialization rejects accessors inside a payload, but it never inspects the wrapper’s `payload` property descriptor because that getter has already been evaluated before serialization. Use a detached, validated calculation snapshot throughout the function, derive calculation inputs from retained records, or explicitly reject executable wrapper properties before consuming them. Add a regression covering this check/use mismatch.

### New Breakage in the Fix Diff

- **None independently identified.** The finding above is an incomplete repair of the existing input-correlation defect.
- The new ordinary-data checks follow the existing comparable allowlist semantics: only selected outcomes enter both comparison and arithmetic (`forecast-model.mjs:80-88`, `:176-190`).
- Mandatory raw evidence is confined to the opt-in v3 path (`forecast-model.mjs:70-71`); existing v2 calls retain their prior path.

### Out-of-Scope Observations

- **Minor — existing lint diagnostics remain non-blocking.** `task-19-r1-lint.log:32` onward retains soft line-cap notices; `:207` records 30 baselined reach offenders and zero new offenders. The disposition accurately acknowledges this noise.
- No additional outside-scope product defect was identified.

### Verification Checks

- Read the task brief, implementation/repair report, complete supplied fix diff, raw R1 review and author disposition.
- Inspected unchanged canonical serialization specifically to assess the new complete-payload comparison. `canonical-json.mjs:53-56` rejects accessor properties within serialized objects, but cannot reject the already-evaluated wrapper getter.
- Inspected unchanged retained-evidence validation specifically to confirm that it parses, validates and freezes actual retained records before returning them.
- Confirmed four recorded RED failures at `task-19-r1-red.log:32-39`.
- Confirmed covering test implementations at `forecast-v3.test.mjs:316-367`, recorded focused GREEN 35/35 at `task-19-r1-green.log:32-39`, and regression GREEN 111/111 at `task-19-r1-regressions.log:112-115`.
- Confirmed recorded full fast result of 990 passing files, 951 pure unit and 39 direct-subprocess files, aggregate 87.2 seconds at `task-19-r1-npm-test.log:996-1000`; formatting success appears at `task-19-r1-format.log:4`.
- Ran only the focused in-memory accessor probe described above because the existing tests cover static mutations but do not answer the concrete check/use concern. No suite was rerun and no file was written.

### Declined Judgments and Boundaries

- **Default v2 output:** not re-judged; coordinated writer activation belongs to the neighboring slice.
- **Forecast-record exports:** not re-reviewed; the fix changes no export contract there.
- **Raw evidence for every structural validation:** not required; structural inspection remains distinct from calculation-input binding.
- **Comparable ordering versus manifest ordering:** not required to match; selected identity correlation and payload equality are the relevant repair requirements.
- **Snapshot-only current host/configuration:** not independently established; the accepted snapshot omits those fields and this fix adds none.
- **General replay of arbitrary forecast numbers:** not required; the remaining finding concerns inputs directly consumed by this builder.
- **Baseline lint cleanup:** not required; no new offender is reported and no suppression was introduced.
- **Broad caller crawl or repeated suites:** declined because they would not resolve the demonstrated local check/use defect.
- **Exhaustive predecessor host/repository/ancestry behavior:** not re-tested; those unchanged contracts are outside this fix.
- **Execution chronology, exact logged process exit codes and exact source-to-log correspondence:** cannot independently establish from retained text alone.
- **Clean frozen HEAD, registered Stop, null binding and absent occupancy:** treated as controller-supplied facts; no Git/native-state audit was performed.
- **Slow-suite results, integrated-head CI, native Test/Review/Close, publication, merge or delivery:** outside this technical review; no judgment or approval is supplied.

### Verdict

**Spec scope:** Task19’s bounded strict-v3 provenance/model-output contract. The repair binds static JSON payloads but still permits checked calculation inputs to change through an accepted caller wrapper before arithmetic.

**Task quality:** Needs fixes for the remaining input-correlation defect.

**Fix round:** Findings remain open — **Important — [P1] Bind v3 calculation inputs to the retained payloads.**
