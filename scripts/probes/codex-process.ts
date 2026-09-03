import type { ChildProcess } from "node:child_process";

export function isolatedCodexEnvironment(codexHome: string): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { CODEX_HOME: codexHome };
  for (const name of ["PATH", "PATHEXT", "SystemRoot", "WINDIR", "COMSPEC", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE"]) {
    const value = process.env[name];
    if (value !== undefined) result[name] = value;
  }
  return result;
}

export function supportsIsolatedProcessTree(platform: NodeJS.Platform): boolean {
  return platform !== "win32";
}

export function signalIsolatedProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (supportsIsolatedProcessTree(process.platform) && pid !== undefined) {
    try {
      process.kill(-pid, signal);
      return;
    } catch {}
  }
  child.kill(signal);
}
