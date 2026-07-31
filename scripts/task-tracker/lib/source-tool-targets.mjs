// #1049 — normalize source-edit targets across Claude's structured edit tools
// and Codex's freeform apply_patch tool. Unknown apply_patch shapes fail closed
// as a synthetic WRITE_CODE target; callers must never treat them as pathless.

export const SOURCE_EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'apply_patch']);
export const CONSERVATIVE_APPLY_PATCH_TARGET = 'src/__aitm_unknown_apply_patch__.mjs';

const PATCH_START = '*** Begin Patch';
const PATCH_END = '*** End Patch';
const PATH_HEADER = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/;
const MOVE_HEADER = /^\*\*\* Move to: (.+)$/;
const NON_TARGET_CONTROL = new Set([PATCH_START, PATCH_END, '*** End of File']);

function conservativeApplyPatch() {
  return {
    exact: false,
    targets: [CONSERVATIVE_APPLY_PATCH_TARGET],
  };
}

function exactApplyPatchText(toolInput) {
  if (typeof toolInput === 'string') return toolInput;
  if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) return null;
  const keys = Object.keys(toolInput);
  if (keys.some((key) => key !== 'patch' && key !== 'input')) return null;
  const candidates = [toolInput.patch, toolInput.input].filter(
    (value) => typeof value === 'string'
  );
  if (candidates.length === 0 || new Set(candidates).size !== 1) return null;
  return candidates[0];
}

function parseApplyPatchTargets(rawPatch) {
  if (typeof rawPatch !== 'string') return null;
  const lines = rawPatch.replace(/\r\n/g, '\n').split('\n');
  while (lines.at(-1) === '') lines.pop();
  if (lines[0] !== PATCH_START || lines.at(-1) !== PATCH_END) return null;

  const targets = [];
  for (const line of lines) {
    const pathMatch = line.match(PATH_HEADER) || line.match(MOVE_HEADER);
    if (pathMatch) {
      const target = pathMatch[1].trim();
      if (!target || target === '/dev/null') return null;
      targets.push(target);
      continue;
    }
    if (line.startsWith('*** ') && !NON_TARGET_CONTROL.has(line)) return null;
  }
  if (targets.length === 0) return null;
  return [...new Set(targets)];
}

export function resolveSourceToolTargets(toolName, toolInput) {
  if (toolName === 'apply_patch') {
    const targets = parseApplyPatchTargets(exactApplyPatchText(toolInput));
    return targets ? { exact: true, targets } : conservativeApplyPatch();
  }

  const filePath = toolInput?.file_path ?? toolInput?.notebook_path ?? toolInput?.path ?? '';
  return {
    exact: true,
    targets: typeof filePath === 'string' && filePath ? [filePath] : [],
  };
}
