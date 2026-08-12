// @story #560
// Pure parsers extracted from scripts/gh/init-project-config.sh so the project
// bootstrap's deterministic transforms are test-reachable instead of locked in
// the bash monolith. Each function reproduces, byte-for-byte, the behavior of
// the bash/jq it replaces (characterize-then-port — see #560 deep dive).

// Canonical Status (kanban) single-select palette. Mirrors the
// CANONICAL_STATUS_PALETTE heredoc array in init-project-config.sh; the eight
// states + colors must stay in lock-step with the board.
export const CANONICAL_STATUS_PALETTE = [
  { name: 'Backlog', color: 'GRAY', description: 'Unvetted ideas; not yet shaped.' },
  { name: 'Refine', color: 'GREEN', description: 'Items being shaped: AC, sizing, estimates.' },
  {
    name: 'Ready for Planning',
    color: 'GRAY',
    description: 'Refinement is complete; eligible for JIT planning.',
  },
  { name: 'Plan', color: 'BLUE', description: 'Items being deep-dived: design + caller analysis.' },
  { name: 'Develop', color: 'YELLOW', description: 'Implementation in progress.' },
  { name: 'Test', color: 'ORANGE', description: 'Agent verification in progress.' },
  { name: 'Review', color: 'BLUE', description: 'All checks passed; awaiting human approval.' },
  { name: 'Done', color: 'PURPLE', description: '' },
];

// canon_color <state-name> → canonical color for that state ('' if unknown).
export function canonColor(name, palette = CANONICAL_STATUS_PALETTE) {
  const hit = palette.find((p) => p.name === name);
  return hit ? hit.color : '';
}

// project_number_from_input <raw> [owner] → "<login>:<number>" or '' (no match).
// Ports the three bash regex branches in order:
//   1. a full github.com/{users,orgs}/<login>/projects/<n> URL
//   2. a "<login>/<n>" or "<login>:<n>" shorthand
//   3. a bare "<n>" (defaults the login to the repo owner)
export function projectNumberFromInput(raw, owner = '') {
  if (raw == null) return '';
  const str = String(raw);
  let m = str.match(/github\.com\/(users|orgs)\/([^/]+)\/projects\/([0-9]+)/);
  if (m) return `${m[2]}:${m[3]}`;
  m = str.match(/^([A-Za-z0-9._-]+)[/:]([0-9]+)$/);
  if (m) return `${m[1]}:${m[2]}`;
  if (/^[0-9]+$/.test(str)) return `${owner}:${str}`;
  return '';
}

// clean_nodes — the jq `def clean_nodes` from normalize_project_list. Accepts
// the parsed GraphQL payload (already JSON.parse'd) in any of its three shapes.
function cleanNodes(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const repoNodes = payload?.data?.repository?.projectsV2?.nodes;
    if (Array.isArray(repoNodes)) return repoNodes;
    const userNodes = payload?.data?.user?.projectsV2?.nodes ?? [];
    const orgNodes = payload?.data?.organization?.projectsV2?.nodes ?? [];
    return [...userNodes, ...orgNodes];
  }
  return [];
}

// normalize_project_list <payload> <linked> → [{id,title,number,linked}].
// Selects only nodes carrying id + title + number, exactly like the jq
// `select(.id and .title and .number)`.
export function normalizeProjectList(payload, linked) {
  return cleanNodes(payload)
    .filter((n) => n && n.id && n.title && n.number)
    .map((n) => ({ id: n.id, title: n.title, number: n.number, linked }));
}

// PROJECTS_JSON merge step: concat the linked + owner lists, group by id,
// collapse to one row per project (linked = OR across duplicates), then
// sort linked-first, then by ascending project number.
export function mergeProjectLists(linkedList = [], ownerList = []) {
  const byId = new Map();
  for (const p of [...linkedList, ...ownerList]) {
    const prev = byId.get(p.id);
    if (prev) {
      prev.linked = prev.linked || p.linked;
    } else {
      byId.set(p.id, { id: p.id, title: p.title, number: p.number, linked: p.linked });
    }
  }
  return [...byId.values()].sort((a, b) => {
    const al = a.linked ? 0 : 1;
    const bl = b.linked ? 0 : 1;
    if (al !== bl) return al - bl;
    return a.number - b.number;
  });
}
