export class MutationParseError extends Error {
  constructor(message) {
    super(`mutation-targets: ${message}`);
    this.name = 'MutationParseError';
    this.code = 'mutation-parse-error';
  }
}

function safePatchPath(value) {
  const candidate = String(value || '');
  if (candidate !== candidate.trim()) throw new MutationParseError('invalid patch path');
  if (!candidate || candidate.includes('\0') || candidate.includes('\\')) {
    throw new MutationParseError('invalid patch path');
  }
  const segments = candidate.split('/');
  if (segments.includes('..') || segments.includes('.')) {
    throw new MutationParseError(`unsafe patch path: ${candidate}`);
  }
  return candidate;
}

export function extractApplyPatchText(toolInput) {
  if (typeof toolInput === 'string') {
    if (toolInput.length === 0) throw new MutationParseError('empty patch payload');
    return toolInput;
  }
  if (!toolInput || typeof toolInput !== 'object' || Array.isArray(toolInput)) {
    throw new MutationParseError('invalid patch payload');
  }
  const supplied = ['patch', 'input', 'text']
    .filter((key) => Object.hasOwn(toolInput, key))
    .map((key) => toolInput[key]);
  if (supplied.some((value) => typeof value !== 'string')) {
    throw new MutationParseError('invalid patch payload');
  }
  const values = supplied.filter(Boolean);
  if (!values.length) {
    throw new MutationParseError('empty or invalid patch payload');
  }
  if (values.some((value) => value !== values[0])) {
    throw new MutationParseError('conflicting patch payload fields');
  }
  return values[0];
}

export function extractApplyPatchTargets(patchText) {
  const text = String(patchText || '').replace(/\r?\n$/, '');
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '*** Begin Patch' || lines.at(-1) !== '*** End Patch') {
    throw new MutationParseError('missing exact patch boundaries');
  }
  const targets = [];
  const seen = new Set();
  const add = (value) => {
    const candidate = safePatchPath(value);
    if (!seen.has(candidate)) {
      seen.add(candidate);
      targets.push(candidate);
    }
  };
  for (let index = 1; index < lines.length - 1; index += 1) {
    const line = lines[index];
    const file = line.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/);
    if (file) {
      add(file[1]);
      continue;
    }
    const move = line.match(/^\*\*\* Move to: (.+)$/);
    if (move) {
      add(move[1]);
      continue;
    }
    if (line.startsWith('*** ')) {
      throw new MutationParseError(`unsupported patch header: ${line}`);
    }
  }
  if (targets.length === 0) throw new MutationParseError('patch has no mutation targets');
  return targets;
}
