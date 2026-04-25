# claude-gh-task-manager — Roadmap

## What's Done (as of 2026-04-25)

- [x] All 25 files extracted from `ocp-services` and committed (commit `74bb707`)
- [x] All hardcoded IDs removed from `config.mjs`, `move-state.sh`, `set-priority.sh`, `skill/SKILL.md`, `task-tracker.mjs`
- [x] `bin/cli.mjs` — `install` and `init` commands working
- [x] `scripts/gh/init-project-config.sh` — GH auth, project listing/creation, field discovery, issue templates
- [x] Issue templates: `.github/ISSUE_TEMPLATE/task.yml` and `bug.yml` (written to target project by init)
- [x] All 7 unit tests passing
- [x] `move-state.sh` errors with `Run: npx claude-gh-task-manager init` when unconfigured
- [x] `docs/workflow.md` — full GitHub/Kanban/sub-issues/cleanup rules (generalized)
- [x] `docs/settings-guide.md` — autoCompactWindow, Superpowers plugin, statusLine, nvm hook, Ref MCP
- [x] `docs/ai-value-framework.md` — ROI model, sizing guide, session log template, GraphQL mutations

## What's Next

- [ ] Push to GitHub remote (`git push origin trunk`)
- [ ] Publish to npm (`npm publish`)
- [ ] `npx claude-gh-task-manager uninstall` command
- [ ] `npx claude-gh-task-manager update` command (re-copies scripts without touching config)
- [ ] GitHub Action to run tests on PR
- [ ] Make init org-aware (currently tries user then org for project node ID lookup)
- [ ] Value report script (`generate-value-report.mjs`) — optional port from ocp-services

## Implementation Notes

### Config system

All GitHub-specific IDs live in the **target project's** `.claude/task-tracker.json` (not in this repo). Populated by `npx claude-gh-task-manager init`.

Config precedence: project-local > user-global (`~/.claude/task-tracker-config.json`) > code defaults.

### Testing

No test framework — run directly with node:

```bash
# Run all tests
for f in scripts/task-tracker/tests/*.test.mjs; do
  TT_SKIP_NETWORK=1 CLAUDE_PROJECT_DIR=/tmp node "$f"
done

# Smoke test the CLI
TT_SKIP_NETWORK=1 CLAUDE_PROJECT_DIR=$(pwd) node scripts/task-tracker/task-tracker.mjs status

# Test install into a temp dir
node bin/cli.mjs install --target /tmp/test-install
```

### Publishing checklist

1. `git push origin trunk`
2. `npm version patch` (or minor/major)
3. `npm publish --access public`
4. Tag the release: `git tag v<version> && git push --tags`
