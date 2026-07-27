// @story #556
// Command manifest — the single declarative source of truth for the `/task`
// (a.k.a. `aitm`) verb set. Before #556 the verb list was recovered by
// regex-scraping `case` labels out of task-tracker.mjs's dispatch switch
// (bin/aitm-registry.mjs#parseVerbs). That worked but carried no metadata: no
// descriptions, no alias relationships, no policy/category grouping — and the
// regex silently drifted from intent whenever a `case` was added for a
// non-command purpose.
//
// This manifest declares every verb explicitly: its canonical name, any
// aliases, a one-line description, a category for grouped help output, and the
// dispatch target (the handler the verb hub imports, or `inline` for verbs
// handled directly in the switch body). `bin/aitm-registry.mjs` now consumes
// this manifest instead of regex-parsing. The drift that the regex risked is
// closed in the other direction by a parity test
// (tests/unit/command-manifest.test.mjs): the manifest's declared verb set must
// equal the actual `case` labels in the dispatch switch, so neither can change
// without the other.
//
// Every verb dispatches through the task-tracker verb hub
// (scripts/task-tracker/task-tracker.mjs). The `dispatch` field records WHICH
// handler the hub routes to, for documentation and the parity cross-check; it
// is not a second dispatch mechanism.

/**
 * @typedef {Object} CommandEntry
 * @property {string}   verb        Canonical command name.
 * @property {string[]} aliases     Alternate names that resolve to this verb.
 * @property {string}   description One-line human summary for help output.
 * @property {string}   category    Grouping bucket for help output.
 * @property {string}   dispatch    Handler the verb hub routes to, relative to
 *                                  scripts/task-tracker/ (or 'inline').
 */

/** @type {CommandEntry[]} */
export const COMMAND_MANIFEST = [
  // --- Binding & timer -----------------------------------------------------
  {
    verb: 'start',
    aliases: [],
    description: 'Bind the session to an issue and start its work timer.',
    category: 'binding',
    dispatch: 'verbs/start.mjs',
  },
  {
    verb: 'stop',
    aliases: [],
    description: 'Stop the active work timer for the bound issue.',
    category: 'timer',
    dispatch: 'verbs/stop.mjs',
  },
  {
    verb: 'pause',
    aliases: [],
    description: 'Pause the work timer with a reason note.',
    category: 'timer',
    dispatch: 'verbs/pause.mjs',
  },
  {
    verb: 'resume',
    aliases: [],
    description: 'Resume a paused work timer.',
    category: 'timer',
    dispatch: 'verbs/resume.mjs',
  },
  {
    verb: 'update',
    aliases: [],
    description: "Refresh the issue's timing-log markers from the current session.",
    category: 'timer',
    dispatch: 'verbs/update.mjs',
  },
  {
    verb: 'log',
    aliases: [],
    description: 'Append a manual timing-log entry for an issue.',
    category: 'timer',
    dispatch: 'inline',
  },
  {
    verb: 'words-count',
    aliases: [],
    description: 'Report the context-word count accrued since the last marker.',
    category: 'timer',
    dispatch: 'inline',
  },

  // --- Lifecycle / state transitions ---------------------------------------
  {
    verb: 'refine',
    aliases: [],
    description: 'Move the issue into Refine and run the refine gate.',
    category: 'lifecycle',
    dispatch: 'verbs/refine.mjs',
  },
  {
    verb: 'promote',
    aliases: ['next'],
    description: 'Advance the issue to the next board state.',
    category: 'lifecycle',
    dispatch: 'verbs/promote.mjs',
  },
  {
    verb: 'demote',
    aliases: [],
    description: 'Send the issue back one board state toward Develop.',
    category: 'lifecycle',
    dispatch: 'verbs/demote.mjs',
  },
  {
    verb: 'park',
    aliases: [],
    description: 'Send a Refine or Plan issue back to Backlog with a reason.',
    category: 'lifecycle',
    dispatch: 'verbs/park.mjs',
  },
  {
    verb: 'test',
    aliases: [],
    description: 'Run the Test-stage sandbox verification for the issue.',
    category: 'lifecycle',
    dispatch: 'verbs/test.mjs',
  },
  {
    verb: 'review',
    aliases: [],
    description: 'Run the Review-stage gate scan over the issue.',
    category: 'lifecycle',
    dispatch: 'verbs/review.mjs',
  },
  {
    verb: 'close',
    aliases: ['end'],
    description: 'Close the bound issue and move it to Done.',
    category: 'lifecycle',
    dispatch: 'verbs/close.mjs',
  },
  {
    verb: 'reconcile',
    aliases: [],
    description: 'Repair board/state drift for the bound issue.',
    category: 'lifecycle',
    dispatch: 'verbs/reconcile.mjs',
  },
  {
    verb: 'supersede',
    aliases: [],
    description: 'Abandon the issue, closing it as superseded.',
    category: 'lifecycle',
    dispatch: 'verbs/supersede.mjs',
  },
  {
    verb: 'pull-next',
    aliases: [],
    description: 'Pull the next ready issue into active work.',
    category: 'lifecycle',
    dispatch: 'verbs/pull-next.mjs',
  },

  // --- Planning ------------------------------------------------------------
  {
    verb: 'new',
    aliases: [],
    description: 'Create a new issue via the preflight template.',
    category: 'planning',
    dispatch: 'verbs/new.mjs',
  },
  {
    verb: 'plan',
    aliases: [],
    description: 'Open the planning workflow for the issue.',
    category: 'planning',
    dispatch: 'verbs/plan.mjs',
  },
  {
    verb: 'save-plan',
    aliases: [],
    description: 'Persist the drafted plan onto the issue.',
    category: 'planning',
    dispatch: 'verbs/save-plan.mjs',
  },
  {
    verb: 'save-draft',
    aliases: [],
    description: 'Autosave the in-progress discovery brainstorm to a tracked draft.',
    category: 'planning',
    dispatch: 'verbs/save-draft.mjs',
  },
  {
    verb: 'plan-approve',
    aliases: [],
    description: 'Approve the drafted plan and enter Develop.',
    category: 'planning',
    dispatch: 'verbs/plan-approve.mjs',
  },
  {
    verb: 'mirror-deep-dive',
    aliases: [],
    description: 'Mirror the deep-dive analysis block onto the issue.',
    category: 'planning',
    dispatch: 'verbs/mirror-deep-dive.mjs',
  },
  {
    verb: 'user-story',
    aliases: ['story'],
    description: 'Author or repair the `## User Story` section as the first heading.',
    category: 'planning',
    dispatch: 'verbs/user-story.mjs',
  },
  {
    verb: 'inflate-estimate',
    aliases: [],
    description: 'Append an estimate-inflation record to the issue.',
    category: 'planning',
    dispatch: 'verbs/inflate-estimate.mjs',
  },
  {
    verb: 'plan-estimate',
    aliases: [],
    description: 'Write the `### Planned Estimate` appendix on the refine-estimate comment.',
    category: 'planning',
    dispatch: 'verbs/plan-estimate.mjs',
  },

  // --- Gates & evidence ----------------------------------------------------
  {
    verb: 'ensureChecked',
    aliases: ['check'],
    description:
      'Ensure a checkbox is ticked (idempotent; never unticks). #659-safe replacement for the old toggle.',
    category: 'gate',
    dispatch: 'verbs/check.mjs',
  },
  {
    verb: 'ensureUnchecked',
    aliases: [],
    description: 'Ensure a checkbox is unticked (idempotent; never ticks).',
    category: 'gate',
    dispatch: 'verbs/check.mjs',
  },
  {
    verb: 'ac-stamp',
    aliases: [],
    description: "Run an AC's declared verifier and stamp its evidence marker.",
    category: 'evidence',
    dispatch: 'verbs/ac-stamp.mjs',
  },
  {
    verb: 'dod-stamp',
    aliases: [],
    description: 'Stamp a Functional Definition-of-Done evidence marker.',
    category: 'evidence',
    dispatch: 'verbs/dod-stamp.mjs',
  },
  {
    verb: 'commit-trace',
    aliases: [],
    description: 'Record the commit trail for the issue.',
    category: 'evidence',
    dispatch: 'verbs/commit-trace.mjs',
  },
  {
    verb: 'evidence-markers',
    aliases: [],
    description: 'List the evidence markers present on the issue.',
    category: 'evidence',
    dispatch: 'verbs/evidence-markers.mjs',
  },
  {
    verb: 'approve',
    aliases: [],
    description: 'Record final review approval, enabling close.',
    category: 'gate',
    dispatch: 'verbs/approve.mjs',
  },
  {
    verb: 'reject',
    aliases: [],
    description: 'Reject review and send the issue back.',
    category: 'gate',
    dispatch: 'verbs/reject.mjs',
  },

  // --- Dependencies --------------------------------------------------------
  {
    verb: 'block',
    aliases: [],
    description: 'Mark the issue blocked by another issue.',
    category: 'dependency',
    dispatch: 'verbs/block.mjs',
  },
  {
    verb: 'unblock',
    aliases: [],
    description: 'Clear a blocked-by relationship on the issue.',
    category: 'dependency',
    dispatch: 'verbs/unblock.mjs',
  },

  // --- Meta / reporting / maintenance --------------------------------------
  {
    verb: 'status',
    aliases: [],
    description: 'Print the current issue binding and timing state.',
    category: 'meta',
    dispatch: 'verbs/status.mjs',
  },
  {
    verb: 'config',
    aliases: [],
    description: 'Read or write task-tracker configuration.',
    category: 'meta',
    dispatch: 'verbs/config.mjs',
  },
  {
    verb: 'board',
    aliases: [],
    description: "Print an issue's board Status via the bound projectId (read-only).",
    category: 'meta',
    dispatch: 'verbs/board.mjs',
  },
  {
    verb: 'kind',
    aliases: [],
    description: 'Report whether a name is a verb or a script.',
    category: 'meta',
    dispatch: 'verbs/kind.mjs',
  },
  {
    verb: 'epic-reconcile',
    aliases: [],
    description: "Record that an epic's ACs were reconciled against its delivered children.",
    category: 'meta',
    dispatch: 'verbs/epic-reconcile.mjs',
  },
  {
    verb: 'cancel',
    aliases: [],
    description: 'Clear a stuck discovery bucket and binding without logging time.',
    category: 'meta',
    dispatch: 'verbs/cancel.mjs',
  },
  {
    verb: 'auto',
    aliases: [],
    description: 'Run or toggle full-auto orchestration mode.',
    category: 'meta',
    dispatch: 'verbs/auto.mjs',
  },
  {
    verb: 'chore-mode',
    aliases: [],
    description: 'Toggle chore-mode (on/off/status) for non-issue work.',
    category: 'meta',
    dispatch: 'verbs/chore-mode.mjs',
  },
  {
    verb: 'fleet',
    aliases: [],
    description: 'Manage the parallel sub-agent fleet registry.',
    category: 'fleet',
    dispatch: 'verbs/fleet.mjs',
  },
  {
    verb: 'report',
    aliases: [],
    description: 'Generate a value/timing report.',
    category: 'reporting',
    dispatch: 'verbs/report.mjs',
  },
  {
    verb: 'discover',
    aliases: ['brainstorm'],
    description: 'Discover and scan issues into the tracker.',
    category: 'maintenance',
    dispatch: 'verbs/discover.mjs',
  },
  {
    verb: 'migrate',
    aliases: [],
    description: 'Run a corpus/board data migration.',
    category: 'maintenance',
    dispatch: 'inline',
  },
];

// name (canonical OR alias) → its CommandEntry.
export const MANIFEST_INDEX = (() => {
  const idx = new Map();
  for (const entry of COMMAND_MANIFEST) {
    idx.set(entry.verb, entry);
    for (const a of entry.aliases) idx.set(a, entry);
  }
  return idx;
})();

// Every reachable user command name — canonical verbs plus their aliases.
// This is the set `bin/aitm-registry.mjs` exposes as VERBS and the set the
// dispatcher routes to the verb hub.
export function manifestVerbNames() {
  return new Set(MANIFEST_INDEX.keys());
}

// Resolve an alias (or canonical name) to its canonical verb; null if unknown.
export function resolveVerb(name) {
  const entry = MANIFEST_INDEX.get(name);
  return entry ? entry.verb : null;
}
