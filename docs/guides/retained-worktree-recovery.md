# Restore a retained completed-child checkout

Use `epic-wave restore-worktree` when a completed direct child's recorded checkout directory disappeared and its retained branch still exists. Run from the genuine active parent session in its bound worktree, with an active timer and the orchestrator role. Recovery preserves lifecycle state, native identities, grants, claims and existing refs. A later parent adoption or rank-wave grant uses its own registered operation.

Prepare an input file containing only this selector:

```json
{
  "schema": "aitm.epic-wave-restore-worktree/v1",
  "rank": 4,
  "child": 4,
  "retainedDigest": "<exact 64-character retained wave digest>",
  "expectedHead": "<exact full commit ID of the retained existing branch>"
}
```

Take the digest from the immutable issue-resident rank-wave record. Read the expected commit from verified branch evidence. Paths, branches, common Git directory, identities and states come from authenticated retained history and current issue authority; they cannot be supplied in the selector.

```sh
npx aitm epic-wave restore-worktree 2 --role orchestrator --input-file .scratch/gh/restore-4.json --json
```

Recovery validates the full structural history, the historical human source at its authorization time, the retained native identity, current parent ownership and native binding, strict completed-Done membership, rank and unchanged child location. It checks canonical path ownership, existing branch/head, ancestry in the current parent HEAD, registration and claim conflicts. It rechecks authority and physical observations under the common admission lock before one bounded Git worktree add of the existing branch. Git redirection environment variables are scrubbed.

A proven clean exact checkout returns `restored` or `already-restored` with exit 0. A pre-effect refusal returns `blocked` with exit 4. A failed or uncertain attempted effect returns `indeterminate` with exit 6 and preserves its tuple and partial filesystem evidence. Inspect that evidence before retrying. Recovery never forces, resets, prunes or repairs registrations and never deletes uncertain state. A missing directory with a stale registration requires separate investigation.

The restoring parent can differ from the historical recording parent. Historical source verification does not renew an expired or superseded wave grant and does not authorize ordinary continuation past a current pause. Source review and package verification do not establish downstream native admission or provider-managed delivery.
