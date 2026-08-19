import path from 'node:path';

export class MutationParseError extends Error {
  constructor(message) {
    super(`mutation-targets: ${message}`);
    this.name = 'MutationParseError';
    this.code = 'mutation-parse-error';
  }
}

function safePatchPath(value) {
  const candidate = String(value || '').trim();
  if (!candidate || candidate.includes('\0') || candidate.includes('\\')) {
    throw new MutationParseError('invalid patch path');
  }
  const segments = candidate.split('/');
  if (segments.includes('..') || segments.includes('.')) {
    throw new MutationParseError(`unsafe patch path: ${candidate}`);
  }
  return candidate;
}

export function extractApplyPatchTargets(patchText) {
  const text = String(patchText || '');
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

function shellWords(segment) {
  const words = [];
  let word = '';
  let quote = '';
  let escaped = false;
  for (const char of String(segment || '')) {
    if (escaped) {
      word += char;
      escaped = false;
    } else if (char === '\\' && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (char === quote) quote = '';
      else word += char;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (/\s/.test(char)) {
      if (word) (words.push(word), (word = ''));
    } else {
      word += char;
    }
  }
  if (quote || escaped) return null;
  if (word) words.push(word);
  return words;
}

function absoluteTarget(candidate, projectRoot) {
  const value = String(candidate || '').trim();
  if (!value || /[$`*?{}()[\]]/.test(value)) return null;
  return path.resolve(projectRoot, value);
}

const READ_ONLY_COMMANDS = new Set([
  'basename',
  'cat',
  'cut',
  'df',
  'dirname',
  'du',
  'echo',
  'false',
  'grep',
  'head',
  'jq',
  'ls',
  'printf',
  'pwd',
  'readlink',
  'realpath',
  'rg',
  'stat',
  'tail',
  'test',
  'tr',
  'true',
  'wc',
  'which',
]);

const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  'blame',
  'cat-file',
  'cherry',
  'describe',
  'diff',
  'for-each-ref',
  'grep',
  'log',
  'ls-files',
  'merge-base',
  'rev-parse',
  'shortlog',
  'show',
  'status',
]);

function readOnlySegment(words) {
  if (words.length === 0) return true;
  let index = 0;
  const command = path.basename(words[index] || '');
  if (!command) return true;
  if (words[index] !== command || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index])) return false;
  if (command === 'git') {
    if (words[index + 1] === '--no-pager') index += 1;
    const dangerousOption = words.some((word) => /^(?:-O|--(?:te|fi|op|ou|ex))/.test(word));
    return !dangerousOption && READ_ONLY_GIT_SUBCOMMANDS.has(words[index + 1]);
  }
  if (command === 'rg') {
    const commandOption = words.some(
      (word) =>
        word === '--pre' ||
        word.startsWith('--pre=') ||
        word === '--hostname-bin' ||
        word.startsWith('--hostname-bin=')
    );
    if (commandOption) return false;
  }
  if (READ_ONLY_COMMANDS.has(command)) return true;
  return ['tee', 'touch', 'mkdir', 'rmdir', 'rm', 'truncate'].includes(command);
}

export function extractBashWriteTargets(command, projectRoot) {
  const text = String(command || '');
  const root = path.resolve(projectRoot || process.cwd());
  const targets = new Set();
  let ambiguousMutation = false;
  const add = (candidate) => {
    const target = absoluteTarget(candidate, root);
    if (!target) ambiguousMutation = true;
    else targets.add(target);
  };

  if (/\$\(|`|\b(?:eval|node|python\d*|ruby|perl)\s+(?:-[^\s]*[ec])\b/.test(text)) {
    ambiguousMutation = true;
  }
  // Reviewer Bash is intentionally a single-command grammar. Shell composition,
  // input/process substitution, backgrounding, and fd-prefixed redirects are
  // denied even when the leading command is read-only; target extraction cannot
  // prove every nested command or descriptor destination.
  if (/[&|;<()\r\n]/.test(text) || /(?:^|\s)(?:[0-9]+|&)>>?/.test(text)) {
    ambiguousMutation = true;
  }
  const redirectRe = />>?\s*("[^"]+"|'[^']+'|[^\s;&|]+)/g;
  for (const match of text.matchAll(redirectRe)) add(match[1].replace(/^(['"])(.*)\1$/, '$2'));

  const segments = text.split(/&&|\|\||(?<!\|)\|(?!\|)|[;\n]/);
  for (const segment of segments) {
    const words = shellWords(segment);
    if (!words) {
      ambiguousMutation = true;
      continue;
    }
    if (!readOnlySegment(words)) ambiguousMutation = true;
    const tee = words.findIndex((word) => path.basename(word) === 'tee');
    if (tee >= 0) {
      for (const word of words.slice(tee + 1)) if (!word.startsWith('-')) add(word);
    }
    const commandIndex = words.findIndex((word) =>
      ['touch', 'mkdir', 'rmdir', 'rm', 'truncate'].includes(path.basename(word))
    );
    if (commandIndex >= 0) {
      for (const word of words.slice(commandIndex + 1)) if (!word.startsWith('-')) add(word);
    }
    const copyIndex = words.findIndex((word) =>
      ['cp', 'mv', 'install'].includes(path.basename(word))
    );
    if (copyIndex >= 0) {
      ambiguousMutation = true;
      const operands = words.slice(copyIndex + 1).filter((word) => !word.startsWith('-'));
      if (operands.length < 2) ambiguousMutation = true;
      else add(operands.at(-1));
    }
  }

  const appearsMutating =
    /(?<![0-9&])>>?|\b(?:tee|touch|mkdir|rmdir|rm|truncate|cp|mv|install)\b/.test(text);
  if (appearsMutating && targets.size === 0) ambiguousMutation = true;
  return { targets: [...targets], ambiguousMutation };
}
