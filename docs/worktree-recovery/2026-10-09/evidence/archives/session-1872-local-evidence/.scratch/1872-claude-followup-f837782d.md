[10:17:32]
**Verdict: NOT READY**

The correction resolves every example I flagged as blocking. But the rule it adds to keep an existing scope now cuts the other way: when the scope named before the noun is a different rank or epic, the quoted noun drops the in-scope rank named after it. I traced this by hand against `epic-rank-wave-source.mjs:404-461` at `f837782d`. I ran nothing, edited nothing, and didn't write the plan file plan mode asks for, because you told me not to. Your 45 passing tests are your evidence; I didn't re-run them.

## Examples I flagged as blocking: resolved

The new noun-boundary check is at `:414-427`. Each case below traces to **blocked**:

- **`Withdraw the "go" for rank 2.`**, ``Cancel the `run` for rank 2.``, `Withdraw my "go" for rank 2.`
  - The noun follows a determiner, so `:423` matches and the noun doesn't end the withdrawal's object.
  - The object then keeps `rank 2`, so the withdrawal is blocked.
- **`Withdraw "go" for rank 2.`** and ``Cancel `run` for rank 2.``: the article-free alternative `["“‘`(]\s*$` matches, with the same result.
- **`Pause the run/build for rank 2.`**: the determiner check matches.
- **`Pause run/build for rank 2.`**: the text right after the noun starts with `/`, so `:426` stops it ending the object.
- **`Cancel the start of rank 2.`** and `Withdraw the go ahead for rank 2.`: the determiner check matches and the full object keeps `rank 2`.
- **`Cancel rank 2 and the "run" for epic #108 rank 3.`** and the version with `children [160,161]`: the object before the noun already names `rank 2`, so `:419-422` keeps the original boundary. `rank 2` matches, so the withdrawal is blocked.

## Checks you asked me to confirm

- **Unrelated epic stays neutral:** `Cancel the start of epic #108 rank 2.` extends to an object that names epic 108. That is a mismatch, so the withdrawal doesn't apply. "start" is then checked on its own, and its object `of epic #108 rank 2` also mismatches. The result is **verified**.
- **Subject-form noun still works:** in `Rank 2 needs the pause.` the object is empty. The scope comes from the text before the verb, which names `rank 2`, so the result is **blocked**.
- **Sequential check still works:** in `The run should be sequential for rank 2.`, "run" is the only verb. Its object names `rank 2` and contains "sequential", so `:447-452` fires and the result is **blocked**.
- **Each verb still gets its own check:** the change only alters where the earlier verb's object ends. The loop at `:410` still evaluates every verb. A later verb preceded by a determiner can't be negated anyway, so no negation check is lost.

## Blocking: a different rank or epic named first now drops the in-scope rank named after the noun

**Where:** `:419-422`. The test uses `.specified`, which is also true when the earlier scope names a *different* rank or epic.

**Example:** `Cancel rank 3 and the "run" for rank 2.`

| Commit | What the Cancel object becomes | Result |
|---|---|---|
| `1fd28991` | Quoted "run" isn't a verb (`(?=\s|$)` boundary), so the object is the whole clause and names ranks `[3,2]`. That includes 2. | **blocked** |
| `f837782d` (HEAD) | `' rank 3 and the "'` names a scope (rank 3), so "run" ends the object. Rank 3 doesn't match, so the withdrawal doesn't apply. "run" is then checked alone: its object names rank 2, but it isn't a withdrawal, isn't negated and has no "sequential". | **verified** |

- **Same flip:** `Cancel rank 3 and "run" for rank 2.`, ``Cancel rank 3 and `run` for rank 2.`` and `Cancel rank 3 and the run/build for rank 2.`
- **Clause splitting doesn't save it:** the splitter at `:469` only splits on `and` when a verb word comes right after. Here a determiner or quote comes first, so there's no split.
- **Not caused by this change:** the plain-space form `Cancel rank 3 and the run for rank 2.` also comes out verified at `1fd28991`. Only the quoted, backtick and slash forms are new.

**Fix:** at `:422`, change `.specified` to `.matches`.

- A matching scope before the noun keeps its boundary. Your foreign follow-on cases stay **blocked**.
- A mismatched scope before the noun lets the object extend. The object then names ranks `[3,2]`, which includes 2, so it fails closed and comes out **blocked**.
- `Cancel the start of epic #108 rank 2.` is unaffected, because no scope comes before the noun. It stays **verified**.

**Tests to add:**
- **Expect blocked:** `Cancel rank 3 and the "run" for rank 2.` and `Cancel rank 3 and "run" for rank 2.`
- **Expect verified:** `Cancel epic #108 and the "run" for epic #108 rank 3.`

## Non-blocking

**More false refusals:** some commands about a run, not the parallel stories, are now **blocked** where they were **verified** before. For example, `Stop the run CI for rank 2.` and `Pause the run tests for rank 2.`

- The extended object starts with "run", which isn't in the neutral list at `:362`.
- This only adds refusals.
