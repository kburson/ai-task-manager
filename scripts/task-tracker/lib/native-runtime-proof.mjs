// @story #2088
// @story #2106
// Pure diagnostic request/comparison helpers; no authority or transport effects.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function runtimeProofNonce(command) {
  if (typeof command !== 'string') return null;
  const match = command.match(
    /^(?:env AITM_GRAPHQL_USAGE=1 TT_FULL_AUTO=1 )?(?:npx aitm|node_modules\/@kburson\/ai-task-manager\/bin\/aitm\.mjs) doctor --json --runtime-proof ([a-f0-9]{32,64})$/
  );
  return match?.[0] === command ? match[1] : null;
}

function observedHelper(runtime) {
  if (runtime?.schema !== 'aitm.runtime-observation/v1') return null;
  const helper = runtime.helperModule,
    file = helper?.file;
  if (
    helper?.evidence !== 'actual-helper-module-only' ||
    typeof helper.url !== 'string' ||
    file?.status !== 'present' ||
    file.kind !== 'file' ||
    typeof file.resolvedPath !== 'string' ||
    !path.isAbsolute(file.resolvedPath) ||
    path.resolve(file.resolvedPath) !== file.resolvedPath ||
    typeof file.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(file.sha256)
  )
    return null;
  try {
    const url = new URL(helper.url);
    if (
      url.protocol !== 'file:' ||
      url.href !== helper.url ||
      url.search ||
      url.hash ||
      fileURLToPath(url) !== file.resolvedPath
    )
      return null;
  } catch {
    return null;
  }
  return { url: helper.url, sha256: file.sha256 };
}

export function compareObservedHelpers(hookRuntime, cliRuntime) {
  const hook = observedHelper(hookRuntime),
    cli = observedHelper(cliRuntime);
  const reasons = [];
  if (!hook || !cli) reasons.push('helper-observation-unavailable-or-unsupported');
  else {
    if (hook.url !== cli.url) reasons.push('helper-module-url-differs');
    if (hook.sha256 !== cli.sha256) reasons.push('helper-bytes-differ');
  }
  return {
    sameObservedHelper: reasons.length === 0,
    scope: 'observed-helper-only-not-whole-runtime',
    reasons,
  };
}
