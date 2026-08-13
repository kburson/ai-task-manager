// @story #876

const STORY_TAG_LINE_RE = /^\/\/ @story #\d/;
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

function headerShebangIndex(lines) {
  if (isShebang(lines[0])) return 0;
  if (isStoryTag(lines[0])) return isShebang(lines[1]) ? 1 : -1;
  if (!isCspellPreamble(lines[0])) return -1;
  if (isShebang(lines[1])) return 1;
  return isStoryTag(lines[1]) && isShebang(lines[2]) ? 2 : -1;
}

function headerPreambleLength(lines) {
  if (isShebang(lines[0])) return isCspellPreamble(lines[1]) ? 2 : 1;
  return isCspellPreamble(lines[0]) ? 1 : 0;
}

function headerStoryTagIndex(lines) {
  const tagIndex = headerPreambleLength(lines);
  return isStoryTag(lines[tagIndex]) ? tagIndex : -1;
}

export function hasPermittedStoryTag(content) {
  const lines = String(content).split('\n');
  if (headerShebangIndex(lines) > 0) return false;
  return headerStoryTagIndex(lines) !== -1;
}

export function moveMalformedStoryTag(content) {
  const lines = String(content).split('\n');
  if (hasPermittedStoryTag(content)) return null;

  const shebangIndex = headerShebangIndex(lines);
  if (shebangIndex > 0) {
    const [shebang] = lines.splice(shebangIndex, 1);
    lines.unshift(shebang);
  }

  const tagIndex = headerStoryTagIndex(lines);
  if (tagIndex === -1) return null;

  const [storyLine] = lines.splice(tagIndex, 1);
  lines.splice(headerPreambleLength(lines), 0, storyLine);
  const normalized = lines.join('\n');
  return normalized === content ? null : normalized;
}
