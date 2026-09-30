// @story #1857
// Artifact authoring is independent of lifecycle; execution and commits are not.
import path from 'node:path';
import { resolveMutationTarget } from './mutation-context.mjs';

export const DOC_SCRIPT_EXTENSIONS = Object.freeze([
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.py',
  '.pyw',
  '.rb',
  '.pl',
  '.ps1',
  '.psm1',
  '.bat',
  '.cmd',
]);

export function artifactPathPolicy(relative) {
  if (
    typeof relative !== 'string' ||
    relative.split('/').some((part) => part === '..' || part === '.')
  )
    return 'other';
  if (/^(?:\.scratch|\.tmp)(?:\/|$)/.test(relative)) return 'allow';
  if (!/^docs(?:\/|$)/.test(relative)) return 'other';
  return DOC_SCRIPT_EXTENSIONS.includes(path.extname(relative).toLowerCase()) ? 'block' : 'allow';
}

// Only literal words and the operators consumed below are accepted. Expansion,
// substitution, comments and control flow never receive an artifact allowance.
function tokens(source) {
  const result = [];
  let i = 0;
  while (i < source.length) {
    if (/[ \t]/.test(source[i])) {
      i++;
      continue;
    }
    if (/[\r\n;&()<>|]/.test(source[i])) {
      const op = source.slice(i).match(/^(>>|<<|>|[|])/);
      if (!op) return null;
      result.push({ op: op[0] });
      i += op[0].length;
      continue;
    }
    let value = '';
    let quoted = false;
    while (i < source.length && !/[ \t\r\n;&()<>|]/.test(source[i])) {
      const c = source[i++];
      if (c === "'" || c === '"') {
        quoted = true;
        const end = source.indexOf(c, i);
        if (end < 0) return null;
        const text = source.slice(i, end);
        if (c === '"' && /[$\x60\\]/.test(text)) return null;
        value += text;
        i = end + 1;
      } else {
        if (/[$\x60\\*?[\]{}#~]/.test(c)) return null;
        value += c;
      }
    }
    if (!value && !quoted) return null;
    result.push({ value, quoted });
  }
  return result;
}

function literalWriter(words) {
  if (!words.length || words.some((word) => word.op)) return false;
  if (!['echo', 'printf'].includes(words[0].value)) return false;
  return words.length > 1 && !words[1].value.startsWith('-');
}
function destinations(words) {
  if (!words.length || words.some((word) => word.op || !word.value || word.value.startsWith('-')))
    return null;
  return words.map((word) => word.value);
}

export function artifactShellTargets(command) {
  if (typeof command !== 'string') return null;
  let source = command.trim();
  if (source.includes('\n')) {
    const first = source.indexOf('\n');
    const header = tokens(source.slice(0, first));
    const index = header?.findIndex((word) => word.op === '<<') ?? -1;
    const delimiter = header?.[index + 1];
    if (index < 0 || !delimiter?.quoted || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(delimiter.value))
      return null;
    const lines = source.slice(first + 1).split('\n');
    if (lines.pop() !== delimiter.value || lines.includes(delimiter.value)) return null;
    header.splice(index, 2);
    // Heredoc input is data only for direct cat transport.
    if (header[0]?.value !== 'cat') return null;
    const redirect = header.findIndex((word) => word.op === '>' || word.op === '>>');
    return redirect === 1 && header.length === 3 ? destinations(header.slice(2)) : null;
  }
  const words = tokens(source);
  if (!words?.length) return null;
  const executable = words[0].value;
  if (executable === 'mkdir' || executable === 'touch') {
    const args = words.slice(1);
    if (executable === 'mkdir' && args[0]?.value === '-p') args.shift();
    if (args[0]?.value === '--') args.shift();
    return destinations(args);
  }
  const pipe = words.findIndex((word) => word.op === '|');
  if (pipe >= 0) {
    if (!literalWriter(words.slice(0, pipe)) || words[pipe + 1]?.value !== 'tee') return null;
    const args = words.slice(pipe + 2);
    if (args[0]?.value === '-a') args.shift();
    if (args[0]?.value === '--') args.shift();
    return destinations(args);
  }
  if (executable === 'tee') {
    const args = words.slice(1);
    if (args[0]?.value === '-a') args.shift();
    if (args[0]?.value === '--') args.shift();
    return destinations(args);
  }
  const redirect = words.findIndex((word) => word.op === '>' || word.op === '>>');
  if (redirect < 0 || !literalWriter(words.slice(0, redirect))) return null;
  return words.length === redirect + 2 ? destinations(words.slice(redirect + 1)) : null;
}

export function resolveArtifactShell(command, invocationDir, projectRoot) {
  const targets = artifactShellTargets(command);
  if (!targets) return { status: 'other', targets: [] };
  // Non-artifact commands retain their original binding and path guards.
  const candidate = targets.some(
    (target) =>
      artifactPathPolicy(
        path.relative(projectRoot, path.resolve(invocationDir, target)).split(path.sep).join('/')
      ) !== 'other'
  );
  if (!candidate) return { status: 'other', targets };
  try {
    const resolved = targets.map((target) =>
      resolveMutationTarget(target.replace(/^(?:\.\/)+/, ''), invocationDir, projectRoot)
    );
    const policies = resolved.map((target) => artifactPathPolicy(target.relative));
    if (policies.includes('block'))
      return {
        status: 'block',
        targets,
        reason: 'Script formats are not permitted under docs/; use .scratch/ or .tmp/.',
      };
    return { status: policies.every((policy) => policy === 'allow') ? 'allow' : 'other', targets };
  } catch (error) {
    return { status: 'block', targets, reason: error.message };
  }
}
