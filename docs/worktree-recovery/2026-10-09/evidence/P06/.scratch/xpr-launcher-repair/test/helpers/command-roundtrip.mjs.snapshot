import { execFileSync } from 'node:child_process';

export function executeJoinCommand(command) {
  if (process.platform === 'win32') {
    const script = [
      'function peer-review {',
      '  param($verb, $invitation)',
      "  if ($verb -ne 'join' -or $args.Count -ne 0) { exit 71 }",
      '  [Console]::Out.Write($invitation)',
      '}',
      command,
    ].join('\n');
    return execFileSync(
      'pwsh.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8' }
    );
  }
  return execFileSync(
    '/bin/sh',
    ['-c', `set -- ${command}; [ "$#" -eq 3 ] || exit 71; printf '%s' "$3"`],
    { encoding: 'utf8' }
  );
}
