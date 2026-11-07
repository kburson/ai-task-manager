# Manual supplemental SAR, round 2: #2165 diagnostic contract revision (option A)

**Label:** This is a manual supplemental review in the same Claude session (claude-opus-5-5) that reviewed the original XPR and round 1 of this SAR. It is not an XPR event. It does not reopen the terminal-accepted `review-a8582e8562b81f1bf8569c28c6e579a2`, does not replace the separately required fresh gpt-6-astra/xhigh manual SAR, and does not carry the original seal over to the amended bytes. I accept the authority to perform this labeled manual supplemental review. No file was written, no protocol command was run, and only Read was used.

## Artifacts as read

| Artifact | Hash |
|---|---|
| `docs/superpowers/specs/2026-11-05-2165-diagnostic-contract-revision-design.md` | Hash verification unavailable with Read only. Reviewed against the author-supplied SHA256 snapshot `4e8a2f2620a133484fe6f5caaa27c46a38320ae977ec60f2f80678a65022cede`. |
| `.scratch/peer-review/2165-diagnostic-contract-dispositions.md` | Read in full; hash verification unavailable. |
| Original accepted spec and plan | Unchanged since my XPR turns (blobs `c1560f38…` and `b13afd97…`); hash re-verification unavailable. |
| `.scratch/plan/2165-retained-2161-trace.md` | Read in round 1; hash verification unavailable. |
| Source | `scripts/task-tracker/lib/action-decision/close.mjs` (lines 1–1209), `scripts/task-tracker/lib/project-dir.mjs` (full), `scripts/task-tracker/verbs/close.mjs` (lines 1–419). |

I did not open the raw JSON capture, so I cannot independently confirm that it contains the complete comments response or the observations it is said to contain. Those are author-attested capture facts, and the contract makes any missing field a prerequisite refusal. I did not access the sibling checkout or its binding file.

## Disposition check

### R1: pre-comparator reads and their sources — resolved

The new provenance table covers every read the default path makes before `verifyDeliveryAuthority`:

| Read | Code location | Source in the amendment |
|---|---|---|
| Issue body (initial and fresh) | `close.mjs:1033-1046` | Retained raw responses plus labeled fixture-native writes |
| Project board | `close.mjs:1047-1048` | Captured observation, encoded explicitly |
| Worktree | `close.mjs:1049-1050` → `readWorktree` 140-159 | Real Start-created binding; overrides forbidden |
| Delivery evidence:1 | `close.mjs:239-330` | Raw captured responses plus physical objects; saved `gateInput` used only as a cross-check |
| Delivery evidence:2 | `close.mjs:1054-1087` | Real attribution reads over a fixture origin fixed at `e3ca90`; no saved `true` |
| Delivery evidence:3 | `close.mjs:160-201` | Retained empty sub-issue response |
| Guard authority evidence:4 comments | `readGuardAuthority`, `close.mjs:331-342` | Retained raw comment pages; only the request spelling is normalized, narrowly |
| Trail objects and dirty status | `close.mjs:345-364` | Real fixture Git |
| Dependency | `close.mjs:354-360` | Separately recorded pure read: `blockedBy` total 0 at an unchanged `updatedAt` |
| Parent board | `close.mjs:365-369` | Not applicable: captured `parentIssueNumber` is null; a non-null value refuses |

Two further points close the gap I raised:

- Unknown requests refuse, and no generic success envelope is allowed.
- No new live capture is authorized by default; anything missing is a pre-product refusal.

### R2: identity and isolation — resolved

- **Override paths shut.** The child environment strips every `PROJECT_ROOT_ALIASES` key, `TT_PROJECT_DIR` and the Git location overrides, and `resolveRuntimeRootOverride` must return null. That closes the override branch at `project-dir.mjs:54-65`, so `resolveProjectDir` must resolve through the binding at `project-dir.mjs:26-43,70-82`.
- **Identity.** It inherits the provider-native SID, sets no replacement session or transcript IDs, and does not pre-write `active-task.json`.
- **Prevention, not just detection.** Path-owner containment is checked before Start using the real production owners: session, active-task, fleet, occupancy, timing, mutator and Test roots. The run aborts if any owner escapes the fixture, and the check repeats after Start. Host snapshots are now a second layer.
- **No network.** The offline provider is first on PATH, `TT_SKIP_NETWORK=1` is set, and a startup self-test proves both a mapped read and an unmapped refusal.
- **Missing identity.** Without a native SID, only the inherited-SID assertion may be skipped; the repository's test actor mechanism is labeled synthetic and claims nothing native.

### R3: replay state, artifact and order — resolved

- **Operator state:** HEAD `890` on `codex/2156-draft`.
- **Trunk:** an independent local bare origin, with `origin/trunk` = `e3ca90`; no GitHub remote is configured.
- **Issue state:** the initial board and last-known-state are projected from captured observations, which satisfies `close.mjs:732-747`.
- **Selected artifact:** `890` / tree `103acce` is passed to the default evaluator and to both Explain forms.
- **Order:** the replay runs immediately after Start, against retained historical receipts that are not relabeled.
- **Why the comparator is reached first.** The source-grounded expectation matches what I verified:
  - `runReadOnlyGuards` calls `verifyDeliveryAuthority` (`close.mjs:483`) before the generic `runGuards` (`close.mjs:485`).
  - `readGuardAuthority` validates no Test context.
  - `verifyDeliveryAuthority` uses only `parseVerificationReceipt(body,'test').commitSha` (`close.mjs:396-398`), which is `890`.
- **One unverified claim.** I could not check the claim that `resolveCloseLifecycleEvidence` returns null before any operator-context validation, because I could not locate it with Read only. The contract guards this correctly: if any real entrypoint validates stale context earlier, the replay refuses and the contract is revised, never bypassed. Renewal and the meaningful RED remain separately mandatory in Task 1 Steps 2–4.

### Round-1 optional findings 1–4

All four are adopted. Item 2 carries an honest limitation: the canonical round-trip plus raw-response cross-check cannot retroactively prove that no undefined, function or Map value was lost at capture time, and the amendment says so. Adopting them introduced no new authority.

### Answers to the required review focus

- **Retained evidence, binding and default trace before product edits:** yes.
- **Fixture-owned mutations labeled, and evidence renewed natively:** yes.
- **Lower-level replay limits:** they stay explicit, and it cannot substitute for the option-A replay, native authority, the RED or the ACs.
- **Original tests and the #2161 activation:** every original lifecycle, Explain, read-only, receipt-identity and negative test remains mandatory, and genuine #2161 activation stays deferred until #2165 is Done.
- **Hidden authority:** none found.

## Required findings

None.

## Optional findings

1. **Make the fixture's object store complete and non-shallow.** The replay section says to copy "source inventory objects, quartet objects and every parsed retained commit-trail SHA". The source needs more than that:
   - Attribution requires `tip.objectComplete === true` and `tip.shallow === false` (`close.mjs:760-761`).
   - The ancestry checks (`close.mjs:415-431`), the trunk-attribution message scan and `epicTrailLogArgs` walk full parent history.

   Say that the fixture gets the complete reachable, non-shallow closure of `e3ca90`, `890` and every trail SHA, fetched read-only from this checkout. Then remove that fetch source so the only configured remote is the local bare origin. This would otherwise surface safely as a prerequisite refusal, so it is not required, but stating it avoids a wasted revision cycle.

2. **Record how the dependency read maps onto the production request.** The supplementary dependency evidence came from `gh issue view --json blockedBy`. Production `observeDependencyReadiness` issues its own request shape through `nativeDependencies.pexec`. The strict provider should record an explicit, labeled mapping from that production request (endpoint, variables, pagination) to the recorded `blockedBy` connection result. If the production request asks for any field that read did not cover, it should refuse rather than return an empty-success shape.

3. **Watch for remote-URL dependencies.** Any production check that derives repository identity from the remote URL would see the local bare origin's path instead of `kburson/ai-task-manager`. `cfg.repo` comes from the captured configuration, so I expect none. If one exists, the existing refuse-and-revise clause applies; mention it as a known possible pre-comparator refusal.

## Verdict

**accept, no required changes**, for the exact revised contract matching snapshot `4e8a2f26…`. The three optional findings are advisory. This evaluates the proposed contract only and claims nothing about future fixture results. It is a manual Claude supplement: it neither seals the amendment as XPR nor replaces the required independent gpt-6-astra/xhigh SAR.
