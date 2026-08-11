# Migrations

One-shot scripts under `scripts/maintenance/` perform bounded, idempotent rewrites against the GitHub repo. Each script lists the data it touches, supports `--dry-run`, and can be re-run safely.

## `rename-estimation-headers.mjs`

Historical migration that rewrites estimation-comment headers from the legacy vocab (`Groom estimate`, `Analysis re-estimate`) to the then-current 7-state Scrum vocab (`Refine estimate`, `Plan re-estimate`) across every issue in the repo, open AND closed.

### Scope

- Comment bodies only. No issue bodies are edited.
- Hidden HTML-comment markers (`<!-- aitm-groom-estimate: <N> -->`) are left as-is — they are infrastructure, not user-visible, and renaming them would force every re-run to reconsider already-migrated comments.
- Four substring replacements per matching comment:
  - `### 🛠 Groom estimate` → `### 🛠 Refine estimate`
  - `### 🔁 Analysis re-estimate` → `### 🔁 Plan re-estimate`
  - `Initial provisional sizing at Groom (refined at Analyze).` → `Initial provisional sizing at Refine (refined at Plan).`
  - ``Provisional — Analyze will re-evaluate and post a `### 🔁 Analysis re-estimate` comment if the bucket shifts.`` → ``Provisional — Plan will re-evaluate and post a `### 🔁 Plan re-estimate` comment if the bucket shifts.``

### Usage

```sh
# Preview: print which comments would be patched, no writes.
node scripts/maintenance/rename-estimation-headers.mjs --dry-run

# Apply across the repo from cfg.
node scripts/maintenance/rename-estimation-headers.mjs

# Apply against an explicit repo.
node scripts/maintenance/rename-estimation-headers.mjs --repo owner/name
```

### Idempotency

Re-running after a successful migration scans every comment, finds zero matches, prints a `0 matched, 0 patched` summary, and exits 0. Safe to re-run after a partial failure — only un-rewritten comments are touched.

### Required scope

`gh` token needs `repo` scope (already required by every other tracker script). The PATCH endpoint allows editing comments authored by other users when the token has write access to the repo.
