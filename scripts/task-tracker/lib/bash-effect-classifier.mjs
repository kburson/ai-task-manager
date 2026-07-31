// Pure Bash effect classifier shared by PreToolUse and PostToolUse hooks.
//
// This is intentionally a bounded shell grammar, not a shell interpreter.
// Positively proven reads/tests/builds are effect-free; everything ambiguous
// fails closed to `source-write`. Commit detection is segment-aware and parses
// issue refs only from actual commit-message sources.
// cspell:ignore nohup

import { isAbsolute, relative, resolve } from 'node:path';

const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
const ISSUE_REF_RE = /\[#([1-9]\d*)\]/g;
const SHELLS = new Set(['bash', 'sh', 'zsh']);
const CONTROL_PREFIXES = new Set(['!', '{', '}', 'if', 'then', 'elif', 'else', 'do']);
const CONTROL_ONLY = new Set(['fi', 'done']);

const READ_ONLY_BINS = new Set([
  '[',
  'basename',
  'cat',
  'cd',
  'cmp',
  'cut',
  'date',
  'diff',
  'dirname',
  'echo',
  'false',
  'file',
  'grep',
  'head',
  'hostname',
  'id',
  'jq',
  'ls',
  'printf',
  'pwd',
  'realpath',
  'rg',
  'sort',
  'stat',
  'tail',
  'test',
  'tr',
  'true',
  'type',
  'uname',
  'uniq',
  'wc',
  'which',
  'whoami',
]);

const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  'blame',
  'cat-file',
  'describe',
  'diff',
  'grep',
  'log',
  'ls-files',
  'ls-tree',
  'rev-list',
  'rev-parse',
  'show',
  'status',
]);

function basename(command) {
  return String(command || '')
    .split('/')
    .pop();
}

function shellTokens(command) {
  const source = String(command || '');
  const tokens = [];
  let word = '';
  let wordStart = -1;
  let quote = null;

  const flush = (end) => {
    if (wordStart === -1) return;
    tokens.push({ type: 'word', value: word, start: wordStart, end });
    word = '';
    wordStart = -1;
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (quote === '"' && char === '\\' && i + 1 < source.length) {
        word += source[++i];
      } else {
        word += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      if (wordStart === -1) wordStart = i;
      quote = char;
      continue;
    }
    if (char === '\\' && i + 1 < source.length) {
      if (wordStart === -1) wordStart = i;
      word += source[++i];
      continue;
    }
    if (char === '#' && wordStart === -1) break;
    if (/\s/.test(char)) {
      flush(i);
      continue;
    }
    if ('><;|&'.includes(char)) {
      flush(i);
      let value = char;
      if (source[i + 1] === char && ['>', '<', '|', '&'].includes(char)) {
        value += source[++i];
      } else if ((char === '>' || char === '<') && source[i + 1] === '&') {
        value += source[++i];
      } else if (char === '>' && source[i + 1] === '|') {
        value += source[++i];
      }
      tokens.push({ type: 'operator', value, start: i + 1 - value.length, end: i + 1 });
      continue;
    }
    if (wordStart === -1) wordStart = i;
    word += char;
  }
  flush(source.length);
  return tokens;
}

export function shellWords(command) {
  return shellTokens(command)
    .filter((token) => token.type === 'word')
    .map((token) => token.value);
}

function splitCommandSegments(command) {
  const source = String(command || '');
  const segments = [];
  let current = '';
  let quote = null;
  let depth = 0;

  const flush = () => {
    if (current.trim()) segments.push(current.trim());
    current = '';
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      current += char;
      if (char === '\\' && quote === '"' && i + 1 < source.length) {
        current += source[++i];
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '\\' && i + 1 < source.length) {
      current += char + source[++i];
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')' && depth > 0) depth -= 1;
    if (depth === 0) {
      if ((char === '&' || char === '|') && source[i + 1] === char) {
        flush();
        i += 1;
        continue;
      }
      if (
        (char === ';' || char === '\n' || char === '|' || char === '&') &&
        source[i - 1] !== '>'
      ) {
        flush();
        continue;
      }
    }
    current += char;
  }
  flush();
  return segments;
}

function nestedCommandBodies(command) {
  const source = String(command || '');
  const bodies = [];
  let quote = null;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote === "'") {
      if (char === "'") quote = null;
      continue;
    }
    if (char === "'" && quote !== '"') {
      quote = "'";
      continue;
    }
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '"') {
      quote = quote === '"' ? null : '"';
      continue;
    }
    if (char === '`') {
      let end = i + 1;
      while (end < source.length && source[end] !== '`') {
        if (source[end] === '\\') end += 1;
        end += 1;
      }
      const body = source.slice(i + 1, end);
      if (body.trim()) bodies.push(body);
      i = end;
      continue;
    }

    const commandSubstitution = char === '$' && source[i + 1] === '(' && source[i + 2] !== '(';
    const processSubstitution = (char === '<' || char === '>') && source[i + 1] === '(';
    if (!commandSubstitution && !processSubstitution) continue;

    const bodyStart = i + 2;
    let depth = 1;
    let innerQuote = null;
    let end = bodyStart;
    for (; end < source.length && depth > 0; end++) {
      const inner = source[end];
      if (innerQuote === "'") {
        if (inner === "'") innerQuote = null;
        continue;
      }
      if (inner === "'" && innerQuote !== '"') {
        innerQuote = "'";
        continue;
      }
      if (inner === '\\') {
        end += 1;
        continue;
      }
      if (inner === '"') {
        innerQuote = innerQuote === '"' ? null : '"';
        continue;
      }
      if (inner === '(') depth += 1;
      if (inner === ')') depth -= 1;
    }
    const body = source.slice(bodyStart, depth === 0 ? end - 1 : source.length);
    if (body.trim()) bodies.push(body);
    i = depth === 0 ? end - 1 : source.length;
  }
  return bodies;
}

function stripGrouping(segment) {
  return String(segment || '')
    .trim()
    .replace(/^[({]\s*/, '')
    .replace(/\s*[)}]$/, '')
    .trim();
}

function consumeEnvPrefix(words) {
  words.shift();
  while (words.length > 0) {
    const word = words[0];
    if (ASSIGNMENT_RE.test(word)) {
      words.shift();
      continue;
    }
    if (word === '-u' || word === '--unset' || word === '-C' || word === '--chdir') {
      words.splice(0, Math.min(2, words.length));
      continue;
    }
    if (
      word.startsWith('-u') ||
      word.startsWith('--unset=') ||
      word.startsWith('--chdir=') ||
      word === '-i' ||
      word === '--ignore-environment' ||
      word === '--'
    ) {
      words.shift();
      continue;
    }
    break;
  }
}

export function unwrapCommandWords(inputWords) {
  const words = [...inputWords];
  while (words[0] && (ASSIGNMENT_RE.test(words[0]) || CONTROL_PREFIXES.has(words[0]))) {
    words.shift();
  }
  if (CONTROL_ONLY.has(words[0])) return [];

  let changed = true;
  while (changed && words.length > 0) {
    changed = false;
    const head = basename(words[0]);
    if (head === 'env') {
      consumeEnvPrefix(words);
      changed = true;
      continue;
    }
    if (head === 'command' && words[1] !== '-v' && words[1] !== '-V') {
      words.shift();
      while (words[0]?.startsWith('-')) words.shift();
      changed = true;
      continue;
    }
    if (head === 'exec') {
      words.shift();
      if (words[0] === '-a') words.splice(0, Math.min(2, words.length));
      while (words[0]?.startsWith('-')) words.shift();
      changed = true;
      continue;
    }
    if (head === 'time') {
      words.shift();
      while (words[0]?.startsWith('-')) {
        const option = words.shift();
        if (option === '-f' || option === '-o' || option === '--format' || option === '--output') {
          words.shift();
        }
      }
      changed = true;
      continue;
    }
    if (head === 'nice') {
      words.shift();
      if (words[0] === '-n' || words[0] === '--adjustment') words.splice(0, 2);
      else if (words[0]?.startsWith('--adjustment=')) words.shift();
      else if (/^-\d+$/.test(words[0] || '')) words.shift();
      changed = true;
      continue;
    }
    if (head === 'nohup') {
      words.shift();
      while (words[0]?.startsWith('-')) words.shift();
      changed = true;
    }
  }
  while (words[0] && CONTROL_PREFIXES.has(words[0])) words.shift();
  return words;
}

function quoteShellWord(word) {
  return `'${String(word).replaceAll("'", "'\\''")}'`;
}

function findEmbeddedCommands(segment) {
  const words = unwrapCommandWords(shellWords(segment));
  if (basename(words[0]) !== 'find') return [];
  const commands = [];
  for (let i = 1; i < words.length; i++) {
    if (!/^-(?:exec|execdir|ok|okdir)$/.test(words[i])) continue;
    const body = [];
    for (i += 1; i < words.length && words[i] !== ';' && words[i] !== '+'; i++) {
      if (words[i] !== '{}') body.push(words[i]);
    }
    if (body.length > 0) commands.push(body.map(quoteShellWord).join(' '));
  }
  return commands;
}

export function collectCommandSegments(command) {
  const collected = [];
  const seen = new Set();

  function collect(source) {
    if (!source || seen.has(source)) return;
    seen.add(source);
    for (const rawSegment of splitCommandSegments(source)) {
      const segment = stripGrouping(rawSegment);
      if (!segment) continue;
      const normalized = unwrapCommandWords(shellWords(segment));
      const head = basename(normalized[0]);
      const shellFlag = SHELLS.has(head)
        ? normalized.findIndex(
            (word) => word === '--command' || (/^-[^-]+$/.test(word) && word.includes('c'))
          )
        : -1;
      const embeddedCommands = findEmbeddedCommands(segment);
      if (shellFlag >= 0 && normalized[shellFlag + 1]) {
        collect(normalized[shellFlag + 1]);
      } else if (
        normalized.length > 0 &&
        !(head === 'find' && embeddedCommands.length > 0 && !findMutatesStartPaths(normalized))
      ) {
        collected.push(segment);
      }
      for (const embedded of embeddedCommands) collect(embedded);
    }
    for (const nested of nestedCommandBodies(source)) collect(nested);
  }

  collect(String(command || ''));
  return [...new Set(collected)];
}

function positionalOperands(words, { optionArgs = new Set() } = {}) {
  const operands = [];
  let positionalOnly = false;
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (!positionalOnly && word === '--') {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && optionArgs.has(word)) {
      i += 1;
      continue;
    }
    if (!positionalOnly && word.startsWith('-')) continue;
    operands.push(word);
  }
  return operands;
}

function targetDirectory(words) {
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (word === '-t' || word === '--target-directory') return words[i + 1] || null;
    const attached = word.match(/^(?:--target-directory=|-t)(.+)$/);
    if (attached?.[1]) return attached[1];
  }
  return null;
}

function isSedMutation(words) {
  return words.some(
    (word) =>
      word === '--in-place' ||
      word.startsWith('--in-place=') ||
      (/^-[^-]+$/.test(word) && word.slice(1).includes('i'))
  );
}

function findStartPaths(words) {
  const paths = [];
  let positionalOnly = false;
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (!positionalOnly && word === '--') {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && (word.startsWith('-') || word === '!' || word === '(')) break;
    paths.push(word);
  }
  return paths;
}

function findMutatesStartPaths(words) {
  if (words.includes('-delete')) return true;
  for (let i = 1; i < words.length; i++) {
    if (!/^-(?:exec|execdir|ok|okdir)$/.test(words[i])) continue;
    const body = [];
    for (i += 1; i < words.length && words[i] !== ';' && words[i] !== '+'; i++) {
      body.push(words[i]);
    }
    const embedded = unwrapCommandWords(body.filter((word) => word !== '{}'));
    if (['rm', 'rmdir'].includes(basename(embedded[0]))) return true;
    const shellHead = basename(embedded[0]);
    const shellFlag = SHELLS.has(shellHead)
      ? embedded.findIndex(
          (word) => word === '--command' || (/^-[^-]+$/.test(word) && word.includes('c'))
        )
      : -1;
    if (shellFlag >= 0 && embedded[shellFlag + 1] && body.includes('{}')) {
      const positionalTarget = (target) =>
        /^\$(?:[0-9]+|[@*])$|^\$\{(?:[0-9]+|[@*])\}$/.test(target);
      if (extractSegmentWriteTargets(embedded[shellFlag + 1]).some(positionalTarget)) return true;
    }
  }
  return false;
}

function sedTargets(words) {
  if (!isSedMutation(words)) return [];
  const targets = [];
  let hasExplicitProgram = false;
  let consumedProgram = false;
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (word === '-e' || word === '--expression') {
      hasExplicitProgram = true;
      i += 1;
      continue;
    }
    if (word.startsWith('--expression=')) {
      hasExplicitProgram = true;
      continue;
    }
    if (word === '-f' || word === '--file') {
      hasExplicitProgram = true;
      i += 1;
      continue;
    }
    if (word.startsWith('--file=')) {
      hasExplicitProgram = true;
      continue;
    }
    if (word.startsWith('-')) continue;
    if (!hasExplicitProgram && !consumedProgram) {
      consumedProgram = true;
      continue;
    }
    targets.push(word);
  }
  return targets;
}

function extractSegmentWriteTargets(command) {
  const targets = new Set();
  const tokens = shellTokens(command);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'operator' || !['>', '>>', '>|', '>&'].includes(token.value)) {
      continue;
    }
    const next = tokens[i + 1];
    if (token.value === '>&' && next?.type === 'word' && /^(?:\d+|-)$/.test(next.value)) {
      continue;
    }
    if (next?.type === 'word' && next.value) targets.add(next.value);
  }

  const words = unwrapCommandWords(shellWords(command));
  const head = basename(words[0]);
  if (!head) return [...targets];

  const targetDir = targetDirectory(words);
  if (targetDir && ['cp', 'mv', 'install'].includes(head)) targets.add(targetDir);

  if (head === 'cp' && !targetDir) {
    const operands = positionalOperands(words, {
      optionArgs: new Set(['-S', '--suffix']),
    });
    if (operands.length > 0) targets.add(operands.at(-1));
  } else if (head === 'mv') {
    const operands = positionalOperands(words, {
      optionArgs: new Set(['-S', '--suffix', '-t', '--target-directory']),
    });
    for (const operand of operands) targets.add(operand);
  } else if (head === 'install' && !targetDir) {
    const operands = positionalOperands(words, {
      optionArgs: new Set([
        '-g',
        '--group',
        '-m',
        '--mode',
        '-o',
        '--owner',
        '-S',
        '--suffix',
        '--strip-program',
      ]),
    });
    if (words.includes('-d') || words.includes('--directory')) {
      for (const operand of operands) targets.add(operand);
    } else if (operands.length > 0) {
      targets.add(operands.at(-1));
    }
  } else if (head === 'touch') {
    const operands = positionalOperands(words, {
      optionArgs: new Set(['-d', '--date', '-r', '--reference', '-t']),
    });
    for (const operand of operands) targets.add(operand);
  } else if (head === 'mkdir') {
    const operands = positionalOperands(words, {
      optionArgs: new Set(['-m', '--mode']),
    });
    for (const operand of operands) targets.add(operand);
  } else if (head === 'rm' || head === 'rmdir' || head === 'tee') {
    for (const operand of positionalOperands(words)) targets.add(operand);
  } else if (head === 'sed') {
    for (const operand of sedTargets(words)) targets.add(operand);
  } else if (head === 'find') {
    if (findMutatesStartPaths(words)) {
      for (const startPath of findStartPaths(words)) targets.add(startPath);
    }
    for (let i = 1; i < words.length; i++) {
      if (/^-(?:fprintf|fprint|fprint0|fls)$/.test(words[i]) && words[i + 1]) {
        targets.add(words[++i]);
      }
    }
  }

  if (head === 'git' || head === 'diff' || head === 'sort') {
    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      if ((word === '-o' || word === '--output') && words[i + 1]) targets.add(words[++i]);
      const attached = word.match(/^(?:--output=|-o)(.+)$/);
      if (attached?.[1]) targets.add(attached[1]);
    }
  }
  return [...targets];
}

export function extractWriteTargets(command) {
  return [
    ...new Set(
      collectCommandSegments(command).flatMap((segment) => extractSegmentWriteTargets(segment))
    ),
  ];
}

function gitCommand(words) {
  if (basename(words[0]) !== 'git') return null;
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (
      word === '-c' ||
      word === '-C' ||
      word === '--git-dir' ||
      word === '--work-tree' ||
      word === '--namespace' ||
      word === '--config-env'
    ) {
      i += 1;
      continue;
    }
    if (word.startsWith('-')) continue;
    return { subcommand: word, index: i };
  }
  return null;
}

function issueRefs(text) {
  const refs = [];
  const seen = new Set();
  for (const match of String(text || '').matchAll(ISSUE_REF_RE)) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      refs.push(match[1]);
    }
  }
  return refs;
}

function commitMessageRefs(words, commitIndex, readCommitMessageFile) {
  const messages = [];
  let unresolved = false;
  let resolved = false;
  const readFileSource = (file) => {
    if (file === '-') {
      unresolved = true;
    } else if (file && readCommitMessageFile) {
      try {
        messages.push(readCommitMessageFile(file));
        resolved = true;
      } catch {
        unresolved = true;
      }
    } else if (file) {
      unresolved = true;
    }
  };
  for (let i = commitIndex + 1; i < words.length; i++) {
    const word = words[i];
    if (word === '--message') {
      if (i + 1 < words.length) {
        messages.push(words[++i]);
        resolved = true;
      }
      continue;
    }
    if (word.startsWith('--message=')) {
      messages.push(word.slice('--message='.length));
      resolved = true;
      continue;
    }
    if (/^-[^-]+/.test(word)) {
      const cluster = word.slice(1);
      let consumed = false;
      for (let offset = 0; offset < cluster.length; offset++) {
        const option = cluster[offset];
        if (option === 'm') {
          const attached = cluster.slice(offset + 1);
          if (attached) {
            messages.push(attached);
            resolved = true;
          } else if (i + 1 < words.length) {
            messages.push(words[++i]);
            resolved = true;
          }
          consumed = true;
          break;
        }
        if (option === 't' || option === 'F' || option === 'C' || option === 'c') {
          const attached = cluster.slice(offset + 1);
          const argument = attached || words[++i];
          if (option === 'F') readFileSource(argument);
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
    }
    if (word === '--reuse-message' || word === '--reedit-message') {
      i += 1;
      continue;
    }
    if (word.startsWith('--reuse-message=') || word.startsWith('--reedit-message=')) {
      continue;
    }
    if (word === '--fixup' || word === '--squash' || word === '--template') {
      i += 1;
      continue;
    }
    if (
      word.startsWith('--fixup=') ||
      word.startsWith('--squash=') ||
      word.startsWith('--template=')
    ) {
      continue;
    }
    let file = null;
    if (word === '--file') file = words[++i];
    else if (word.startsWith('--file=')) file = word.slice('--file='.length);
    readFileSource(file);
  }
  if (words.slice(commitIndex + 1).includes('--no-edit')) {
    unresolved = true;
  }
  return { refs: [...new Set(messages.flatMap(issueRefs))], unresolved: unresolved || !resolved };
}

export function detectCommitCommands(command, { readCommitMessageFile } = {}) {
  const commits = [];
  for (const segment of collectCommandSegments(command)) {
    const words = unwrapCommandWords(shellWords(segment));
    const git = gitCommand(words);
    if (git?.subcommand !== 'commit') continue;
    const message = commitMessageRefs(words, git.index, readCommitMessageFile);
    commits.push({
      segment,
      refs: message.refs,
      messageSourceUnresolved: message.unresolved,
      isAmend: words.slice(git.index + 1).includes('--amend'),
    });
  }
  return {
    isCommit: commits.length > 0,
    isAmend: commits.some((commit) => commit.isAmend),
    commits,
  };
}

export function detectGhIssueCommands(command) {
  const commands = [];
  for (const segment of collectCommandSegments(command)) {
    const words = unwrapCommandWords(shellWords(segment));
    if (basename(words[0]) !== 'gh' || words[1] !== 'issue') continue;
    const verb = words[2];
    if (verb === 'edit' || verb === 'reopen') commands.push({ segment, verb });
  }
  return commands;
}

function normalizeTarget(target, projectRoot) {
  const raw = String(target || '');
  if (!raw) return '';
  if (!isAbsolute(raw)) return raw.replace(/^\.\//, '');
  const rel = relative(resolve(projectRoot), resolve(raw));
  if (!rel.startsWith('..') && !isAbsolute(rel)) return rel.split('\\').join('/');
  return raw;
}

function isScratchTarget(target) {
  return target === '.tmp' || target.startsWith('.tmp/');
}

function isSanctionedAitm(command, segments) {
  if (nestedCommandBodies(command).length > 0 || segments.length !== 1) return false;
  const words = unwrapCommandWords(shellWords(segments[0]));
  if (basename(words[0]) !== 'npx') return false;
  let index = 1;
  if (words[index] === '--yes') index += 1;
  return words[index] === 'aitm' || words[index] === 'ai-task-manager';
}

function isFindReadOnly(words) {
  // cspell:ignore execdir fprintf fprint okdir
  return !words.some((word) => /^(?:-delete|-exec.*|-ok.*|-fprintf|-fprint.*|-fls)$/.test(word));
}

function isReadOnly(segment, classifyActivity) {
  const words = unwrapCommandWords(shellWords(segment));
  if (words.length === 0) return true;
  const activity = classifyActivity?.(words.join(' '));
  if (activity === 'RUN_TESTS' || activity === 'RUN_BUILD') return true;

  const head = basename(words[0]);
  if (
    (head === 'sort' || head === 'diff') &&
    words.some(
      (word) =>
        word === '-o' ||
        word === '--output' ||
        word.startsWith('--output=') ||
        (head === 'sort' && /^-o.+/.test(word))
    )
  ) {
    return false;
  }
  if (READ_ONLY_BINS.has(head)) return true;
  if (head === 'command' && (words[1] === '-v' || words[1] === '-V')) return true;
  if (head === 'env' && words.length === 1) return true;
  if (head === 'node') {
    const preload = words.some(
      (word) => word === '-r' || word === '--require' || word.startsWith('--require=')
    );
    return words[1] === '--check' && !preload;
  }
  if (head === 'npm') {
    const safeScript = words[1] === 'run' && (words[2] === 'lint' || words[2] === 'format:check');
    const mutationFlag = words.some(
      (word) => word === '--fix' || word === '--write' || word.startsWith('--fix=')
    );
    return safeScript && !mutationFlag;
  }
  if (head === 'npx') {
    let index = 1;
    if (words[index] === '--yes') index += 1;
    const tool = words[index];
    const args = words.slice(index + 1);
    if (tool === 'eslint')
      return !args.some((word) => word === '--fix' || word.startsWith('--fix='));
    if (tool === 'prettier') return args.includes('--check') && !args.includes('--write');
    if (tool === 'cspell') return true;
    return false;
  }
  if (head === 'find') return isFindReadOnly(words);
  if (head === 'sed') return !isSedMutation(words);
  if (head === 'git') {
    const git = gitCommand(words);
    if (!git) return true;
    if (words.some((word) => word === '--output' || word.startsWith('--output='))) return false;
    if (READ_ONLY_GIT_SUBCOMMANDS.has(git.subcommand)) return true;
    const args = words.slice(git.index + 1);
    if (git.subcommand === 'branch') {
      return args.length === 0 || args.every((word) => word.startsWith('-'));
    }
    if (git.subcommand === 'remote') {
      return (
        args.length === 0 || args.every((word) => word.startsWith('-')) || args[0] === 'get-url'
      );
    }
    if (git.subcommand === 'tag') {
      return args.length === 0 || args.every((word) => word.startsWith('-'));
    }
    if (git.subcommand === 'config') {
      return args.some((word) =>
        ['--get', '--get-all', '--get-regexp', '--list', '-l', '--show-origin'].includes(word)
      );
    }
    if (git.subcommand === 'worktree') {
      return args.find((word) => !word.startsWith('-')) === 'list';
    }
    return false;
  }
  if (head === 'gh') {
    if (words[1] === 'api') {
      return !words.some(
        (word) =>
          /^-[FfX]/.test(word) ||
          word === '--field' ||
          word.startsWith('--field=') ||
          word === '--input' ||
          word.startsWith('--input=') ||
          word === '--method' ||
          word.startsWith('--method=')
      );
    }
    if (words[1] === 'auth' && words[2] === 'status') return true;
    return new Set([
      'issue list',
      'issue status',
      'issue view',
      'pr checks',
      'pr diff',
      'pr list',
      'pr status',
      'pr view',
      'repo list',
      'repo view',
      'run list',
      'run view',
      'workflow list',
      'workflow view',
    ]).has(`${words[1] || ''} ${words[2] || ''}`);
  }
  return false;
}

export function analyzeBashEffects(
  command,
  { projectRoot = process.cwd(), classifyActivity, readCommitMessageFile } = {}
) {
  const segments = collectCommandSegments(command);
  const commit = detectCommitCommands(command, { readCommitMessageFile });
  const writeTargets = segments
    .flatMap(extractWriteTargets)
    .map((target) => normalizeTarget(target, projectRoot))
    .filter(Boolean);
  const sourceTargets = writeTargets.filter((target) => !isScratchTarget(target));

  if (
    commit.commits.length === 0 &&
    sourceTargets.length === 0 &&
    isSanctionedAitm(command, segments)
  ) {
    return { segments, commits: [], writeTargets, sourceTargets, requiresSource: false };
  }

  let requiresSource = sourceTargets.length > 0;
  const commitSegments = new Set(commit.commits.map(({ segment }) => segment));
  for (const segment of segments) {
    if (commitSegments.has(segment) || isReadOnly(segment, classifyActivity)) continue;
    const segmentTargets = extractWriteTargets(segment)
      .map((target) => normalizeTarget(target, projectRoot))
      .filter(Boolean);
    if (segmentTargets.length > 0 && segmentTargets.every(isScratchTarget)) continue;
    requiresSource = true;
  }
  return {
    segments,
    commits: commit.commits,
    writeTargets,
    sourceTargets,
    requiresSource,
  };
}
