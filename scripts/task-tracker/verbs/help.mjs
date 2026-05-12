export function verbHelp() {
  console.log(
    `
Task Tracker — available commands

  /task                     Show active task, elapsed time, words since last marker
  /task #N                  Start or switch to issue #N
  /task new [title]         Create a new issue and start tracking it
  /task plan                Open an untracked planning bucket
  /task pause               Flush timing and pause the active task
  /task resume              Resume the last paused task
  /task resume #N           Switch back to a specific paused task
  /task update [msg]        Checkpoint — flush timing, reset counters, keep task active
  /task review #N           Move issue through Test to Review, flush timing, and pause
  /task review #N --duration-minutes N --words N  Agent-reported timing (skips JSONL read)
  /task words-count         Print word count for the current session (agent use)
  /task close [#N]          Close the active or specified task (runs pre-close gate)
  /task close --force       Close even if unchecked items remain
  /task check "<label>"     Toggle a checkbox in the active issue body
  /task log #N              Re-compute and write Engaged/Session Time + Context Length
  /task migrate [--dry-run] Migrate repo issues into a selected/configured project
  /task fleet               Show all active tasks across parallel worktrees
  /task config              List all config values
  /task config <key> <val>  Set a config value (project-local)
  /task config init         Run the interactive configuration interview
  /task help | ?            Show this help message

State transitions (7-state kanban):
  /task promote [#N]        Advance one forward state (Backlog→Refine→Plan→Develop→Test→Review→Done)
  /task next [#N]           Alias of /task promote
  /task demote [#N]         Return to Develop (from Test or Review)
  /task reconcile #N <mode> Drift recovery: accept-live | revert-to-recorded

Aliases: start = resume, end = close, next = promote
`.trim()
  );
}
