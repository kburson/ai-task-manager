// Pure mapping helper for the 6-state → 7-state Status migration.
//
// Given a current Status option name and the project's full options map
// (name → id) for the Status field, compute the migration target. Returns
// null when no migration is required (already on 7-state vocabulary or a
// no-op state like Backlog/Done).

export const SOURCE_TO_TARGET = Object.freeze({
  Backlog: null,
  Ready: 'Groom',
  Grooming: 'Groom',
  'In Progress': 'Development',
  'In Review': 'Review',
  R4R: 'Review',
  Done: null,
  Groom: null,
  Analyze: null,
  Development: null,
  Validate: null,
  Review: null,
});

export function mapOption(currentName, optionsByName) {
  if (!currentName) return null;
  if (!Object.prototype.hasOwnProperty.call(SOURCE_TO_TARGET, currentName)) {
    throw new Error(
      `migrate-to-7-state: unknown source Status "${currentName}" — not in mapping table`
    );
  }
  const target = SOURCE_TO_TARGET[currentName];
  if (target == null) return null;
  if (currentName === target) return null;
  const targetId = optionsByName?.[target];
  if (!targetId) {
    throw new Error(
      `migrate-to-7-state: target option "${target}" is not present on the board — rename Status options first (see scripts/migrate/rename-status-2026-05.mjs)`
    );
  }
  return { targetOptionId: targetId, targetOptionName: target };
}
