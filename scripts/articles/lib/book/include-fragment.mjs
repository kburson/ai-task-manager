import { lstat } from 'node:fs/promises';
import path from 'node:path';

import { MarkerError } from './markers.mjs';

const unsafe = (includePath, reason, file) =>
  new MarkerError(`unsafe book:include path "${includePath}": ${reason}`, file);

/**
 * Resolve one author-supplied include without following symlinks or leaving the
 * book's fragment directory. Callers may read only the returned path.
 */
export async function resolveIncludeFragment({ bookDir, includePath, file }) {
  if (typeof includePath !== 'string' || includePath.length === 0) {
    throw unsafe(String(includePath), 'expected a relative fragments/*.md path', file);
  }
  if (path.isAbsolute(includePath) || path.win32.isAbsolute(includePath)) {
    throw unsafe(includePath, 'absolute paths are not allowed', file);
  }
  if (includePath.includes('\\')) {
    throw unsafe(includePath, 'backslashes are not allowed', file);
  }

  const segments = includePath.split('/');
  if (
    path.posix.normalize(includePath) !== includePath ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw unsafe(includePath, 'path must be normalized without dot segments', file);
  }
  if (segments[0] !== 'fragments' || segments.length < 2) {
    throw unsafe(includePath, 'path must be beneath fragments/', file);
  }
  if (path.posix.extname(includePath) !== '.md') {
    throw unsafe(includePath, 'fragment must use the .md extension', file);
  }

  let target = bookDir;
  for (const [index, segment] of segments.entries()) {
    target = path.join(target, segment);
    let stats;
    try {
      stats = await lstat(target);
    } catch {
      throw new MarkerError(`book:include cannot read ${includePath}`, file);
    }
    if (stats.isSymbolicLink()) {
      throw unsafe(includePath, 'symlinks are not allowed', file);
    }
    if (index < segments.length - 1 && !stats.isDirectory()) {
      throw unsafe(includePath, 'path components must be directories', file);
    }
    if (index === segments.length - 1 && !stats.isFile()) {
      throw new MarkerError(`book:include target is not a regular file: ${includePath}`, file);
    }
  }

  return target;
}
