// @story #876

const STORY_TAG_LINE_RE = /^\/\/ @story #\d/;
const SHEBANG_RE = /^#!/;
const CSPELL_PREAMBLE_RE = /^\/\/ cspell:ignore(?: .+)?$/;

function headerPreambleLength(lines) {
  if (SHEBANG_RE.test(lines[0])) return CSPELL_PREAMBLE_RE.test(lines[1]) ? 2 : 1;
  return CSPELL_PREAMBLE_RE.test(lines[0]) ? 1 : 0;
}

export function hasPermittedStoryTag(content) {
  const lines = String(content).split('\n');
  if (STORY_TAG_LINE_RE.test(lines[0]) && !SHEBANG_RE.test(lines[1])) return true;
  const tagIndex = headerPreambleLength(lines);
  return tagIndex > 0 && STORY_TAG_LINE_RE.test(lines[tagIndex]);
}

export function moveMalformedStoryTag(content) {
  const lines = String(content).split('\n');
  if (hasPermittedStoryTag(content)) return null;

  const tagIndex = lines.findIndex((line) => STORY_TAG_LINE_RE.test(line));
  if (tagIndex === -1) return null;

  const [storyLine] = lines.splice(tagIndex, 1);
  lines.splice(headerPreambleLength(lines), 0, storyLine);
  return lines.join('\n');
}
