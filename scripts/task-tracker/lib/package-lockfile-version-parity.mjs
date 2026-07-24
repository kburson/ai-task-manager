// @story #853
// Regression guard for #853: package.json#version and package-lock.json's
// version (both the root "" package entry and the top-level key) must agree.
// They diverged silently at commit d0741ff, which reverted only package.json.

/**
 * @param {{version?: string}} pkg - parsed package.json
 * @param {{version?: string, packages?: Record<string, {version?: string}>}} lock - parsed package-lock.json
 * @returns {string[]} mismatch descriptions; empty when the versions agree
 */
export function findVersionParityMismatches(pkg, lock) {
  const mismatches = [];
  if (lock.version !== pkg.version) {
    mismatches.push(
      `package-lock.json version "${lock.version}" !== package.json version "${pkg.version}"`
    );
  }
  const rootPackageVersion = lock.packages?.['']?.version;
  if (rootPackageVersion !== pkg.version) {
    mismatches.push(
      `package-lock.json packages[""].version "${rootPackageVersion}" !== package.json version "${pkg.version}"`
    );
  }
  return mismatches;
}
