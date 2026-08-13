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

function headerPreambleLength(lines) {
  if (isShebang(lines[0])) return isCspellPreamble(lines[1]) ? 2 : 1;
  return isCspellPreamble(lines[0]) ? 1 : 0;
}

export function hasPermittedStoryTag(content) {
  const lines = String(content).split('\n');
  if (lines.slice(1).some(isShebang)) return false;
  if (STORY_TAG_LINE_RE.test(lines[0])) return true;
  const tagIndex = headerPreambleLength(lines);
  return tagIndex > 0 && STORY_TAG_LINE_RE.test(lines[tagIndex]);
}

export function moveMalformedStoryTag(content) {
  const lines = String(content).split('\n');
  if (hasPermittedStoryTag(content)) return null;

  const shebangIndex = lines.findIndex(isShebang);
  if (shebangIndex > 0) {
    const [shebang] = lines.splice(shebangIndex, 1);
    lines.unshift(shebang);
  }

  const tagIndex = lines.findIndex((line) => STORY_TAG_LINE_RE.test(line));
  if (tagIndex === -1) return null;

  const [storyLine] = lines.splice(tagIndex, 1);
  lines.splice(headerPreambleLength(lines), 0, storyLine);
  const normalized = lines.join('\n');
  return normalized === content ? null : normalized;
}
