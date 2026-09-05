import { spawn, type ChildProcess, type ChildProcessByStdio } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { TextDecoder } from "node:util";

export interface CodexCompatibilityProfile {
  readonly cliVersion: string;
  readonly stableSchemaBundleSha256: string;
  readonly experimentalSchemaBundleSha256: string;
}

export const CODEX_COMPATIBILITY = Object.freeze({
  cliVersion: "0.153.4",
  stableSchemaBundleSha256: "d3eace08be5dca386bfd1f1e8df650058b4113f1e10870a284d775d75517576a",
  experimentalSchemaBundleSha256: "e5f798fd1343c539f01fedea0e8a84a43c080fcca4615c80eb04a5edab4f7d0a"
} as const satisfies CodexCompatibilityProfile);

export const PINNED_CODEX_CLI_VERSION = CODEX_COMPATIBILITY.cliVersion;
const MAX_OWNED_CODEX_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_OWNED_CODEX_TIMEOUT_MS = 15_000;
const MAX_OWNED_CODEX_TIMEOUT_MS = 60_000;
const MAX_CODEX_EXECUTABLE_BYTES = 512 * 1024 * 1024;

const MAX_ARGUMENT_BYTES = 16 * 1024;
const MAX_ARGUMENTS = 256;
const HASH_CHUNK_BYTES = 64 * 1024;
const PROCESS_GROUP_CONTAINMENT = "same-process-group-only" as const;
const verifiedProofs = new WeakSet<object>();

interface CodexExecutableIdentity {
  readonly device: number;
  readonly inode: number;
  readonly size: number;
  readonly mode: number;
  readonly uid: number;
  readonly gid: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
}

export interface VerifiedCodexExecutable {
  readonly executable: string;
  readonly version: typeof PINNED_CODEX_CLI_VERSION;
  readonly sha256: string;
  readonly identity: CodexExecutableIdentity;
  readonly containment: typeof PROCESS_GROUP_CONTAINMENT;
}

export interface OwnedCodexCommandOptions {
  readonly executable: VerifiedCodexExecutable;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly codexHome: string;
  readonly timeoutMs?: number;
  readonly maxStdoutBytes?: number;
  readonly maxStderrBytes?: number;
}

export interface OwnedCodexCommandResult {
  readonly stdout: Buffer;
}

export function isolatedCodexEnvironment(codexHome: string): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { CODEX_HOME: codexHome };
  const safePath = safeSearchPath();
  if (safePath !== undefined) result.PATH = safePath;
  for (const name of ["PATHEXT", "SystemRoot", "WINDIR", "COMSPEC", "LANG", "LC_ALL", "LC_CTYPE"]) {
    const value = process.env[name];
    if (value !== undefined) result[name] = value;
  }
  return result;
}

export function resolveCodexExecutable(): string {
  const searchPath = process.env.PATH;
  if (searchPath === undefined) throw new Error("codex executable unavailable");
  for (const entry of searchPath.split(path.delimiter)) {
    if (!path.isAbsolute(entry) || entry.includes("\0")) continue;
    try {
      validatePathEntry(entry);
      const candidate = path.join(entry, process.platform === "win32" ? "codex.exe" : "codex");
      const executable = fs.realpathSync(candidate);
      validateExecutable(executable);
      return executable;
    } catch {}
  }
  throw new Error("codex executable unavailable");
}

export async function resolvePinnedCodexExecutable(
  codexHome: string,
  timeoutMs = DEFAULT_OWNED_CODEX_TIMEOUT_MS
): Promise<VerifiedCodexExecutable> {
  try {
    if (!supportsOwnedProcessGroup(process.platform) || !isAbsolutePath(codexHome)) throw processBoundaryError();
    validateRuntimeDirectory(codexHome);
    const executable = createExecutableProof(resolveCodexExecutable());
    const result = await runOwnedCodexCommand({
      executable,
      args: ["--version"],
      cwd: codexHome,
      codexHome,
      timeoutMs
    });
    if (!isPinnedVersionOutput(result.stdout)) throw processBoundaryError();
    verifyExecutableIdentity(executable);
    return executable;
  } catch {
    throw processBoundaryError();
  }
}

export async function runOwnedCodexCommand(options: OwnedCodexCommandOptions): Promise<OwnedCodexCommandResult> {
  try {
    const timeoutMs = options.timeoutMs ?? DEFAULT_OWNED_CODEX_TIMEOUT_MS;
    const maxStdoutBytes = options.maxStdoutBytes ?? MAX_OWNED_CODEX_OUTPUT_BYTES;
    const maxStderrBytes = options.maxStderrBytes ?? MAX_OWNED_CODEX_OUTPUT_BYTES;
    validateCommandOptions(options, timeoutMs, maxStdoutBytes, maxStderrBytes);
    verifyExecutableIdentity(options.executable);

    const child = spawn(options.executable.executable, [...options.args], {
      cwd: options.cwd,
      detached: true,
      env: isolatedCodexEnvironment(options.codexHome),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    return await collectOwnedCommand(child, timeoutMs, maxStdoutBytes, maxStderrBytes);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "codex process boundary failure") throw error;
    throw processBoundaryError();
  }
}

export function revalidatePinnedCodexExecutable(executable: VerifiedCodexExecutable): void {
  try {
    verifyExecutableIdentity(executable);
  } catch {
    throw processBoundaryError();
  }
}

export function supportsOwnedProcessGroup(platform: NodeJS.Platform): boolean {
  return platform === "darwin" || platform === "linux";
}

export function supportsAuthenticatedAppServerPlatform(platform: NodeJS.Platform): platform is "darwin" | "linux" {
  return supportsOwnedProcessGroup(platform);
}

export function processGroupExists(pid: number): boolean {
  if (!supportsOwnedProcessGroup(process.platform) || !Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error: unknown) {
    return error !== null && typeof error === "object" && "code" in error && error.code === "EPERM";
  }
}

export async function waitForProcessGroupExit(pid: number, timeoutMs: number): Promise<boolean> {
  if (!supportsOwnedProcessGroup(process.platform) || !Number.isSafeInteger(pid) || pid <= 0) return true;
  const deadline = Date.now() + timeoutMs;
  while (processGroupExists(pid)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, Math.min(10, Math.max(1, deadline - Date.now()))));
  }
  return true;
}

export function signalOwnedProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (supportsOwnedProcessGroup(process.platform)) {
    if (pid === undefined) return;
    try { process.kill(-pid, signal); } catch {}
    return;
  }
  try {
    child.kill(signal);
  } catch {}
}

function validateCommandOptions(
  options: OwnedCodexCommandOptions,
  timeoutMs: number,
  maxStdoutBytes: number,
  maxStderrBytes: number
): void {
  if (!isPlainRecord(options) || !hasOnlyKeys(options, ["executable", "args", "cwd", "codexHome", "timeoutMs", "maxStdoutBytes", "maxStderrBytes"])) {
    throw processBoundaryError();
  }
  if (!isVerifiedCodexExecutable(options.executable)
    || !Array.isArray(options.args)
    || options.args.length > MAX_ARGUMENTS
    || options.args.some((value) => !isArgument(value))
    || !isAbsolutePath(options.cwd)
    || !isAbsolutePath(options.codexHome)
    || !isPositiveBoundedInteger(timeoutMs, MAX_OWNED_CODEX_TIMEOUT_MS)
    || !isPositiveBoundedInteger(maxStdoutBytes, MAX_OWNED_CODEX_OUTPUT_BYTES)
    || !isPositiveBoundedInteger(maxStderrBytes, MAX_OWNED_CODEX_OUTPUT_BYTES)) {
    throw processBoundaryError();
  }
}

function createExecutableProof(executable: string): VerifiedCodexExecutable {
  validateExecutable(executable);
  const fingerprint = fingerprintExecutable(executable);
  const proof: VerifiedCodexExecutable = Object.freeze({
    executable,
    version: PINNED_CODEX_CLI_VERSION,
    sha256: fingerprint.sha256,
    identity: Object.freeze(fingerprint.identity),
    containment: PROCESS_GROUP_CONTAINMENT
  });
  verifiedProofs.add(proof);
  return proof;
}

function verifyExecutableIdentity(executable: VerifiedCodexExecutable): void {
  if (!isVerifiedCodexExecutable(executable)) throw processBoundaryError();
  const canonical = fs.realpathSync(executable.executable);
  if (canonical !== executable.executable) throw processBoundaryError();
  validateExecutable(canonical);
  if (!sameIdentity(executableStat(canonical), executable.identity)) throw processBoundaryError();
}

function validateExecutable(executable: string): void {
  if (!isAbsolutePath(executable)) throw processBoundaryError();
  validatePathDirectories(executable, false);
  const stat = fs.lstatSync(executable);
  if (!stat.isFile() || stat.isSymbolicLink()) throw processBoundaryError();
  if (process.platform !== "win32" && ((stat.mode & 0o111) === 0 || (stat.mode & 0o022) !== 0)) throw processBoundaryError();
  validateOwnerAndMode(stat);
  if (!Number.isSafeInteger(stat.size) || stat.size <= 0 || stat.size > MAX_CODEX_EXECUTABLE_BYTES) throw processBoundaryError();
}

function validateRuntimeDirectory(directory: string): void {
  validatePathDirectories(directory, true);
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw processBoundaryError();
  validateOwnerAndMode(stat, false);
}

function validatePathEntry(entry: string): void {
  validatePathDirectories(entry, false);
  const stat = fs.lstatSync(entry);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw processBoundaryError();
  validateOwnerAndMode(stat, false);
}

function safeSearchPath(): string | undefined {
  const searchPath = process.env.PATH;
  if (searchPath === undefined) return undefined;
  const entries: string[] = [];
  for (const entry of searchPath.split(path.delimiter)) {
    if (!path.isAbsolute(entry) || entry.includes("\0")) continue;
    try {
      validatePathEntry(entry);
      entries.push(entry);
    } catch {}
  }
  return entries.length === 0 ? undefined : entries.join(path.delimiter);
}

function validatePathDirectories(target: string, allowRootOwnedStickyAncestor: boolean): void {
  let directory = path.dirname(target);
  for (;;) {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw processBoundaryError();
    validateOwnerAndMode(stat, allowRootOwnedStickyAncestor);
    const parent = path.dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

function validateOwnerAndMode(stat: fs.Stats, allowRootOwnedStickyDirectory = false): void {
  if (process.platform === "win32") return;
  const rootOwnedStickyDirectory = allowRootOwnedStickyDirectory
    && stat.isDirectory() && stat.uid === 0 && (stat.mode & 0o1000) !== 0;
  if ((stat.mode & 0o022) !== 0 && !rootOwnedStickyDirectory) throw processBoundaryError();
  if (process.getuid !== undefined && stat.uid !== 0 && stat.uid !== process.getuid()) throw processBoundaryError();
}

function fingerprintExecutable(executable: string): { readonly identity: CodexExecutableIdentity; readonly sha256: string } {
  const before = executableStat(executable);
  const hash = crypto.createHash("sha256");
  let fd: number | undefined;
  let total = 0;
  try {
    fd = fs.openSync(executable, "r");
    if (!sameIdentity(before, executableIdentity(fs.fstatSync(fd)))) throw processBoundaryError();
    const buffer = Buffer.allocUnsafe(HASH_CHUNK_BYTES);
    while (total <= MAX_CODEX_EXECUTABLE_BYTES) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, total);
      if (count === 0) break;
      total += count;
      if (total > MAX_CODEX_EXECUTABLE_BYTES) throw processBoundaryError();
      hash.update(buffer.subarray(0, count));
    }
    if (!sameIdentity(before, executableIdentity(fs.fstatSync(fd)))) throw processBoundaryError();
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  const after = executableStat(executable);
  if (!sameIdentity(before, after) || total !== before.size) throw processBoundaryError();
  return { identity: after, sha256: hash.digest("hex") };
}

function executableStat(executable: string): CodexExecutableIdentity {
  const stat = fs.lstatSync(executable);
  if (!stat.isFile() || stat.isSymbolicLink()) throw processBoundaryError();
  validateOwnerAndMode(stat);
  return executableIdentity(stat);
}

function executableIdentity(stat: fs.Stats): CodexExecutableIdentity {
  const values = [stat.dev, stat.ino, stat.size, stat.mode, stat.uid, stat.gid];
  if (values.some((value) => !Number.isSafeInteger(value))) throw processBoundaryError();
  if (![stat.mtimeMs, stat.ctimeMs].every((value) => Number.isFinite(value) && value >= 0)) throw processBoundaryError();
  return {
    device: stat.dev,
    inode: stat.ino,
    size: stat.size,
    mode: stat.mode,
    uid: stat.uid,
    gid: stat.gid,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs
  };
}

async function collectOwnedCommand(
  child: ChildProcessByStdio<null, Readable, Readable>,
  timeoutMs: number,
  maxStdoutBytes: number,
  maxStderrBytes: number
): Promise<OwnedCodexCommandResult> {
  const stdout: Buffer[] = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let closeSeen = false;
  let failure = false;
  let settling = false;
  let terminatePromise: Promise<void> | undefined;
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  let timer: NodeJS.Timeout | undefined;

  const terminate = (): Promise<void> => {
    if (terminatePromise !== undefined) return terminatePromise;
    terminatePromise = (async () => {
      signalOwnedProcessGroup(child, "SIGTERM");
      if (child.pid === undefined || await waitForProcessGroupExit(child.pid, timeoutMs)) return;
      signalOwnedProcessGroup(child, "SIGKILL");
      if (child.pid === undefined || await waitForProcessGroupExit(child.pid, timeoutMs)) return;
      throw processBoundaryError();
    })();
    return terminatePromise;
  };

  let settleResolve: (() => void) | undefined;
  let settleReject: ((error: Error) => void) | undefined;
  const settled = new Promise<void>((resolve, reject) => {
    settleResolve = resolve;
    settleReject = reject;
  });
  const settle = (): void => {
    if (settling) return;
    if (!closeSeen && !failure) return;
    settling = true;
    if (timer !== undefined) clearTimeout(timer);
    void (async () => {
      let cleanupFailed = false;
      try {
        await terminate();
      } catch {
        cleanupFailed = true;
      }
      child.stdout.destroy();
      child.stderr.destroy();
      if (failure || cleanupFailed || !closeSeen || exitCode !== 0 || exitSignal !== null) {
        settleReject?.(processBoundaryError());
      } else {
        settleResolve?.();
      }
    })();
  };

  child.stdout.on("data", (chunk: Buffer) => {
    if (failure || settling) return;
    stdoutBytes += chunk.length;
    if (stdoutBytes > maxStdoutBytes) {
      failure = true;
      settle();
      return;
    }
    stdout.push(Buffer.from(chunk));
  });
  child.stderr.on("data", (chunk: Buffer) => {
    if (failure || settling) return;
    stderrBytes += chunk.length;
    if (stderrBytes > maxStderrBytes) {
      failure = true;
      settle();
    }
  });
  child.once("error", () => {
    failure = true;
    settle();
  });
  child.once("close", (code, signal) => {
    closeSeen = true;
    exitCode = code;
    exitSignal = signal;
    if (code !== 0 || signal !== null) failure = true;
    settle();
  });
  timer = setTimeout(() => {
    failure = true;
    settle();
  }, timeoutMs);
  await settled;
  return { stdout: Buffer.concat(stdout, stdoutBytes) };
}

function isPinnedVersionOutput(stdout: Buffer): boolean {
  try {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(stdout);
    const withoutOneTrailingNewline = value.endsWith("\n") ? value.slice(0, -1).replace(/\r$/, "") : value;
    return withoutOneTrailingNewline === `codex-cli ${PINNED_CODEX_CLI_VERSION}`;
  } catch {
    return false;
  }
}

function sameIdentity(left: CodexExecutableIdentity, right: CodexExecutableIdentity): boolean {
  return left.device === right.device && left.inode === right.inode && left.size === right.size
    && left.mode === right.mode && left.uid === right.uid && left.gid === right.gid
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function isVerifiedCodexExecutable(value: unknown): value is VerifiedCodexExecutable {
  if (typeof value !== "object" || value === null || !verifiedProofs.has(value)) return false;
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["executable", "version", "sha256", "identity", "containment"])) return false;
  if (!isAbsolutePath(value.executable) || value.version !== PINNED_CODEX_CLI_VERSION
    || typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.sha256)
    || value.containment !== PROCESS_GROUP_CONTAINMENT || !isPlainRecord(value.identity)) return false;
  if (!hasOnlyKeys(value.identity, ["device", "inode", "size", "mode", "uid", "gid", "mtimeMs", "ctimeMs"])) return false;
  if (![value.identity.mtimeMs, value.identity.ctimeMs].every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry >= 0)) return false;
  return [value.identity.device, value.identity.inode, value.identity.size, value.identity.mode, value.identity.uid, value.identity.gid]
    .every((entry) => typeof entry === "number" && Number.isSafeInteger(entry) && entry >= 0);
}

function isArgument(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_ARGUMENT_BYTES && Buffer.byteLength(value, "utf8") <= MAX_ARGUMENT_BYTES && !value.includes("\0");
}

function isAbsolutePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ARGUMENT_BYTES
    && Buffer.byteLength(value, "utf8") <= MAX_ARGUMENT_BYTES && path.isAbsolute(value) && !value.includes("\0");
}

function isPositiveBoundedInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function processBoundaryError(): Error {
  return new Error("codex process boundary failure");
}
