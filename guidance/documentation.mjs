// @story #1671

import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const SHIPPED_ROOT_FILES = new Set(['docs/README.md', 'docs/QUICKSTART.md', 'docs/DESIGN.md']);

function isShippedDocument(relativePath) {
  return (
    SHIPPED_ROOT_FILES.has(relativePath) ||
    /^docs\/(?:guides|introduction)\/[a-zA-Z0-9._/-]+\.md$/.test(relativePath)
  );
}

function headingSlug(heading) {
  return heading
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_ -]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

function anchorIndex(markdown) {
  const found = new Set();
  const seen = new Map();
  let fence = null;
  for (const line of markdown.split(/\r\n|\r|\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = { marker: marker[0], length: marker.length };
      else if (marker[0] === fence.marker && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    for (const match of line.matchAll(/<a\s+[^>]*\b(?:id|name)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
      found.add(match[1]);
    }
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!heading) continue;
    const base = headingSlug(heading[1]);
    const count = seen.get(base) ?? 0;
    found.add(count === 0 ? base : `${base}-${count}`);
    seen.set(base, count + 1);
  }
  return found;
}

function refuse(code) {
  return { ok: false, code };
}

export function resolveDocumentationReference(reference, { packageRoot } = {}) {
  if (!packageRoot || typeof packageRoot !== 'string') {
    throw new TypeError('documentation packageRoot is required');
  }
  const relativePath = reference?.path;
  if (
    typeof relativePath !== 'string' ||
    relativePath === '' ||
    relativePath.includes('\\') ||
    relativePath.includes('\0') ||
    path.posix.isAbsolute(relativePath) ||
    relativePath.split('/').some((part) => part === '..' || part === '.') ||
    !isShippedDocument(relativePath)
  ) {
    return refuse('documentation-path-invalid');
  }
  let root;
  let resolved;
  try {
    root = realpathSync(packageRoot);
    resolved = realpathSync(path.join(root, relativePath));
  } catch {
    return refuse('documentation-path-missing');
  }
  if (!resolved.startsWith(`${root}${path.sep}`) || !statSync(resolved).isFile()) {
    return refuse('documentation-path-escape');
  }
  const anchor = reference.anchor;
  if (anchor !== undefined && (typeof anchor !== 'string' || anchor.trim() === '')) {
    return refuse('documentation-anchor-invalid');
  }
  if (anchor && !anchorIndex(readFileSync(resolved, 'utf8')).has(anchor)) {
    return refuse('documentation-anchor-missing');
  }
  return { ok: true, path: relativePath, anchor: anchor ?? null };
}
