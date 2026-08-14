// @story #876

const STORY_TAG_LINE_RE = /^\/\/ @story #\d+(?:\s|$)/;
const SHEBANG_RE = /^#!/;
const CSPELL_PREAMBLE_RE = /^\/\/ cspell:ignore(?: .+)?$/;

function normalizedLine(line) {
  return String(line).replace(/\r$/, '');
}

function isShebang(line) {
  return SHEBANG_RE.test(normalizedLine(line));
}

function isCspellPreamble(line) {
  return CSPELL_PREAMBLE_RE.test(normalizedLine(line));
}

function isStoryTag(line) {
  return STORY_TAG_LINE_RE.test(normalizedLine(line));
}

export function hasPermittedStoryTag(content) {
  const lines = String(content).split('\n');
  if (isStoryTag(lines[0])) {
    for (let index = 1; index < lines.length; index += 1) {
      if (isShebang(lines[index])) return false;
      if (!isCspellPreamble(lines[index])) break;
    }
    return true;
  }
  return isShebang(lines[0]) && isStoryTag(lines[1]);
}

export function moveMalformedStoryTag(content) {
  const lines = String(content).split('\n');
  if (hasPermittedStoryTag(content)) return null;

  const header = [];
  while (
    header.length < lines.length &&
    (isShebang(lines[header.length]) ||
      isStoryTag(lines[header.length]) ||
      isCspellPreamble(lines[header.length]))
  ) {
    header.push(lines[header.length]);
  }

  const storyLines = header.filter(isStoryTag);
  const shebangLines = header.filter(isShebang);
  if (storyLines.length !== 1 || shebangLines.length > 1) return null;

  const cspellLines = header.filter(isCspellPreamble);
  const reordered = [...shebangLines, storyLines[0], ...cspellLines, ...lines.slice(header.length)];
  const normalized = reordered.join('\n');
  return normalized === content ? null : normalized;
}
