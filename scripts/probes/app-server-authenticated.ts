import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  openAppServerStdioClient,
  probeIsolatedAppServerLifecycle,
  type AppServerStdioClient,
  type AppServerStdioClientOptions
} from "./app-server-stdio.js";
import {
  PINNED_CODEX_CLI_VERSION,
  resolveCodexExecutable,
  resolvePinnedCodexExecutable,
  revalidatePinnedCodexExecutable,
  supportsAuthenticatedAppServerPlatform
} from "./codex-process.js";
import { readCodexSystemSkillsDigest, type CodexSystemSkillsDigest } from "./codex-home.js";

const MAX_FIELD_BYTES = 16 * 1024;
const MAX_EVENTS = 64;
const MAX_CODEX_HOME_ENTRIES = 1024;
const MAX_AUTH_FILE_BYTES = 1024 * 1024;
const MAX_CODEX_LOGIN_LOG_BYTES = 64 * 1024;
const MAX_INSTALLATION_ID_BYTES = 64 * 1024;
const MAX_DATABASE_FILE_BYTES = 64 * 1024 * 1024;
const MAX_MODELS_CACHE_BYTES = 4 * 1024 * 1024;
const MAX_SANDBOX_MIGRATION_BYTES = 64;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_REQUEST_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 1_000;
const MAX_SHUTDOWN_TIMEOUT_MS = 10_000;
const CHALLENGE = "GCR_AUTH_PROBE_CHALLENGE";
const RESULT = "GCR_AUTH_PROBE_OK";
const PROMPT = "Call gcr_probe_echo exactly once using the required challenge.";
const CODEX_HOME_MARKER = ".grok-codex-router-home";
const CODEX_HOME_MARKER_CONTENT = "GCR_CODEX_HOME_V1\n";
const CODEX_AUTH_FILE = "auth.json";
const CODEX_RUNTIME_DIRECTORIES = new Set(["skills"]);
const CODEX_DATABASE_FILE = /^(?:goals|logs|memories|queue|state)_[0-9]+\.sqlite(?:-(?:shm|wal))?$/;
const CODEX_LOG_DIRECTORY = "log";
const CODEX_LOG_FILE = "codex-login.log";
const CODEX_TMP_DIRECTORY = "tmp";
const CODEX_ARG0_DIRECTORY = "arg0";
const CODEX_ARG0_ENTRY = /^codex-arg0[A-Za-z0-9]{6}$/;
const CODEX_ARG0_HELPERS = new Set(["applypatch", "apply_patch", "codex-execve-wrapper"]);
const MAX_CODEX_ARG0_ENTRIES = 16;

const PROBE_TOOL = {
  name: "gcr_probe_echo",
  description: "returns a fixed probe value",
  inputSchema: {
    additionalProperties: false,
    properties: {
      challenge: { const: CHALLENGE, type: "string" }
    },
    required: ["challenge"],
    type: "object"
  }
} as const;

export interface AuthenticatedProbeOptions {
  readonly clientVersion: string;
  readonly codexHome: string;
  readonly expectedModel: string;
  readonly requestTimeoutMs?: number;
  readonly shutdownTimeoutMs?: number;
}

export interface AuthenticatedProbeReceipt {
  readonly candidate: "app-server-dynamic";
  readonly codexCliVersion: typeof PINNED_CODEX_CLI_VERSION;
  readonly codexCliSha256: string;
  readonly executableProvenance: "unverified";
  readonly authenticationOwner: "codex";
  readonly authenticationStatus: "signed-in";
  readonly configurationIsolation: "dedicated-codex-home";
  readonly homeStateProvenance: "current-user-owned-allowlist";
  readonly credentialHandling: "codex-owned";
  readonly credentialStore: "effective-file";
  readonly signedOutPreflight: "passed";
  readonly mcpIsolation: "disabled-before-turn";
  readonly hookIsolation: "configured-and-quiet";
  readonly dynamicToolRoundTrip: "passed";
  readonly requestCallIdentity: "preserved";
  readonly toolExecutionOwner: "probe-harness";
  readonly forbiddenActivity: "none-observed";
  readonly processGroup: "closed";
  readonly processContainment: "same-process-group-only";
  readonly startupIsolation: "observed-after-start";
  readonly workspaceCleanup: "removed";
  readonly nativeGrokExecution: "not-run";
  readonly releaseEligibility: "blocked";
}

export async function probeAuthenticatedAppServer(options: AuthenticatedProbeOptions): Promise<AuthenticatedProbeReceipt> {
  if (!supportsAuthenticatedAppServerPlatform(process.platform)) throw probeError();
  validateOptions(options);
  const pathExecutable = resolveCodexExecutableOrFail();
  validateDedicatedCodexHome(options.codexHome, pathExecutable);
  const root = createProbeRoot();
  const workspace = path.join(root, "workspace");
  let client: AppServerStdioClient | undefined;
  let codexCliSha256: string | undefined;
  let expectedSystemSkillsDigest: CodexSystemSkillsDigest | undefined;
  let signedOutSkillsObserved = false;
  let failure = false;
  try {
    fs.mkdirSync(workspace, { mode: 0o700 });
    const codex = await resolvePinnedCodexExecutable(options.codexHome, Math.min(
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      60_000
    ));
    codexCliSha256 = codex.sha256;
    validateDedicatedCodexHome(options.codexHome, codex.executable);
    revalidatePinnedCodexExecutable(codex);
    const signedOutPreflight = await probeIsolatedAppServerLifecycle({
      clientVersion: options.clientVersion,
      expectedCliVersion: PINNED_CODEX_CLI_VERSION,
      expectedModel: options.expectedModel,
      tools: [PROBE_TOOL],
      ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
      ...(options.shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs: options.shutdownTimeoutMs })
    });
    if (signedOutPreflight.codexCliSha256 !== codex.sha256) throw probeError();
    expectedSystemSkillsDigest = signedOutPreflight.systemSkillsDigest;
    signedOutSkillsObserved = true;
    assertSystemSkillsDigest(options.codexHome, signedOutPreflight.systemSkillsDigest, false);
    const clientOptions: AppServerStdioClientOptions = {
      codexHome: options.codexHome,
      executable: codex,
      cwd: workspace,
      clientVersion: options.clientVersion,
      expectedCliVersion: PINNED_CODEX_CLI_VERSION,
      expectedModel: options.expectedModel,
      tools: [PROBE_TOOL],
      ...(options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs }),
      ...(options.shutdownTimeoutMs === undefined ? {} : { shutdownTimeoutMs: options.shutdownTimeoutMs })
    };
    revalidatePinnedCodexExecutable(codex);
    client = openAppServerStdioClient(clientOptions);
    await client.initialize();
    assertSystemSkillsDigest(options.codexHome, signedOutPreflight.systemSkillsDigest, true);
    await client.verifyFileCredentialStore();
    if (await client.readAccount() !== "signed-in") throw probeError();
    await client.listModels();
    await client.listMcpServers();
    await client.listHooks();
    await client.startThread();
    await client.verifyThreadIsolation();
    await client.auditUntilIdle(100);
    assertSystemSkillsDigest(options.codexHome, signedOutPreflight.systemSkillsDigest, true);
    await client.startTurn(PROMPT);

    let handoffs = 0;
    let results = 0;
    let completed = false;
    for (let eventCount = 0; eventCount < MAX_EVENTS && !completed; eventCount += 1) {
      const event = await client.next();
      if (event.kind === "rejected") throw probeError();
      if (event.kind === "tool-handoff") {
        handoffs += 1;
        if (handoffs !== 1 || event.tool !== PROBE_TOOL.name || !isExactChallenge(event.arguments)) {
          throw probeError();
        }
        const result = await client.respondToDynamicTool(event, {
          success: true,
          contentItems: [{ type: "inputText", text: RESULT }]
        });
        if (result.callId !== event.callId) throw probeError();
        results += 1;
      }
      if (event.kind === "events") {
        if (event.events.some((value) => value.kind === "failure" || value.kind === "cancellation")) throw probeError();
        if (event.events.some((value) => value.kind === "completed")) {
          if (event.events.length !== 1 || event.events[0]?.kind !== "completed") throw probeError();
          completed = true;
        }
      }
    }
    if (!completed || handoffs !== 1 || results !== 1) throw probeError();
    await client.auditUntilIdle(100);
  } catch {
    failure = true;
  } finally {
    if (client !== undefined) {
      try {
        await client.close();
      } catch {
        failure = true;
      }
    }
    try {
      if (codexCliSha256 !== undefined) {
        const closingExecutable = await resolvePinnedCodexExecutable(options.codexHome, Math.min(
          options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
          60_000
        ));
        if (closingExecutable.sha256 !== codexCliSha256) throw probeError();
      }
    } catch {
      failure = true;
    }
    try {
      validateDedicatedCodexHome(options.codexHome, pathExecutable);
      if (signedOutSkillsObserved) {
        if (expectedSystemSkillsDigest === undefined) throw probeError();
        assertSystemSkillsDigest(options.codexHome, expectedSystemSkillsDigest, true);
      }
    } catch {
      failure = true;
    }
    try {
      fs.rmSync(root, { recursive: true, force: true });
      if (fs.existsSync(root)) failure = true;
    } catch {
      failure = true;
    }
  }
  if (failure || codexCliSha256 === undefined) throw probeError();
  return {
    candidate: "app-server-dynamic",
    codexCliVersion: PINNED_CODEX_CLI_VERSION,
    codexCliSha256,
    executableProvenance: "unverified",
    authenticationOwner: "codex",
    authenticationStatus: "signed-in",
    configurationIsolation: "dedicated-codex-home",
    homeStateProvenance: "current-user-owned-allowlist",
    credentialHandling: "codex-owned",
    credentialStore: "effective-file",
    signedOutPreflight: "passed",
    mcpIsolation: "disabled-before-turn",
    hookIsolation: "configured-and-quiet",
    dynamicToolRoundTrip: "passed",
    requestCallIdentity: "preserved",
    toolExecutionOwner: "probe-harness",
    forbiddenActivity: "none-observed",
    processGroup: "closed",
    processContainment: "same-process-group-only",
    startupIsolation: "observed-after-start",
    workspaceCleanup: "removed",
    nativeGrokExecution: "not-run",
    releaseEligibility: "blocked"
  };
}

function validateOptions(options: AuthenticatedProbeOptions): void {
  try {
    if (!isPlainRecord(options)
      || !hasOnlyKeys(options, ["clientVersion", "codexHome", "expectedModel", "requestTimeoutMs", "shutdownTimeoutMs"])
      || !isBoundedNonEmptyString(options.clientVersion)
      || !isBoundedNonEmptyString(options.codexHome) || !path.isAbsolute(options.codexHome)
      || !isBoundedNonEmptyString(options.expectedModel)
      || (options.requestTimeoutMs !== undefined && (!isPositiveInteger(options.requestTimeoutMs) || options.requestTimeoutMs > MAX_REQUEST_TIMEOUT_MS))
      || (options.shutdownTimeoutMs !== undefined && (!isPositiveInteger(options.shutdownTimeoutMs) || options.shutdownTimeoutMs > MAX_SHUTDOWN_TIMEOUT_MS))) {
      throw probeError();
    }
  } catch {
    throw probeError();
  }
}

export function validateDedicatedCodexHome(codexHome: string, trustedExecutable?: string): void {
  try {
    const stat = fs.lstatSync(codexHome);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw probeError();
    if (fs.realpathSync(codexHome) !== path.resolve(codexHome)) throw probeError();
    if (process.getuid !== undefined && stat.uid !== process.getuid()) throw probeError();
    if ((stat.mode & 0o777) !== 0o700) throw probeError();
    const marker = path.join(codexHome, CODEX_HOME_MARKER);
    const markerStat = fs.lstatSync(marker);
    if (!isPrivateOwnedFile(markerStat) || markerStat.nlink !== 1
      || markerStat.size !== Buffer.byteLength(CODEX_HOME_MARKER_CONTENT, "utf8")
      || fs.readFileSync(marker, "utf8") !== CODEX_HOME_MARKER_CONTENT) throw probeError();
    const authFile = path.join(codexHome, CODEX_AUTH_FILE);
    const authStat = fs.lstatSync(authFile);
    if (!isPrivateOwnedFile(authStat) || authStat.nlink !== 1 || authStat.size <= 0 || authStat.size > MAX_AUTH_FILE_BYTES) throw probeError();
    const executable = trustedExecutable ?? resolveCodexExecutableOrFail();
    if (!isBoundedNonEmptyString(executable) || !path.isAbsolute(executable) || fs.realpathSync(executable) !== executable) throw probeError();
    const directory = fs.opendirSync(codexHome);
    try {
      for (let count = 0; ; count += 1) {
        const entry = directory.readSync();
        if (entry === null) break;
        if (count >= MAX_CODEX_HOME_ENTRIES) throw probeError();
        validateCodexHomeEntry(codexHome, entry.name, executable);
      }
    } finally {
      directory.closeSync();
    }
  } catch {
    throw probeError();
  }
}

function validateCodexHomeEntry(codexHome: string, name: string, trustedExecutable: string): void {
  if (name === CODEX_HOME_MARKER || name === CODEX_AUTH_FILE) return;
  const target = path.join(codexHome, name);
  const stat = fs.lstatSync(target);
  if (name === "installation_id") {
    if (!isOwnedRuntimeFile(stat) || stat.size <= 0 || stat.size > MAX_INSTALLATION_ID_BYTES) throw probeError();
    return;
  }
  if (name === ".sandbox_migration") {
    if (!isOwnedRuntimeFile(stat) || stat.size <= 0 || stat.size > MAX_SANDBOX_MIGRATION_BYTES) throw probeError();
    return;
  }
  if (name === "models_cache.json") {
    if (!isOwnedRuntimeFile(stat) || stat.size <= 0 || stat.size > MAX_MODELS_CACHE_BYTES) throw probeError();
    return;
  }
  if (CODEX_DATABASE_FILE.test(name)) {
    if (!isOwnedRuntimeFile(stat) || stat.size > MAX_DATABASE_FILE_BYTES) throw probeError();
    return;
  }
  if (CODEX_RUNTIME_DIRECTORIES.has(name)) {
    readCodexSystemSkillsDigest(codexHome);
    return;
  }
  if (name === CODEX_LOG_DIRECTORY) {
    validateObservedDirectory(target, stat, 0o755);
    validateCodexLogDirectory(target);
    return;
  }
  if (name === CODEX_TMP_DIRECTORY) {
    validateObservedDirectory(target, stat, 0o755);
    validateCodexTmpDirectory(target, trustedExecutable);
    return;
  }
  throw probeError();
}

function validateObservedDirectory(target: string, stat: fs.Stats, mode: number): void {
  if (!stat.isDirectory() || stat.isSymbolicLink() || !isCurrentOwner(stat)) throw probeError();
  if (process.platform !== "win32" && (stat.mode & 0o777) !== mode) throw probeError();
}

function validateCodexLogDirectory(target: string): void {
  const entries = readDirectoryNames(target);
  if (entries.length !== 1 || entries[0] !== CODEX_LOG_FILE) throw probeError();
  const stat = fs.lstatSync(path.join(target, CODEX_LOG_FILE));
  if (!isPrivateOwnedFile(stat) || stat.nlink !== 1 || stat.size <= 0 || stat.size > MAX_CODEX_LOGIN_LOG_BYTES) throw probeError();
}

function validateCodexTmpDirectory(target: string, trustedExecutable: string): void {
  const arg0 = path.join(target, CODEX_ARG0_DIRECTORY);
  const arg0Stat = fs.lstatSync(arg0);
  validateObservedDirectory(arg0, arg0Stat, 0o700);
  const entries = readDirectoryNames(arg0);
  if (entries.length === 0) return;
  const helpers = entries.filter((entry) => CODEX_ARG0_ENTRY.test(entry));
  if (helpers.length === 0 || helpers.length > MAX_CODEX_ARG0_ENTRIES || entries.length !== helpers.length) throw probeError();
  for (const helper of helpers) validateCodexArg0Directory(path.join(arg0, helper), trustedExecutable);
}

function validateCodexArg0Directory(target: string, trustedExecutable: string): void {
  const stat = fs.lstatSync(target);
  validateObservedDirectory(target, stat, 0o755);
  const entries = readDirectoryNames(target);
  if (entries.length !== CODEX_ARG0_HELPERS.size + 1 || !entries.includes(".lock")) throw probeError();
  const lock = fs.lstatSync(path.join(target, ".lock"));
  if (!isOwnedRuntimeFile(lock) || lock.nlink !== 1 || lock.size !== 0) throw probeError();
  if (process.platform !== "win32" && (lock.mode & 0o777) !== 0o644) throw probeError();
  for (const name of CODEX_ARG0_HELPERS) {
    const helper = path.join(target, name);
    const helperStat = fs.lstatSync(helper);
    if (!helperStat.isSymbolicLink() || !isCurrentOwner(helperStat) || helperStat.nlink !== 1) throw probeError();
    const linked = fs.readlinkSync(helper);
    if (!isBoundedNonEmptyString(linked) || linked.includes("\0")) throw probeError();
    if (fs.realpathSync(helper) !== trustedExecutable) throw probeError();
  }
}

function readDirectoryNames(target: string): string[] {
  const names: string[] = [];
  const directory = fs.opendirSync(target);
  try {
    for (let count = 0; ; count += 1) {
      const entry = directory.readSync();
      if (entry === null) break;
      if (count >= MAX_CODEX_HOME_ENTRIES) throw probeError();
      names.push(entry.name);
    }
  } finally {
    directory.closeSync();
  }
  return names;
}

function isOwnedRuntimeFile(stat: fs.Stats): boolean {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && isCurrentOwner(stat) && (stat.mode & 0o022) === 0;
}

function isCurrentOwner(stat: fs.Stats): boolean {
  return process.getuid === undefined || stat.uid === process.getuid();
}

function isPrivateOwnedFile(stat: fs.Stats): boolean {
  return stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0
    && isCurrentOwner(stat);
}

function createProbeRoot(): string {
  try {
    return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "gcr-app-server-authenticated-"));
  } catch {
    throw probeError();
  }
}

function isExactChallenge(value: unknown): boolean {
  return isPlainRecord(value)
    && hasOnlyKeys(value, ["challenge"])
    && value.challenge === CHALLENGE;
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_FIELD_BYTES
    && Buffer.byteLength(value, "utf8") <= MAX_FIELD_BYTES && !value.includes("\0");
}

function isBoundedNonEmptyString(value: unknown): value is string {
  return isBoundedString(value) && value.length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function probeError(): Error {
  return new Error("authenticated app server probe failed");
}

function resolveCodexExecutableOrFail(): string {
  try {
    return resolveCodexExecutable();
  } catch {
    throw probeError();
  }
}

function assertSystemSkillsDigest(
  codexHome: string,
  expected: CodexSystemSkillsDigest,
  requirePresent: boolean
): void {
  const actual = readCodexSystemSkillsDigest(codexHome);
  if (!requirePresent && actual === null) return;
  if (actual !== expected) throw probeError();
}
