// #1184 — Project issue bodies use line-level <details> containers to collapse
// Deep-Dive prose. Pickup Directive gates need a projection containing only
// root-level text, but inline Markdown examples such as `<details>` are prose,
// not container boundaries. Keep the recognizer deliberately line-anchored.

const DETAILS_OPEN_LINE_RE = /^\s*<details\b[^>]*>/i;
const DETAILS_CLOSE_LINE_RE = /^\s*<\/details\s*>/i;

/**
 * Mask line-level details containers while preserving line numbering.
 *
 * Positive depth at EOF intentionally masks the remainder of the body. An
 * unclosed real container must fail closed rather than expose headings that may
 * actually be nested inside it. Stray closing tags do not hide earlier text.
 */
export function maskDetailsBlocks(body = '') {
  let depth = 0;
  return String(body)
    .split('\n')
    .map((line) => {
      if (DETAILS_CLOSE_LINE_RE.test(line)) {
        if (depth > 0) depth -= 1;
        return '';
      }
      if (DETAILS_OPEN_LINE_RE.test(line)) {
        // Support a compact one-line container without leaking depth into the
        // following root content. Other container content remains opaque.
        if (!/<\/details\s*>/i.test(line)) depth += 1;
        return '';
      }
      return depth > 0 ? '' : line;
    })
    .join('\n');
}
