# Cloud Development Environments

This repository supports cloud agent development through checked-in setup scripts that Codex, Claude, Codespaces, or another hosted worker can run after cloning the repo. The supported runtime minimum is Node.js 22. For cloud development environments, prefer Node 25 so spawned agents run against the same modern runtime used by active maintainers.

The first pass is intentionally scripts-first. Configure the cloud provider UI to call the repository entrypoints rather than encoding tool installation steps in one provider-specific place.

## Entry Points

Use these scripts from a fresh cloud checkout:

```bash
scripts/dev-env/setup-cloud.sh
```

Use this script when a cached environment is reused:

```bash
scripts/dev-env/maintenance-cloud.sh
```

`setup-cloud.sh` verifies `git`, `gh`, `jq`, `node`, and `npm`; enforces Node.js 22 or newer; reports whether Node 25 is active; runs `npm ci` from `package-lock.json`; and attempts to install Puppeteer Chrome for report-generation workflows.

`maintenance-cloud.sh` refreshes origin metadata, ensures the environment has a usable `origin/trunk` and local trunk reference when possible, checks whether the clone is shallow, and reruns `npm ci` so dependency state follows the lockfile.

## Agent Workflow

Treat each Codex or Claude cloud environment as a disposable task workspace. Do not reuse the local trunk checkout as an agent scratch area, and do not let a cloud worker change the task issue bound in a local trunk session.

Start from a clean cloud clone or isolated worktree, then create a task branch:

```bash
git switch -c codex/<short-task-name>
```

For Claude work, use a branch name that still identifies the task owner clearly:

```bash
git switch -c claude/<short-task-name>
```

Create issues through AI Task Manager, not direct GitHub CLI issue creation:

```bash
npx aitm create-issue \
  --shape solo \
  --title "Feature: ..." \
  --scope-file ./.tmp/gh/scope.md \
  --ac-file ./.tmp/gh/acs.md \
  --plan-metadata-file ./.tmp/gh/plan-meta.md
```

Bind existing work inside the cloud environment before editing:

```bash
npx aitm start 123
npx aitm status
```

Drive the state machine in the same cloud environment that owns the branch:

```bash
npx aitm refine 123 --size M --estimate 4 --priority p1 --reason "Ready for cloud-agent implementation"
npx aitm plan 123
npx aitm plan-approve 123
npx aitm promote 123
```

After implementation, run the issue verification commands, commit with the issue number in the subject, and push the completed branch to origin:

```bash
npm run format:check
npm run lint
npm test
git commit -m "[#123] feat(scope): describe the change"
git push -u origin HEAD
```

Keep local trunk as the integration and inspection checkout. Pull from origin there only after a cloud branch is reviewed, merged, or explicitly selected for local hand editing.

## Codex

For Codex cloud tasks, configure the environment setup command to run:

```bash
scripts/dev-env/setup-cloud.sh
```

If the provider supports a cached-environment maintenance hook, configure:

```bash
scripts/dev-env/maintenance-cloud.sh
```

Codex agents should start each task by confirming `npx aitm status`, binding the intended issue, and checking the current branch. When a task spawns subagents, each spawned agent should receive its own branch or worktree and should push to origin when complete rather than editing the parent's checkout.

## Claude

For Claude cloud development, run the same setup and maintenance entrypoints. Claude Code should bind the issue inside its own cloud environment with `/task #N` or the equivalent `npx aitm start N` command before making source changes.

When Claude is fixing defects in one environment, do not change the issue binding in another environment's local trunk session. If a defect fix needs separate investigation, create a new issue through AITM and let that environment own the new branch.

## Network And Secrets

Cloud setup needs internet access for `npm ci`, GitHub API calls through `gh`, Git fetches, and Puppeteer browser installation. The normal agent runtime should use the narrowest internet access the provider supports after setup is complete.

Configure GitHub authentication as a cloud secret, then verify it during setup:

```bash
gh auth status
```

Required secret material usually includes a GitHub token with repository, issue, project, and pull request permissions. Do not commit tokens, generated credentials, `.env` files, or provider-specific secret export files.

Offline operation is limited. A worker can run already-installed tests offline only after dependencies, Git history, and Puppeteer browser assets are cached. Creating issues, updating task state, fetching trunk, and pushing branches require network access.

## Handoff

Before handing work back from a cloud agent, verify:

- `npx aitm status` shows the intended issue.
- `git status --short --branch` is clean after commit.
- The latest commit subject starts with the issue token, such as `[#123]`.
- The branch has been pushed to origin.
- The local trunk checkout has not been used as the task workspace.

The receiving maintainer can then review the pushed branch or pull request without losing the active state of any separate local task.
