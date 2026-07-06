// #715 — cross-project guard for agent-issued `gh` board access.
//
// aitm owns all Project-board access through the bound `projectId`
// (`task-tracker.json`). Its own ProjectV2 GraphQL runs inside `node` child
// processes via the `gql()` helper — never as a Bash `gh …` command — so the
// PreToolUse Bash hook that wires this guard never sees internal traffic. The
// blast radius is exactly agent-typed `gh project` / `gh api graphql` commands.
//
// Two refusals:
//   1. `gh project <subcommand>` — refused outright. Project selectors are
//      owner-relative and number-based, so a guessed number resolves to *some*
//      board, not necessarily the bound one. Reads go through `aitm board`;
//      writes through the state verbs.
//   2. `gh api graphql` ProjectV2 operations — inspected. A query pinning only
//      the bound `projectId` is allowed (an id-pinned query cannot cross
//      boards). A query carrying any non-bound `PVT_` id, or none at all (the
//      client-side `content.number` filter form), is refused.
//
// Pure and side-effect-free: `evaluateGhProject({command, boundProjectId})`
// returns `{block, reason?}`. `boundProjectId` may be null (unreadable config);
// the guard then fails closed — every non-bound-id and no-id branch still fires,
// only the exact-bound-id allow is suppressed.

// A real `gh project` invocation: the `project` token followed by a subcommand
// word (item-list, view, item-add, field-list, …). Requiring a trailing word
// avoids flagging the bare string `gh project` mentioned in prose/grep.
const GH_PROJECT_RE = /\bgh\s+project\s+[a-z]/i;

const GH_API_RE = /\bgh\s+api\b/;
const GH_API_GRAPHQL_RE = /\bgraphql\b/;

// A ProjectV2 GraphQL operation references one of these tokens (case-insensitive).
const PROJECT_V2_TOKEN_RE = /projectV2|projectItems|projectsV2/i;

// ProjectV2 node ids are `PVT_` + base64url-ish payload.
const PVT_ID_RE = /PVT_[A-Za-z0-9_-]+/g;

const READ_VERB_HINT =
  '  Read board Status with `aitm board [#N]` (resolves the bound projectId internally).\n' +
  '  Change Status with the state verbs (`/task promote`, `/task demote`, `/task reconcile`).';

// Classify a command's board intent without deciding block/allow.
//   'gh-project'   — a `gh project` subcommand
//   'graphql'      — a `gh api graphql` ProjectV2 operation (ids in `.ids`)
//   null           — not board-related
export function classifyGhProject(command) {
  const cmd = String(command || '');
  if (GH_PROJECT_RE.test(cmd)) return { kind: 'gh-project' };
  if (GH_API_RE.test(cmd) && GH_API_GRAPHQL_RE.test(cmd) && PROJECT_V2_TOKEN_RE.test(cmd)) {
    const ids = cmd.match(PVT_ID_RE) ?? [];
    return { kind: 'graphql', ids };
  }
  return null;
}

export function evaluateGhProject({ command, boundProjectId }) {
  const hit = classifyGhProject(command);
  if (!hit) return { block: false };

  if (hit.kind === 'gh-project') {
    return {
      block: true,
      reason:
        'Direct `gh project` access is forbidden.\n' +
        '  Project boards are owner-relative and number-based — a guessed project number can resolve to the wrong board. aitm owns board access via the bound `projectId`.\n' +
        READ_VERB_HINT,
    };
  }

  // graphql ProjectV2 operation
  const ids = hit.ids ?? [];
  const bound = boundProjectId || null;

  if (ids.length === 0) {
    return {
      block: true,
      reason:
        '`gh api graphql` runs a ProjectV2 query with no pinned project id — a client-side project-number / `content.number` filter. This is the hand-rolled cross-project read aitm guards against (a same-numbered issue on another board can be misread).\n' +
        READ_VERB_HINT,
    };
  }

  const nonBound = ids.filter((id) => id !== bound);
  if (nonBound.length > 0) {
    const shown = [...new Set(nonBound)].join(', ');
    const boundNote = bound
      ? `the bound project (${bound})`
      : 'the bound project (bound `projectId` could not be read — failing closed)';
    return {
      block: true,
      reason:
        `\`gh api graphql\` targets ProjectV2 id ${shown}, which is not ${boundNote}.\n` +
        '  aitm reads and writes only the bound board.\n' +
        READ_VERB_HINT,
    };
  }

  // Every id present equals the bound projectId — an id-pinned query that
  // cannot cross boards. Allow it.
  return { block: false };
}
