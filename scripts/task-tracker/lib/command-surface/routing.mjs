// @story #1012
// Narrow operational routing identities for `/task` (a.k.a. `aitm`) verbs.
// The command catalog owns aliases and all public help metadata. This module
// records only the canonical verb-to-handler relationship needed to build that
// catalog without making routing data another help authority.
//
// Every verb dispatches through the task-tracker verb hub
// (scripts/task-tracker/task-tracker.mjs). The `dispatch` field records WHICH
// handler the hub routes to, for documentation and the parity cross-check; it
// is not a second dispatch mechanism.

/**
 * @typedef {Object} RouteIdentity
 * @property {string}   verb        Canonical command name.
 * @property {string}   dispatch    Handler the verb hub routes to, relative to
 *                                  scripts/task-tracker/ (or 'inline').
 */

/** @type {RouteIdentity[]} */
export const ROUTE_IDENTITIES = Object.freeze(
  [
    // --- Binding & timer -----------------------------------------------------
    {
      verb: 'start',
      dispatch: 'verbs/start.mjs',
    },
    {
      verb: 'stop',
      dispatch: 'verbs/stop.mjs',
    },
    {
      verb: 'pause',
      dispatch: 'verbs/pause.mjs',
    },
    {
      verb: 'resume',
      dispatch: 'verbs/resume.mjs',
    },
    {
      verb: 'update',
      dispatch: 'verbs/update.mjs',
    },
    {
      verb: 'log',
      dispatch: 'inline',
    },
    {
      verb: 'words-count',
      dispatch: 'inline',
    },

    // --- Lifecycle / state transitions ---------------------------------------
    {
      verb: 'refine',
      dispatch: 'verbs/refine.mjs',
    },
    {
      verb: 'promote',
      dispatch: 'verbs/promote.mjs',
    },
    {
      verb: 'demote',
      dispatch: 'verbs/demote.mjs',
    },
    {
      verb: 'shelve',
      dispatch: 'verbs/shelve.mjs',
    },
    {
      verb: 'park',
      dispatch: 'verbs/park.mjs',
    },
    {
      verb: 'cancel-plan',
      dispatch: 'verbs/cancel-plan.mjs',
    },
    {
      verb: 'assign',
      dispatch: 'verbs/assign.mjs',
    },
    {
      verb: 'transfer',
      dispatch: 'verbs/assign.mjs',
    },
    {
      verb: 'unassign',
      dispatch: 'verbs/unassign.mjs',
    },
    {
      verb: 'test',
      dispatch: 'verbs/test.mjs',
    },
    {
      verb: 'review',
      dispatch: 'verbs/review.mjs',
    },
    {
      verb: 'deliver',
      dispatch: 'verbs/deliver.mjs',
    },
    {
      verb: 'close',
      dispatch: 'verbs/close.mjs',
    },
    {
      verb: 'reconcile',
      dispatch: 'verbs/reconcile.mjs',
    },
    {
      verb: 'supersede',
      dispatch: 'verbs/supersede.mjs',
    },
    {
      verb: 'pull-next',
      dispatch: 'verbs/pull-next.mjs',
    },

    // --- Planning ------------------------------------------------------------
    {
      verb: 'new',
      dispatch: 'verbs/new.mjs',
    },
    {
      verb: 'plan',
      dispatch: 'verbs/plan.mjs',
    },
    {
      verb: 'save-plan',
      dispatch: 'verbs/save-plan.mjs',
    },
    {
      verb: 'save-draft',
      dispatch: 'verbs/save-draft.mjs',
    },
    {
      verb: 'plan-approve',
      dispatch: 'verbs/plan-approve.mjs',
    },
    {
      verb: 'mirror-deep-dive',
      dispatch: 'verbs/mirror-deep-dive.mjs',
    },
    {
      verb: 'user-story',
      dispatch: 'verbs/user-story.mjs',
    },
    {
      verb: 'inflate-estimate',
      dispatch: 'verbs/inflate-estimate.mjs',
    },
    {
      verb: 'plan-estimate',
      dispatch: 'verbs/plan-estimate.mjs',
    },
    {
      verb: 'decompose-check',
      dispatch: 'verbs/decompose-check.mjs',
    },
    {
      verb: 'split-plan',
      dispatch: 'verbs/split-plan.mjs',
    },

    // --- Gates & evidence ----------------------------------------------------
    {
      verb: 'ensureChecked',
      dispatch: 'verbs/check.mjs',
    },
    {
      verb: 'ensureUnchecked',
      dispatch: 'verbs/check.mjs',
    },
    {
      verb: 'ac-stamp',
      dispatch: 'verbs/ac-stamp.mjs',
    },
    {
      verb: 'dod-stamp',
      dispatch: 'verbs/dod-stamp.mjs',
    },
    {
      verb: 'commit-trace',
      dispatch: 'verbs/commit-trace.mjs',
    },
    {
      verb: 'evidence-markers',
      dispatch: 'verbs/evidence-markers.mjs',
    },
    {
      verb: 'issue-body',
      dispatch: 'verbs/issue-body.mjs',
    },
    {
      verb: 'comment',
      dispatch: 'verbs/comment.mjs',
    },
    {
      verb: 'adopt-github-records',
      dispatch: 'verbs/adopt-github-records.mjs',
    },
    {
      verb: 'approve',
      dispatch: 'verbs/approve.mjs',
    },
    {
      verb: 'reject',
      dispatch: 'verbs/reject.mjs',
    },

    // --- Dependencies --------------------------------------------------------
    {
      verb: 'block',
      dispatch: 'verbs/block.mjs',
    },
    {
      verb: 'unblock',
      dispatch: 'verbs/unblock.mjs',
    },

    // --- Meta / reporting / maintenance --------------------------------------
    {
      verb: 'status',
      dispatch: 'verbs/status.mjs',
    },
    {
      verb: 'config',
      dispatch: 'verbs/config.mjs',
    },
    {
      verb: 'board',
      dispatch: 'verbs/board.mjs',
    },
    {
      verb: 'kind',
      dispatch: 'verbs/kind.mjs',
    },
    {
      verb: 'epic-reconcile',
      dispatch: 'verbs/epic-reconcile.mjs',
    },
    {
      verb: 'cancel',
      dispatch: 'verbs/cancel.mjs',
    },
    {
      verb: 'auto',
      dispatch: 'verbs/auto.mjs',
    },
    {
      verb: 'chore-mode',
      dispatch: 'verbs/chore-mode.mjs',
    },
    {
      verb: 'fleet',
      dispatch: 'verbs/fleet.mjs',
    },
    {
      verb: 'occupancy',
      dispatch: 'verbs/occupancy.mjs',
    },
    {
      verb: 'report',
      dispatch: 'verbs/report.mjs',
    },
    {
      verb: 'discover',
      dispatch: 'verbs/discover.mjs',
    },
    {
      verb: 'migrate',
      dispatch: 'inline',
    },
  ].map((entry) => Object.freeze(entry))
);

const ROUTE_BY_VERB = new Map(ROUTE_IDENTITIES.map((entry) => [entry.verb, entry]));

export function routeIdentityForVerb(verb) {
  return ROUTE_BY_VERB.get(String(verb)) ?? null;
}
