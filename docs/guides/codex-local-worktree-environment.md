# Codex Local Worktree Environment

Use this guide beside the Codex desktop app while configuring the reusable
local environment for the `ai-task-manager` repository.

The environment prepares every new Codex-managed worktree with the locked npm
dependencies, the AITM skill and hook prerequisites, and the dogfood
`node_modules/ai-task-manager -> ..` self-link.

## What Is Already Checked In

Every Git worktree receives these tracked files automatically:

- `AGENTS.md`, containing the repository workflow rules;
- `.agents/skills/task/SKILL.md`, the Codex task-skill entrypoint;
- `.codex/hooks.json`, the AITM lifecycle and guard hooks;
- `.ai-task-manager/task-tracker.json` and the other portable AITM
  configuration/templates;
- `scripts/dev-env/setup-local-worktree.sh`, the automatic setup entrypoint;
- `scripts/dev-env/verify-local-worktree.mjs`, the environment contract check.

The worktree does not inherit `node_modules` or machine-local `.tmp/aitm`
runtime state. The setup entrypoint intentionally recreates dependencies and
the dogfood link inside the new worktree.

## Host Prerequisites

Install these once on the local machine:

- Git
- Node.js 22 or newer; Node.js 25 is preferred
- npm
- GitHub CLI (`gh`)
- `jq`

Authenticate GitHub CLI before using GitHub-backed AITM commands:

```bash
gh auth status
```

The environment setup prints a warning rather than failing if authentication
is unavailable. Offline tests remain usable, but issue, project, fetch, push,
and pull-request operations require authentication and network access.

## Create the Local Environment in Codex

1. Open the Codex desktop app.
2. Open the `ai-task-manager` project using the repository root as the primary
   folder. The primary folder must contain `.codex`, `AGENTS.md`, and
   `package.json`.
3. Open **Settings**.
4. Select **Local environments**.
5. Create a local environment named:

   ```text
   AITM Dogfood — Node 25
   ```

6. In the shared/default setup-script field, enter:

   ```bash
   scripts/dev-env/setup-local-worktree.sh
   ```

   The script is portable across macOS and Linux when Bash is available. If
   Codex presents platform-specific overrides, use the same command for macOS
   and Linux.

7. Save the environment.

Codex stores the generated project environment configuration inside the
repository's `.codex` folder. Do not guess or hand-author its app-managed
schema. After saving, inspect exactly what the installed Codex version
generated:

```bash
git status --short .codex scripts/dev-env
```

Commit the generated `.codex` configuration together with the repository
scripts if the app created or changed a shareable file. This makes the
environment definition available to later clones and teammates.

## Add Recommended Actions

In the same local environment, add these actions. Actions run in the selected
worktree's integrated terminal.

### AITM Status

```bash
npx aitm status
```

### Repair Self-Link

```bash
npm run link:self
node scripts/dev-env/verify-local-worktree.mjs
```

### Fast Tests

```bash
npm test
```

### Full Quality

```bash
npm run quality
```

Do not configure Fast Tests or Full Quality to run automatically during
environment setup. AITM requires the correct issue/timer context before tests
for tracked work.

## Start Each New Worktree Cycle

1. Start a new Codex chat for the `ai-task-manager` project.
2. Below the composer, select **Worktree**.
3. Select `trunk` as the starting branch unless the task explicitly requires a
   different base.
4. Select **AITM Dogfood — Node 25** as the local environment.
5. Submit the task prompt.
6. Wait for the setup entrypoint to complete. Successful output ends with:

   ```text
   [local-worktree] setup complete: <worktree-path>
   ```

Codex-managed worktrees normally begin at a detached HEAD. This is expected and
allows multiple chats to start from the same commit. When the change needs a
branch, use **Create branch here** in the chat header and choose a
`codex/<short-task-name>` branch. Alternatively, use **Hand off** to move the
chat and changes into the local checkout.

## Bind AITM Work After Setup

Environment setup is repository-wide; issue binding is session-specific. Bind
the intended task only after the new worktree is ready:

```bash
npx aitm start <issue-number>
npx aitm status
```

Then run the task's baseline or acceptance verification:

```bash
npm test
```

For explicitly authorized repository maintenance that must not create a GitHub
issue, use audited chore mode:

```bash
npx aitm chore-mode on "describe the maintenance work"
```

Chore-mode commits must use a `chore:` subject. Turn chore mode off when the
maintenance work is complete:

```bash
npx aitm chore-mode off
```

Do not put `npx aitm start`, an issue number, chore mode, or test execution in
the automatic environment setup script.

## Verify or Repair an Existing Worktree

Run the non-mutating verifier:

```bash
node scripts/dev-env/verify-local-worktree.mjs
```

If dependencies are absent or stale, rerun the complete setup:

```bash
scripts/dev-env/setup-local-worktree.sh
```

If only the dogfood link is missing or resolves to another checkout:

```bash
npm run link:self
node scripts/dev-env/verify-local-worktree.mjs
```

The correct link has this shape:

```text
node_modules/ai-task-manager -> ..
```

It must resolve to the current worktree, not the main checkout or another
managed worktree.

## Hooks and Project Trust

The repository's `.codex/hooks.json` is tracked, but Codex may require the
project to be trusted or its hooks to be reviewed before they run.

After opening the project or a newly shared environment:

1. Accept the project trust prompt when the repository is the expected local
   checkout.
2. Review the project hooks when Codex asks.
3. Run the **Repair Self-Link** action if a hook reports that an AITM
   entrypoint cannot be resolved.

The self-link makes installed-style hook paths resolve back to scripts in the
current checkout, which is the required dogfood behavior.

## `.worktreeinclude`

Codex copies tracked files into managed worktrees automatically. Use a root
`.worktreeinclude` only for intentionally ignored local inputs that a worktree
actually needs, for example:

```text
.env
.env.local
```

Do not add any of these:

```text
node_modules/
.tmp/
.tmp/aitm/
node_modules/ai-task-manager
```

Dependencies and runtime state must remain isolated. Codex also skips source
symlinks when copying ignored files, so `.worktreeinclude` is not a substitute
for `npm run link:self`.

## Keep Local Worktree and Cloud Environments Separate

The setup in this guide is for the Codex desktop app's local **Worktree** mode.
Both Local and Worktree chats execute on the local machine.

For Codex **Cloud**, configure the existing cloud environment with:

```bash
scripts/dev-env/setup-cloud.sh
```

For cached cloud-container refreshes, configure:

```bash
scripts/dev-env/maintenance-cloud.sh
```

Cloud setup has different caching, internet, secret, and Git-history behavior.
Do not use the cloud maintenance script as the local Worktree setup command.

## Troubleshooting

### Codex Does Not Offer the Environment

- Confirm the project primary folder is the repository root.
- Confirm the app-generated environment configuration is inside the root
  `.codex` folder.
- Reopen the project after pulling a teammate's environment configuration.

### `node` or Another Tool Is Missing

Install the missing host prerequisite, restart Codex so the app receives the
updated `PATH`, and rerun:

```bash
scripts/dev-env/setup-local-worktree.sh
```

### `npm ci` Reports Lockfile Errors

Do not replace `npm ci` with an unreviewed `npm install`. Confirm the worktree
started from the intended current branch and inspect the `package.json` /
`package-lock.json` delta.

### AITM Hooks Cannot Resolve Their Entrypoints

Run:

```bash
npm run link:self
node scripts/dev-env/verify-local-worktree.mjs
```

If the verifier reports a foreign link, ensure the command is running from the
managed worktree rather than the main checkout.

### GitHub-Backed Commands Fail

Check local authentication and network access:

```bash
gh auth status
git remote -v
```

### Tests Fail Immediately in a Fresh Worktree

First confirm setup and task binding:

```bash
node scripts/dev-env/verify-local-worktree.mjs
npx aitm status
```

If the environment is valid and the correct task is active, treat the failure
as a baseline defect rather than bypassing AITM verification.

## Official Codex References

- [Local environments](https://learn.chatgpt.com/docs/environments/local-environment)
- [Worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [Cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environment)
