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
  resolvePinnedCodexExecutable,
  revalidatePinnedCodexExecutable,
  supportsAuthenticatedAppServerPlatform
} from "./codex-process.js";

const MAX_FIELD_BYTES = 16 * 1024;
const MAX_EVENTS = 64;
const MAX_CODEX_HOME_ENTRIES = 1024;
const MAX_AUTH_FILE_BYTES = 1024 * 1024;
const MAX_INSTALLATION_ID_BYTES = 64 * 1024;
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
const CODEX_RUNTIME_DIRECTORIES = new Set(["skills", "tmp"]);
const CODEX_DATABASE_FILE = /^(?:goals|logs|memories|queue|state)_[0-9]+\.sqlite(?:-(?:shm|wal))?$/;

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
  readonly codexCliVersion: "0.151.0";
  readonly codexCliSha256: string;
  readonly authenticationOwner: "codex";
  readonly authenticationStatus: "signed-in";
  readonly configurationIsolation: "dedicated-codex-home";
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
  validateDedicatedCodexHome(options.codexHome);
  const root = createProbeRoot();
  const workspace = path.join(root, "workspace");
  let client: AppServerStdioClient | undefined;
  let codexCliSha256: string | undefined;
  let failure = false;
  try {
    fs.mkdirSync(workspace, { mode: 0o700 });
    const codex = await resolvePinnedCodexExecutable(options.codexHome, Math.min(
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      60_000
    ));
    codexCliSha256 = codex.sha256;
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
    await client.verifyFileCredentialStore();
    if (await client.readAccount() !== "signed-in") throw probeError();
    await client.listModels();
    await client.listMcpServers();
    await client.listHooks();
    await client.startThread();
    await client.verifyThreadIsolation();
    await client.auditUntilIdle(100);
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
      validateDedicatedCodexHome(options.codexHome);
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
    authenticationOwner: "codex",
    authenticationStatus: "signed-in",
    configurationIsolation: "dedicated-codex-home",
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

function validateDedicatedCodexHome(codexHome: string): void {
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
    const directory = fs.opendirSync(codexHome);
    try {
      for (let count = 0; ; count += 1) {
        const entry = directory.readSync();
        if (entry === null) break;
        if (count >= MAX_CODEX_HOME_ENTRIES) throw probeError();
        validateCodexHomeEntry(codexHome, entry.name);
      }
    } finally {
      directory.closeSync();
    }
  } catch {
    throw probeError();
  }
}

function validateCodexHomeEntry(codexHome: string, name: string): void {
  if (name === CODEX_HOME_MARKER || name === CODEX_AUTH_FILE) return;
  const target = path.join(codexHome, name);
  const stat = fs.lstatSync(target);
  if (name === "installation_id") {
    if (!isOwnedRuntimeFile(stat) || stat.size <= 0 || stat.size > MAX_INSTALLATION_ID_BYTES) throw probeError();
    return;
  }
  if (CODEX_DATABASE_FILE.test(name)) {
    if (!isOwnedRuntimeFile(stat)) throw probeError();
    return;
  }
  if (CODEX_RUNTIME_DIRECTORIES.has(name)) {
    validateEmptyOwnedDirectory(target, stat);
    return;
  }
  throw probeError();
}

function validateEmptyOwnedDirectory(target: string, stat: fs.Stats): void {
  if (!stat.isDirectory() || stat.isSymbolicLink() || !isCurrentOwner(stat) || (stat.mode & 0o022) !== 0) throw probeError();
  const directory = fs.opendirSync(target);
  try {
    if (directory.readSync() !== null) throw probeError();
  } finally {
    directory.closeSync();
  }
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
