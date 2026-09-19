const VERIFICATION_LABEL_RE = /^\s*\*\*Verification Commands:\*\*\s*$/i;

export function openingFenceFor(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { character: match[1][0], length: match[1].length };
}

export function isClosingFence(line, fence) {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return Boolean(match && match[1][0] === fence.character && match[1].length >= fence.length);
}

function stripLineMarkdown(line, lines, lineIndex, state) {
  let visible = '';
  let structural = '';
  let index = 0;
  while (index < line.length) {
    if (state.inComment) {
      const end = line.indexOf('-->', index);
      const stop = end === -1 ? line.length : end + 3;
      visible += ' '.repeat(stop - index);
      structural += ' '.repeat(stop - index);
      index = stop;
      if (end !== -1) state.inComment = false;
      continue;
    }
    const ticks = /^`+/.exec(line.slice(index));
    if (ticks) {
      const length = ticks[0].length;
      let backslashes = 0;
      for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) {
        backslashes += 1;
      }
      const escaped = backslashes % 2 === 1;
      if (state.inlineTicks === 0) {
        if (!escaped && hasClosingBacktickRun(lines, lineIndex, index + length, length)) {
          state.inlineTicks = length;
          structural += ' '.repeat(length);
        } else {
          structural += ticks[0];
        }
      } else {
        structural += ' '.repeat(length);
        if (length === state.inlineTicks) state.inlineTicks = 0;
      }
      visible += ticks[0];
      index += length;
      continue;
    }
    if (state.inlineTicks === 0 && line.startsWith('<!--', index)) {
      state.inComment = true;
      visible += '    ';
      structural += '    ';
      index += 4;
      continue;
    }
    visible += line[index];
    structural += state.inlineTicks === 0 ? line[index] : ' ';
    index += 1;
  }
  return { visible, structural };
}

function hasClosingBacktickRun(lines, lineIndex, start, expectedLength) {
  for (let currentLine = lineIndex; currentLine < lines.length; currentLine += 1) {
    const line = lines[currentLine];
    if (currentLine > lineIndex && interruptsInlineBlock(line)) return false;
    let index = currentLine === lineIndex ? start : 0;
    while (index < line.length) {
      if (line[index] !== '`') {
        index += 1;
        continue;
      }
      let end = index + 1;
      while (end < line.length && line[end] === '`') end += 1;
      if (end - index === expectedLength) return true;
      index = end;
    }
  }
  return false;
}

function interruptsInlineBlock(line) {
  return (
    /^\s*$/.test(line) ||
    /^ {0,3}(?:#{1,6}(?:[ \t]+|$)|>|`{3,}|~{3,}|<!--|(?:[*+-]|\d{1,9}[.)])(?:[ \t]+|$))/.test(line)
  );
}

export function markdownViews(value) {
  const lines = String(value).split('\n');
  const state = {
    inComment: false,
    fence: null,
    inlineTicks: 0,
    verificationFenceEligible: false,
  };
  const structuralLines = [];
  const commandLines = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (state.fence) {
      const verificationFence = state.fence.verification;
      if (isClosingFence(line, state.fence)) {
        state.fence = null;
      }
      structuralLines.push('');
      commandLines.push(verificationFence ? line : '');
      continue;
    }
    const inlineTicksAtStart = state.inlineTicks;
    const { visible, structural } = stripLineMarkdown(line, lines, lineIndex, state);
    const openingFence = !state.inComment && openingFenceFor(visible);
    let verificationFence = false;
    if (inlineTicksAtStart === 0 && openingFence) {
      verificationFence = state.verificationFenceEligible;
      state.fence = {
        ...openingFence,
        verification: verificationFence,
      };
      state.inlineTicks = 0;
      state.verificationFenceEligible = false;
    } else if (visible.trim()) {
      state.verificationFenceEligible = VERIFICATION_LABEL_RE.test(structural);
    }
    structuralLines.push(openingFence && inlineTicksAtStart === 0 ? '' : structural);
    const insideMultilineSpan = inlineTicksAtStart !== 0 || state.inlineTicks !== 0;
    commandLines.push(
      openingFence && inlineTicksAtStart === 0
        ? verificationFence
          ? visible
          : ''
        : insideMultilineSpan
          ? ''
          : visible
    );
  }
  return { originalLines: lines, structuralLines, commandLines };
}
