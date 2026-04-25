# Plan: Package /task skill as npm package `claude-gh-task-manager`

## Context

The `/task` skill in `ocp-services` tracks per-issue time and context-word usage during Claude Code sessions, writing a "⏱ Timing Log" comment to GitHub issues. The skill + supporting Node.js CLI + shell scripts are currently baked into the `ocp-services` project with hardcoded GitHub project IDs, field IDs, and personal identifiers (`kburson`, `options-co-pilot`).

Goal: extract everything into `/Users/kpburson/projects/Vibe-Coding/claude-gh-task-manager` as a clean, shareable npm package. Users install via `npx claude-gh-task-manager install`, then run `npx claude-gh-task-manager init` to configure their GitHub project.

## Target Repo Structure

```
claude-gh-task-manager/
├── package.json
├── README.md
├── bin/
│   └── cli.mjs                    # npx entry: install | init commands
├── skill/
│   └── SKILL.md                   # Claude Code skill (generalized)
├── hooks/
│   └── task-tracker.sh            # Hook dispatcher (generalized)
├── scripts/
│   ├── task-tracker/
│   │   ├── task-tracker.mjs       # Main CLI (generalized assignee)
│   │   ├── config.mjs             # Config loader (clear hardcoded IDs)
│   │   ├── state.mjs
│   │   ├── word-counter.mjs
│   │   ├── gh-timing-comment.mjs
│   │   ├── queue.mjs
│   │   ├── hook-handler.mjs
│   │   ├── active-time.mjs
│   │   └── tests/                 # All test files
│   └── gh/
│       ├── move-state.sh          # Reads IDs from config (not hardcoded)
│       ├── set-priority.sh        # Reads IDs from config
│       └── init-project-config.sh # NEW: discovers GH project IDs via API
└── docs/
    └── DESIGN.md                  # Design doc (project refs removed)
```

## Source Files

Copy from `ocp-services`:

| Source | Destination in target repo |
|---|---|
| `.claude/skills/task/SKILL.md` | `skill/SKILL.md` |
| `.claude/hooks/task-tracker.sh` | `hooks/task-tracker.sh` |
| `scripts/task-tracker/*.mjs` | `scripts/task-tracker/` |
| `scripts/task-tracker/tests/` | `scripts/task-tracker/tests/` |
| `scripts/gh/move-state.sh` | `scripts/gh/move-state.sh` |
| `scripts/gh/set-priority.sh` | `scripts/gh/set-priority.sh` |
| `.claude/skills/task-tracker/DESIGN.md` | `docs/DESIGN.md` |

## Specific Code Changes

### 1. `scripts/task-tracker/config.mjs` — clear hardcoded defaults
- Change DEFAULTS: `projectId: ''`, `fieldActualMinutes: ''`, `fieldContextWords: ''`, `fieldActualHours: ''`, `repo: ''`
- Add `assignee: '@me'` (replaces hardcoded `kburson`)
- Add new keys: `kanbanFieldId: ''`, `kanbanOptionBacklog: ''`, `kanbanOptionReady: ''`, `kanbanOptionInProgress: ''`, `kanbanOptionInReview: ''`, `kanbanOptionDone: ''`

### 2. `scripts/task-tracker/task-tracker.mjs` — one line change
- `createNewIssue`: replace `'--assignee', 'kburson'` → `'--assignee', cfg.assignee || '@me'`

### 3. `skill/SKILL.md` — generalize the GraphQL query
- Replace the hardcoded `-f owner=kburson -f repo=options-co-pilot` with dynamic extraction from `cfg.repo` (which is `owner/repo` format). Instruction: parse with `const [owner, repo] = cfg.repo.split('/')`.
- Remove the hardcoded path reference to `docs/superpowers/specs/...` — point to `docs/DESIGN.md` in the package instead.

### 4. `scripts/gh/move-state.sh` — read IDs from config
Replace hardcoded `PROJECT_ID`, `FIELD_ID`, and all `OPTION_ID` assignments with config reads using python3:
```bash
CONFIG_FILE="$(git rev-parse --show-toplevel 2>/dev/null)/.claude/task-tracker.json"
read_config() { python3 -c "import json; d=json.load(open('$CONFIG_FILE')); print(d.get('$1',''))" 2>/dev/null; }
PROJECT_ID=$(read_config projectId)
FIELD_ID=$(read_config kanbanFieldId)
```
Map each state to `kanbanOption<State>` config key. Error with `"Run: npx claude-gh-task-manager init"` if any ID is empty.

### 5. `scripts/gh/set-priority.sh` — same pattern
Read `projectId` and priority field/option IDs from config. (Currently also has hardcoded IDs.)

### 6. NEW: `scripts/gh/init-project-config.sh`
Interactive shell script that:
1. Prompts for `repo` (e.g. `owner/my-project`) and GitHub Project number
2. Queries GH API for project node ID: `gh project list --owner <owner> --format json`
3. Queries project fields to find Status field ID + all option IDs
4. Writes everything to `.claude/task-tracker.json` in the target project
5. Prints a summary of what was written

### 7. NEW: `bin/cli.mjs` — npm package CLI entry
ES module. Supports two commands:

**`install [--target <dir>]`** (default target: `process.cwd()`):
1. Copy `skill/SKILL.md` → `<target>/.claude/skills/task/SKILL.md`
2. Copy `hooks/task-tracker.sh` → `<target>/.claude/hooks/task-tracker.sh`  
3. Copy `scripts/` → `<target>/scripts/task-tracker/` and `<target>/scripts/gh/`
4. Patch `<target>/.claude/settings.json`: add hook registrations for SessionStart, PreCompact, PostCompact pointing to `task-tracker.sh`
5. Print next step: "Run `npx claude-gh-task-manager init` to configure your GitHub project."

**`init [--target <dir>]`**:
- Shell out to `scripts/gh/init-project-config.sh` in the installed location

### 8. NEW: `package.json`
```json
{
  "name": "claude-gh-task-manager",
  "version": "1.0.0",
  "type": "module",
  "bin": { "claude-gh-task-manager": "./bin/cli.mjs" },
  "engines": { "node": ">=18" },
  "description": "Claude Code /task skill — bind AI sessions to GitHub issues and auto-log time + context words",
  "license": "MIT"
}
```

### 9. NEW: `README.md`
Sections: Overview, Prerequisites (`node >=18`, `gh` CLI authenticated), Quick Start (3 commands: npx install, npx init, /task #N), Config reference, Kanban setup details, Troubleshooting.

### 10. `docs/DESIGN.md`
Copy of the design doc with:
- Remove the `<!-- copy of ... -->` header comment
- Remove "Parent issue: #107" reference  
- Replace `kburson/options-co-pilot` with placeholder `owner/repo`

## Critical Files to Edit (in target repo after copy)

1. `scripts/task-tracker/config.mjs` — clear IDs, add new keys
2. `scripts/task-tracker/task-tracker.mjs` — assignee line only
3. `skill/SKILL.md` — GraphQL owner/repo, DESIGN.md path
4. `scripts/gh/move-state.sh` — read from config
5. `scripts/gh/set-priority.sh` — read from config

## New Files to Create (in target repo)

1. `package.json`
2. `bin/cli.mjs`
3. `scripts/gh/init-project-config.sh`
4. `README.md`
5. `.gitignore` — `node_modules/`, `*.json` runtime state files

## Verification

1. In the target repo: `node scripts/task-tracker/task-tracker.mjs status` should print "No active task" without error
2. `node bin/cli.mjs install --target /tmp/test-project` should create all expected files and print next steps
3. `node scripts/task-tracker/tests/*.test.mjs` should pass (all tests are self-contained)
4. In a real project: run `npx . install` from the package dir, verify `.claude/skills/task/SKILL.md` appears in target
5. Confirm `move-state.sh` errors with a helpful config message when `kanbanFieldId` is empty
