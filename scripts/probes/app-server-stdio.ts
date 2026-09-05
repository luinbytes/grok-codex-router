import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TextDecoder } from "node:util";
import {
  cloneBoundedJsonObject,
  createAppServerMessageParser,
  recordGrokToolResult,
  requestId,
  type AppServerCandidateContext,
  type AppServerParseResult,
  type JsonObject,
  type RequestId,
  type ResponseMethod
} from "./app-server-candidate.js";
import type { BridgeEvent, CallId } from "./bridge-contract.js";
import { ISOLATED_APP_SERVER_ARGS } from "./app-server-launch.js";
import { readCodexSystemSkillsDigest, type CodexSystemSkillsDigest } from "./codex-home.js";
import {
  isolatedCodexEnvironment,
  PINNED_CODEX_CLI_VERSION,
  processGroupExists,
  resolvePinnedCodexExecutable,
  revalidatePinnedCodexExecutable,
  signalOwnedProcessGroup,
  supportsAuthenticatedAppServerPlatform,
  supportsOwnedProcessGroup,
  waitForProcessGroupExit,
  type VerifiedCodexExecutable
} from "./codex-process.js";

export const MAX_APP_SERVER_LINE_BYTES = 4 * 1024 * 1024;
const MAX_APP_SERVER_QUEUE_MESSAGES = 64;
const MAX_APP_SERVER_STDERR_BYTES = 64 * 1024;
const MAX_APP_SERVER_FRAMES_PER_CHUNK = 64;
const MAX_APP_SERVER_AUDIT_MESSAGES = 64;
const MAX_COMMAND_FIELD_BYTES = 16 * 1024;
const MAX_TOOL_COUNT = 256;
const MAX_DYNAMIC_TOOL_ITEM_BYTES = 1024 * 1024;
const MAX_DYNAMIC_TOOL_RESULT_BYTES = MAX_APP_SERVER_LINE_BYTES - 16 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 1_000;
const MAX_REQUEST_TIMEOUT_MS = 5 * 60_000;
const MAX_SHUTDOWN_TIMEOUT_MS = 10_000;

interface AppServerDynamicTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
}

type DynamicToolOutputContentItem =
  | { readonly type: "inputText"; readonly text: string }
  | { readonly type: "inputImage"; readonly imageUrl: string }
  | { readonly type: "inputAudio"; readonly audioUrl: string };

interface DynamicToolResult {
  readonly success: boolean;
  readonly contentItems: readonly DynamicToolOutputContentItem[];
}

export interface AppServerStdioClientOptions {
  readonly executable: VerifiedCodexExecutable;
  readonly cwd: string;
  readonly codexHome: string;
  readonly clientVersion: string;
  readonly expectedCliVersion: string;
  readonly expectedModel: string;
  readonly tools: readonly AppServerDynamicTool[];
  readonly requestTimeoutMs?: number;
  readonly shutdownTimeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface AppServerStdioClient {
  initialize(): Promise<void>;
  verifyFileCredentialStore(): Promise<"file">;
  readAccount(): Promise<"signed-in" | "signed-out">;
  listModels(): Promise<"model-available">;
  listMcpServers(): Promise<"mcp-inventoried">;
  listHooks(): Promise<"hooks-inventoried">;
  startThread(): Promise<void>;
  verifyThreadIsolation(): Promise<"isolation-verified">;
  auditUntilIdle(idleMs: number): Promise<"quiet">;
  startTurn(text: string): Promise<void>;
  interruptTurn(): Promise<Extract<BridgeEvent, { readonly kind: "cancellation" }>>;
  next(): Promise<AppServerParseResult>;
  respondToDynamicTool(lease: DynamicToolLease, result: DynamicToolResult): Promise<Extract<BridgeEvent, { readonly kind: "tool-result" }>>;
  close(): Promise<void>;
}

type DynamicToolLease = Extract<AppServerParseResult, { readonly kind: "tool-handoff" }>;

export interface AppServerLifecycleReceipt {
  readonly candidate: "app-server-dynamic";
  readonly codexCliVersion: typeof PINNED_CODEX_CLI_VERSION;
  readonly codexCliSha256: string;
  readonly executableProvenance: "unverified";
  readonly protocol: "stdio-jsonl";
  readonly authenticationOwner: "codex";
  readonly authenticationStatus: "signed-out";
  readonly systemSkillsDigest: CodexSystemSkillsDigest;
  readonly credentialStore: "effective-file";
  readonly modelStatus: "available";
  readonly mcpIsolation: "disabled-before-turn";
  readonly hookIsolation: "configured-and-quiet";
  readonly threadPolicy: "ephemeral-read-only-no-network";
  readonly threadStart: "accepted";
  readonly postStartAudit: "quiet";
  readonly processGroup: "closed";
  readonly processContainment: "same-process-group-only";
  readonly startupIsolation: "observed-after-start";
  readonly releaseEligibility: "blocked";
}

export interface BoundedJsonlDecoder {
  push(chunk: Uint8Array): readonly unknown[];
  finish(): void;
}

export function createBoundedJsonlDecoder(maxLineBytes = MAX_APP_SERVER_LINE_BYTES): BoundedJsonlDecoder {
  if (!isPositiveInteger(maxLineBytes) || maxLineBytes > MAX_APP_SERVER_LINE_BYTES) throw protocolError();
  let parts: Buffer[] = [];
  let lineBytes = 0;
  let finished = false;

  const append = (part: Buffer): void => {
    if (lineBytes + part.length > maxLineBytes) throw protocolError();
    if (part.length > 0) parts.push(part);
    lineBytes += part.length;
  };

  const consumeLine = (): unknown => {
    if (lineBytes === 0) throw protocolError();
    let line = parts.length === 1 ? parts[0] as Buffer : Buffer.concat(parts, lineBytes);
    if (line.at(-1) === 0x0d) line = line.subarray(0, line.length - 1);
    if (line.length === 0) throw protocolError();
    parts = [];
    lineBytes = 0;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(line);
      return JSON.parse(text) as unknown;
    } catch {
      throw protocolError();
    }
  };

  return {
    push(chunk) {
      if (finished || !(chunk instanceof Uint8Array)) throw protocolError();
      const input = Buffer.from(chunk);
      const values: unknown[] = [];
      let start = 0;
      while (start < input.length) {
        const newline = input.indexOf(0x0a, start);
        if (newline < 0) {
          append(input.subarray(start));
          break;
        }
        append(input.subarray(start, newline));
        values.push(consumeLine());
        if (values.length > MAX_APP_SERVER_FRAMES_PER_CHUNK) throw protocolError();
        start = newline + 1;
      }
      return values;
    },
    finish() {
      if (finished) return;
      finished = true;
      if (lineBytes !== 0 || parts.length !== 0) throw protocolError();
    }
  };
}

export function openAppServerStdioClient(options: AppServerStdioClientOptions): AppServerStdioClient {
  try {
    if (!supportsAuthenticatedAppServerPlatform(process.platform)) throw protocolError();
    validateOptions(options);
    return new StdioClient(options);
  } catch {
    throw protocolError();
  }
}

export async function probeIsolatedAppServerLifecycle(
  options: Omit<AppServerStdioClientOptions, "codexHome" | "cwd" | "executable">
): Promise<AppServerLifecycleReceipt> {
  if (!supportsAuthenticatedAppServerPlatform(process.platform)) throw new Error("isolated app server lifecycle failure");
  const isolatedRoot = createIsolatedRoot();
  const isolatedCodexHome = path.join(isolatedRoot, "codex-home");
  const isolatedWorkspace = path.join(isolatedRoot, "workspace");
  try {
    if (options.expectedCliVersion !== PINNED_CODEX_CLI_VERSION) throw new Error("isolated app server lifecycle failure");
    fs.mkdirSync(isolatedCodexHome, { mode: 0o700 });
    fs.mkdirSync(isolatedWorkspace, { mode: 0o700 });
    let client: AppServerStdioClient | undefined;
    let codexCliSha256: string | undefined;
    try {
      const codex = await resolvePinnedCodexExecutable(isolatedCodexHome, Math.min(
        options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        60_000
      ));
      codexCliSha256 = codex.sha256;
      revalidatePinnedCodexExecutable(codex);
      client = openAppServerStdioClient({
        ...options,
        executable: codex,
        codexHome: isolatedCodexHome,
        cwd: isolatedWorkspace
      });
      await client.initialize();
      await client.verifyFileCredentialStore();
      const authenticationStatus = await client.readAccount();
      if (authenticationStatus !== "signed-out") throw new Error("isolated app server lifecycle failure");
      await client.listModels();
      await client.listMcpServers();
      await client.listHooks();
      await client.startThread();
      await client.verifyThreadIsolation();
      await client.auditUntilIdle(100);
      const systemSkillsDigest = readCodexSystemSkillsDigest(isolatedCodexHome);
      return {
        candidate: "app-server-dynamic",
        codexCliVersion: PINNED_CODEX_CLI_VERSION,
        codexCliSha256,
        executableProvenance: "unverified",
        protocol: "stdio-jsonl",
        authenticationOwner: "codex",
        authenticationStatus,
        systemSkillsDigest,
        credentialStore: "effective-file",
        modelStatus: "available",
        mcpIsolation: "disabled-before-turn",
        hookIsolation: "configured-and-quiet",
        threadPolicy: "ephemeral-read-only-no-network",
        threadStart: "accepted",
        postStartAudit: "quiet",
        processGroup: "closed",
        processContainment: "same-process-group-only",
        startupIsolation: "observed-after-start",
        releaseEligibility: "blocked"
      };
    } finally {
      if (client !== undefined) await client.close();
    }
  } catch {
    throw new Error("isolated app server lifecycle failure");
  } finally {
    try {
      fs.rmSync(isolatedRoot, { recursive: true, force: true });
    } catch {
      throw new Error("isolated app server lifecycle failure");
    }
  }
}

class StdioClient implements AppServerStdioClient {
  private readonly parser = createAppServerMessageParser();
  private readonly transport: StdioTransport;
  private readonly expectedModel: string;
  private readonly expectedCliVersion: string;
  private readonly cwd: string;
  private readonly clientVersion: string;
  private readonly tools: readonly AppServerDynamicTool[];
  private readonly requestTimeoutMs: number;
  private readonly signal: AbortSignal | undefined;
  private readonly pendingEvents: AppServerParseResult[] = [];
  private readonly pendingMessages: unknown[] = [];
  private readonly outstandingTools = new Map<RequestId, DynamicToolLease>();
  private readonly resolvedTools = new Map<CallId, DynamicToolResult>();
  private readonly completedTools = new Set<CallId>();
  private phase: "started" | "initialized" | "account-read" | "models-listed" | "mcp-inventoried" | "hooks-inventoried" | "thread-started" | "closed" = "started";
  private activeThreadId: string | undefined;
  private activeTurnId: string | undefined;
  private configuredMcpServerNames: readonly string[] = [];
  private configuredHookKeys: readonly string[] = [];
  private threadIsolationVerified = false;
  private credentialStoreVerified = false;
  private nextRequestId = 1;
  private operationInFlight = false;
  private operationCompletion: Promise<void> | undefined;
  private closePromise: Promise<void> | undefined;

  constructor(options: AppServerStdioClientOptions) {
    this.expectedModel = options.expectedModel;
    this.expectedCliVersion = options.expectedCliVersion;
    this.cwd = options.cwd;
    this.clientVersion = options.clientVersion;
    this.tools = options.tools.map((tool) => {
      const inputSchema = cloneBoundedJsonObject(tool.inputSchema);
      if (inputSchema === undefined) throw protocolError();
      return {
        name: tool.name,
        description: tool.description,
        inputSchema
      };
    });
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.signal = options.signal;
    revalidatePinnedCodexExecutable(options.executable);
    this.transport = new StdioTransport(
      options.executable.executable,
      options.cwd,
      options.codexHome,
      options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS
    );
  }

  async initialize(): Promise<void> {
    return this.exclusive(async () => {
      this.requirePhase("started");
      const result = await this.exchange("initialize", {
        clientInfo: { name: "grok-codex-router", title: "Grok Codex Router", version: this.clientVersion },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: ["warning", "thread/tokenUsage/updated", "account/rateLimits/updated"],
          requestAttestation: false
        }
      });
      if (result.kind !== "accepted") throw protocolError();
      await this.transport.send({ method: "initialized", params: {} });
      this.requirePhase("started");
      this.phase = "initialized";
    });
  }

  async verifyFileCredentialStore(): Promise<"file"> {
    return this.exclusive<"file">(async () => {
      this.requirePhase("initialized");
      if (this.credentialStoreVerified) throw protocolError();
      const result = await this.exchange("config/read", { cwd: this.cwd, includeLayers: false });
      if (result.kind !== "lifecycle" || result.lifecycle !== "credential-store-file") throw protocolError();
      this.credentialStoreVerified = true;
      return "file";
    });
  }

  async readAccount(): Promise<"signed-in" | "signed-out"> {
    return this.exclusive(async () => {
      this.requirePhase("initialized");
      const result = await this.exchange("account/read", {});
      if (result.kind !== "events" || result.events.length !== 1 || result.events[0]?.kind !== "authentication") {
        throw protocolError();
      }
      this.requirePhase("initialized");
      this.phase = "account-read";
      return result.events[0].status;
    });
  }

  async listModels(): Promise<"model-available"> {
    return this.exclusive(async () => {
      this.requirePhase("account-read");
      const result = await this.exchange("model/list", { includeHidden: true, limit: 256 });
      if (result.kind !== "lifecycle" || result.lifecycle !== "model-available") throw protocolError();
      this.requirePhase("account-read");
      this.phase = "models-listed";
      return result.lifecycle;
    });
  }

  async listMcpServers(): Promise<"mcp-inventoried"> {
    return this.exclusive<"mcp-inventoried">(async () => {
      this.requirePhase("models-listed");
      const result = await this.exchange("mcpServerStatus/list", { detail: "toolsAndAuthOnly", limit: 256 });
      if (result.kind !== "lifecycle" || result.lifecycle !== "mcp-inventory") throw protocolError();
      this.configuredMcpServerNames = [...result.serverNames];
      this.phase = "mcp-inventoried";
      return "mcp-inventoried";
    });
  }

  async listHooks(): Promise<"hooks-inventoried"> {
    return this.exclusive<"hooks-inventoried">(async () => {
      this.requirePhase("mcp-inventoried");
      const result = await this.exchange("hooks/list", { cwds: [this.cwd] });
      if (result.kind !== "lifecycle" || result.lifecycle !== "hooks-inventory") throw protocolError();
      this.configuredHookKeys = [...result.hookKeys];
      this.phase = "hooks-inventoried";
      return "hooks-inventoried";
    });
  }

  async startThread(): Promise<void> {
    return this.exclusive(async () => {
      this.requirePhase("hooks-inventoried");
      const result = await this.exchange("thread/start", {
        allowProviderModelFallback: false,
        approvalPolicy: "never",
        approvalsReviewer: "user",
        baseInstructions: "Use only the supplied dynamic tool. Do not use any built-in capability.",
        config: isolationConfig(this.configuredMcpServerNames, this.configuredHookKeys),
        cwd: this.cwd,
        developerInstructions: "Call the supplied dynamic tool exactly as requested. Do nothing else.",
        dynamicTools: this.tools.map((tool) => ({
          type: "function",
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        })),
        environments: [],
        ephemeral: true,
        experimentalRawEvents: false,
        model: this.expectedModel,
        modelProvider: "openai",
        runtimeWorkspaceRoots: [],
        sandbox: "read-only",
        threadSource: "appServer"
      });
      if (result.kind !== "lifecycle" || result.lifecycle !== "thread-started") throw protocolError();
      this.activeThreadId = result.threadId;
      try {
        await this.awaitNotification("thread/started");
      } catch (error: unknown) {
        this.activeThreadId = undefined;
        throw error;
      }
      this.requirePhase("hooks-inventoried");
      this.phase = "thread-started";
    });
  }

  async verifyThreadIsolation(): Promise<"isolation-verified"> {
    return this.exclusive<"isolation-verified">(async () => {
      this.requirePhase("thread-started");
      if (this.activeThreadId === undefined || this.activeTurnId !== undefined || this.threadIsolationVerified) throw protocolError();
      const result = await this.exchange("mcpServerStatus/list", {
        detail: "toolsAndAuthOnly",
        limit: 256,
        threadId: this.activeThreadId
      }, this.configuredMcpServerNames);
      if (result.kind !== "lifecycle" || result.lifecycle !== "mcp-disabled") throw protocolError();
      this.threadIsolationVerified = true;
      return "isolation-verified";
    });
  }

  async startTurn(text: string): Promise<void> {
    return this.exclusive(async () => {
      this.requirePhase("thread-started");
      if (this.activeThreadId === undefined || this.activeTurnId !== undefined || !this.threadIsolationVerified
        || !isBoundedNonEmptyString(text, MAX_APP_SERVER_LINE_BYTES)) {
        throw protocolError();
      }
      this.resolvedTools.clear();
      this.completedTools.clear();
      const result = await this.exchange("turn/start", {
        input: [{ type: "text", text }],
        threadId: this.activeThreadId
      });
      if (result.kind !== "lifecycle" || result.lifecycle !== "turn-started") throw protocolError();
      this.activeTurnId = result.turnId;
      try {
        await this.awaitNotification("turn/started");
      } catch (error: unknown) {
        this.activeTurnId = undefined;
        throw error;
      }
      this.requirePhase("thread-started");
    });
  }

  async auditUntilIdle(idleMs: number): Promise<"quiet"> {
    return this.exclusive<"quiet">(async () => {
      this.requirePhase("thread-started");
      if (!isPositiveInteger(idleMs) || idleMs > 1_000) throw protocolError();
      for (let messageCount = 0; messageCount < MAX_APP_SERVER_AUDIT_MESSAGES; messageCount += 1) {
        let raw: unknown;
        try {
          raw = await this.receiveRaw(idleMs);
        } catch (error: unknown) {
          if (error instanceof AppServerTimeoutError) return "quiet";
          throw error;
        }
        const result = this.parse(raw);
        if (result.kind === "rejected") throw candidateError(result.code);
        if (result.kind !== "accepted") throw protocolError();
      }
      throw protocolError();
    });
  }

  async interruptTurn(): Promise<Extract<BridgeEvent, { readonly kind: "cancellation" }>> {
    return this.exclusive(async () => {
      this.requirePhase("thread-started");
      if (this.activeThreadId === undefined || this.activeTurnId === undefined) throw protocolError();
      const result = await this.exchange("turn/interrupt", {
        threadId: this.activeThreadId,
        turnId: this.activeTurnId
      });
      if (result.kind !== "events" || result.events.length !== 1 || result.events[0]?.kind !== "cancellation"
        || result.events[0].state !== "requested") throw protocolError();
      return result.events[0];
    });
  }

  async next(): Promise<AppServerParseResult> {
    return this.exclusive(async () => {
      this.requirePhase("thread-started");
      while (true) {
        const queued = this.pendingEvents.shift();
        const raw = queued === undefined ? await this.receiveRaw() : undefined;
        const result = queued ?? this.parse(raw);
        if (result.kind === "rejected") throw candidateError(result.code);
        if (raw !== undefined && isCompletedDynamicToolNotification(raw)) {
          const completion = dynamicToolCompletionFromNotification(raw);
          const expectedResult = completion === undefined ? undefined : this.resolvedTools.get(completion.callId);
          if (completion === undefined || expectedResult === undefined || !sameDynamicToolResult(expectedResult, completion.result)) {
            throw candidateError("protocol-failure");
          }
          this.completedTools.add(completion.callId);
        }
        if (result.kind === "accepted") continue;
        if (result.kind === "tool-handoff") {
          const storedArguments = cloneBoundedJsonObject(result.arguments);
          if (storedArguments === undefined) throw candidateError("protocol-failure");
          this.outstandingTools.set(result.requestId, {
            ...result,
            arguments: storedArguments,
            event: { ...result.event }
          });
        }
        if (result.kind === "events" && result.events.some((event) => event.kind === "completed")) {
          if (this.outstandingTools.size !== 0 || this.resolvedTools.size !== this.completedTools.size) throw candidateError("protocol-failure");
          this.activeTurnId = undefined;
          this.outstandingTools.clear();
        }
        this.requirePhase("thread-started");
        return result;
      }
    });
  }

  async respondToDynamicTool(lease: DynamicToolLease, result: DynamicToolResult): Promise<Extract<BridgeEvent, { readonly kind: "tool-result" }>> {
    return this.exclusive(async () => {
      this.requirePhase("thread-started");
      const leaseId = leaseRequestId(lease);
      const storedLease = leaseId === undefined ? undefined : this.outstandingTools.get(leaseId);
      const safeResult = normalizeDynamicToolResult(result);
      if (storedLease === undefined || safeResult === undefined || !sameLease(storedLease, lease)) throw protocolError();
      this.outstandingTools.delete(storedLease.requestId);
      this.resolvedTools.set(storedLease.callId, safeResult);
      await this.transport.send({ id: storedLease.requestId, result: safeResult });
      this.requirePhase("thread-started");
      return recordGrokToolResult(storedLease.callId);
    });
  }

  close(): Promise<void> {
    if (this.closePromise !== undefined) return this.closePromise;
    this.phase = "closed";
    const activeOperation = this.operationCompletion ?? Promise.resolve();
    this.closePromise = (async () => {
      let closeFailure: unknown;
      try {
        await this.transport.close();
      } catch (error: unknown) {
        closeFailure = error;
      }
      await activeOperation;
      this.pendingEvents.length = 0;
      this.pendingMessages.length = 0;
      this.outstandingTools.clear();
      this.resolvedTools.clear();
      this.completedTools.clear();
      this.configuredMcpServerNames = [];
      this.configuredHookKeys = [];
      this.threadIsolationVerified = false;
      if (closeFailure !== undefined) throw closeFailure;
    })();
    return this.closePromise;
  }

  private async exchange(
    method: ResponseMethod,
    params: JsonObject,
    expectedDisabledMcpServerNames?: readonly string[]
  ): Promise<AppServerParseResult> {
    this.drainPendingMessages();
    const id = requestId(this.nextRequestId);
    this.nextRequestId += 1;
    await this.transport.send({ id, method, params });
    while (true) {
      const raw = await this.transport.receive(this.requestTimeoutMs, this.signal);
      if (isExpectedResponseEnvelope(raw, id)) {
        const result = this.parse(raw, { id, method }, expectedDisabledMcpServerNames);
        if (result.kind === "rejected") throw candidateError(result.code);
        return result;
      }
      if (method === "thread/start" || method === "turn/start") {
        this.queueMessage(raw);
      } else {
        const result = this.parse(raw);
        if (result.kind === "rejected") throw candidateError(result.code);
        if (result.kind !== "accepted") this.queueEvent(result);
      }
    }
  }

  private async awaitNotification(method: "thread/started" | "turn/started"): Promise<void> {
    while (true) {
      const raw = await this.receiveRaw();
      const result = this.parse(raw);
      if (result.kind === "rejected") throw candidateError(result.code);
      if (isNotification(raw, method)) {
        if (result.kind !== "accepted") throw protocolError();
        return;
      }
      if (result.kind === "lifecycle") throw protocolError();
      if (result.kind !== "accepted") this.queueEvent(result);
    }
  }

  private receiveRaw(timeoutMs = this.requestTimeoutMs): Promise<unknown> {
    const pending = this.pendingMessages.shift();
    return pending === undefined
      ? this.transport.receive(timeoutMs, this.signal)
      : Promise.resolve(pending);
  }

  private drainPendingMessages(): void {
    while (this.pendingMessages.length > 0) {
      const raw = this.pendingMessages.shift();
      const result = this.parse(raw);
      if (result.kind === "rejected") throw candidateError(result.code);
      if (result.kind !== "accepted") this.queueEvent(result);
    }
  }

  private queueMessage(raw: unknown): void {
    if (this.pendingMessages.length >= MAX_APP_SERVER_QUEUE_MESSAGES) throw protocolError();
    this.pendingMessages.push(raw);
  }

  private queueEvent(result: AppServerParseResult): void {
    if (this.pendingEvents.length >= MAX_APP_SERVER_QUEUE_MESSAGES) throw protocolError();
    this.pendingEvents.push(result);
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.operationInFlight || this.phase === "closed") throw protocolError();
    this.operationInFlight = true;
    let complete: (() => void) | undefined;
    const completion = new Promise<void>((resolve) => { complete = resolve; });
    this.operationCompletion = completion;
    try {
      return await operation();
    } finally {
      this.operationInFlight = false;
      complete?.();
      if (this.operationCompletion === completion) this.operationCompletion = undefined;
    }
  }

  private parse(
    raw: unknown,
    expectedResponse?: { readonly id: RequestId; readonly method: ResponseMethod },
    expectedDisabledMcpServerNames?: readonly string[]
  ): AppServerParseResult {
    const context: AppServerCandidateContext = {
      candidate: "app-server-dynamic",
      expectedCwd: this.cwd,
      expectedCliVersion: this.expectedCliVersion,
      expectedModel: this.expectedModel,
      registeredToolNames: this.tools.map((tool) => tool.name),
      ...(expectedDisabledMcpServerNames === undefined ? {} : { expectedDisabledMcpServerNames }),
      ...(this.activeThreadId === undefined ? {} : { activeThreadId: this.activeThreadId }),
      ...(this.activeTurnId === undefined ? {} : { activeTurnId: this.activeTurnId }),
      ...(expectedResponse === undefined ? {} : { expectedResponse })
    };
    return this.parser.parse(raw, context);
  }

  private requirePhase(phase: typeof this.phase): void {
    if (this.phase !== phase) throw protocolError();
  }
}

function createIsolatedRoot(): string {
  try {
    return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "gcr-app-server-isolated-"));
  } catch {
    throw new Error("isolated app server lifecycle failure");
  }
}

class StdioTransport {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly leaderPid: number | undefined;
  private readonly decoder = createBoundedJsonlDecoder();
  private readonly shutdownTimeoutMs: number;
  private readonly messages: unknown[] = [];
  private readonly exit: Promise<void>;
  private resolveExit: (() => void) | undefined;
  private waiter: { readonly resolve: (value: unknown) => void; readonly reject: (error: Error) => void } | undefined;
  private failure: Error | undefined;
  private stderrBytes = 0;
  private closing = false;
  private closed = false;
  private paused = false;

  constructor(executable: string, cwd: string, codexHome: string, shutdownTimeoutMs: number) {
    this.shutdownTimeoutMs = shutdownTimeoutMs;
    this.exit = new Promise((resolve) => { this.resolveExit = resolve; });
    this.child = spawn(executable, ISOLATED_APP_SERVER_ARGS, {
      cwd,
      detached: supportsOwnedProcessGroup(process.platform),
      env: isolatedCodexEnvironment(codexHome),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.leaderPid = this.child.pid;
    this.child.stdout.on("data", (chunk: Buffer) => this.acceptStdout(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderrBytes += chunk.length;
      if (this.stderrBytes > MAX_APP_SERVER_STDERR_BYTES) this.fail(protocolError());
    });
    this.child.once("error", () => this.fail(processError()));
    this.child.once("close", () => {
      this.closed = true;
      try { this.decoder.finish(); } catch { this.fail(protocolError()); }
      this.resolveExit?.();
      this.resolveExit = undefined;
      if (!this.closing && this.failure === undefined) this.fail(processError());
    });
  }

  async send(value: unknown): Promise<void> {
    if (this.failure !== undefined) throw this.failure;
    if (this.closed || this.closing || !this.child.stdin.writable) throw processError();
    let bytes: Buffer;
    try {
      bytes = Buffer.from(JSON.stringify(value) + "\n", "utf8");
    } catch {
      throw protocolError();
    }
    if (bytes.length > MAX_APP_SERVER_LINE_BYTES) throw protocolError();
    await new Promise<void>((resolve, reject) => {
      this.child.stdin.write(bytes, (error) => error === null || error === undefined ? resolve() : reject(processError()));
    });
  }

  receive(timeoutMs: number, signal: AbortSignal | undefined): Promise<unknown> {
    if (this.failure !== undefined) return Promise.reject(this.failure);
    const value = this.messages.shift();
    if (value !== undefined) {
      this.resumeIfNeeded();
      return Promise.resolve(value);
    }
    if (this.closed || this.waiter !== undefined) return Promise.reject(processError());
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.waiter = undefined;
        action();
      };
      const timer = setTimeout(() => finish(() => reject(timeoutError())), timeoutMs);
      const abort = () => finish(() => reject(abortError()));
      this.waiter = {
        resolve: (message) => finish(() => resolve(message)),
        reject: (error) => finish(() => reject(error))
      };
      if (signal?.aborted === true) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
  }

  async close(): Promise<void> {
    if (this.closing) return this.exit;
    this.closing = true;
    this.waiter?.reject(processError());
    this.waiter = undefined;
    if (!this.closed) this.child.stdin.end();
    if (!await settlesWithin(this.exit, this.shutdownTimeoutMs)) {
      signalOwnedProcessGroup(this.child, "SIGTERM");
      if (!await settlesWithin(this.exit, this.shutdownTimeoutMs)) {
        signalOwnedProcessGroup(this.child, "SIGKILL");
        if (!await settlesWithin(this.exit, this.shutdownTimeoutMs)) throw processError();
      }
    }
    if (this.leaderPid !== undefined && processGroupExists(this.leaderPid)) {
      signalOwnedProcessGroup(this.child, "SIGTERM");
      if (!await waitForProcessGroupExit(this.leaderPid, this.shutdownTimeoutMs)) {
        signalOwnedProcessGroup(this.child, "SIGKILL");
        if (!await waitForProcessGroupExit(this.leaderPid, this.shutdownTimeoutMs)) throw processError();
      }
    }
    this.child.stdout.destroy();
    this.child.stderr.destroy();
  }

  private acceptStdout(chunk: Buffer): void {
    if (this.failure !== undefined || this.closing) return;
    let decoded: readonly unknown[];
    try {
      decoded = this.decoder.push(chunk);
    } catch {
      this.fail(protocolError());
      return;
    }
    for (const value of decoded) {
      if (this.waiter !== undefined) {
        const waiter = this.waiter;
        this.waiter = undefined;
        waiter.resolve(value);
        continue;
      }
      if (this.messages.length >= MAX_APP_SERVER_QUEUE_MESSAGES) {
        this.fail(protocolError());
        return;
      }
      this.messages.push(value);
      if (this.messages.length >= MAX_APP_SERVER_QUEUE_MESSAGES / 2 && !this.paused) {
        this.child.stdout.pause();
        this.paused = true;
      }
    }
  }

  private resumeIfNeeded(): void {
    if (this.paused && this.messages.length < MAX_APP_SERVER_QUEUE_MESSAGES / 4) {
      this.paused = false;
      this.child.stdout.resume();
    }
  }

  private fail(error: Error): void {
    if (this.failure !== undefined) return;
    this.failure = error;
    this.waiter?.reject(error);
    this.waiter = undefined;
    if (!this.closed) signalOwnedProcessGroup(this.child, "SIGTERM");
  }
}

function isolationConfig(mcpServerNames: readonly string[], hookKeys: readonly string[]): JsonObject {
  const mcpServers: Record<string, JsonObject> = Object.create(null) as Record<string, JsonObject>;
  for (const name of mcpServerNames) mcpServers[name] = { enabled: false };
  const hookState: Record<string, JsonObject> = Object.create(null) as Record<string, JsonObject>;
  for (const key of hookKeys) hookState[key] = { enabled: false };
  return {
    features: {
      apps: false,
      auth_elicitation: false,
      goals: false,
      hooks: false,
      memories: false,
      plugin_sharing: false,
      plugins: false,
      remote_plugin: false,
      request_permissions_tool: false,
      skill_mcp_dependency_install: false,
      skill_search: false,
      skip_host_skill_discovery: true,
      tool_call_mcp_elicitation: false,
      tool_suggest: false,
      workspace_dependencies: false
    },
    hooks: { state: hookState },
    include_apps_instructions: false,
    include_collaboration_mode_instructions: false,
    include_environment_context: false,
    include_permissions_instructions: false,
    mcp_servers: mcpServers,
    notify: []
  };
}

function validateOptions(options: AppServerStdioClientOptions): void {
  if (!isPlainRecord(options)
    || !hasOnlyKeys(options, ["clientVersion", "codexHome", "cwd", "executable", "expectedCliVersion", "expectedModel", "requestTimeoutMs", "shutdownTimeoutMs", "signal", "tools"])
    || !path.isAbsolute(options.cwd) || !isBoundedNonEmptyString(options.cwd, MAX_COMMAND_FIELD_BYTES)
    || !isBoundedNonEmptyString(options.clientVersion, MAX_COMMAND_FIELD_BYTES)
    || options.expectedCliVersion !== PINNED_CODEX_CLI_VERSION
    || !isBoundedNonEmptyString(options.expectedModel, MAX_COMMAND_FIELD_BYTES)
    || !isAbsoluteBoundedPath(options.codexHome)
    || !Array.isArray(options.tools) || options.tools.length > MAX_TOOL_COUNT
    || !options.tools.every(isDynamicTool)
    || new Set(options.tools.map((tool) => tool.name)).size !== options.tools.length
    || (options.requestTimeoutMs !== undefined && (!isPositiveInteger(options.requestTimeoutMs) || options.requestTimeoutMs > MAX_REQUEST_TIMEOUT_MS))
    || (options.shutdownTimeoutMs !== undefined && (!isPositiveInteger(options.shutdownTimeoutMs) || options.shutdownTimeoutMs > MAX_SHUTDOWN_TIMEOUT_MS))
    || (options.signal !== undefined && !(options.signal instanceof AbortSignal))) throw protocolError();
}

function isAbsoluteBoundedPath(value: unknown): value is string {
  return typeof value === "string"
    && path.isAbsolute(value)
    && isBoundedNonEmptyString(value, MAX_COMMAND_FIELD_BYTES);
}

function isDynamicTool(value: AppServerDynamicTool): boolean {
  return isPlainRecord(value) && hasOnlyKeys(value, ["description", "inputSchema", "name"])
    && isBoundedNonEmptyString(value.name, MAX_COMMAND_FIELD_BYTES)
    && isBoundedString(value.description, MAX_COMMAND_FIELD_BYTES)
    && cloneBoundedJsonObject(value.inputSchema) !== undefined;
}

function normalizeDynamicToolResult(value: DynamicToolResult): DynamicToolResult | undefined {
  try {
    if (!isPlainRecord(value) || !hasOnlyKeys(value, ["contentItems", "success"]) || typeof value.success !== "boolean"
      || !Array.isArray(value.contentItems) || value.contentItems.length > MAX_TOOL_COUNT) return undefined;
    const contentItems: DynamicToolOutputContentItem[] = [];
    let encodedBytes = Buffer.byteLength(JSON.stringify({ contentItems: [], success: value.success }), "utf8");
    for (const item of value.contentItems) {
      if (!isPlainRecord(item)) return undefined;
      let safeItem: DynamicToolOutputContentItem;
      if (item.type === "inputText" && hasOnlyKeys(item, ["text", "type"])
        && isBoundedString(item.text, MAX_DYNAMIC_TOOL_ITEM_BYTES)) {
        safeItem = { type: "inputText", text: item.text };
      } else if (item.type === "inputImage" && hasOnlyKeys(item, ["imageUrl", "type"])
        && isBoundedString(item.imageUrl, MAX_DYNAMIC_TOOL_ITEM_BYTES)) {
        safeItem = { type: "inputImage", imageUrl: item.imageUrl };
      } else if (item.type === "inputAudio" && hasOnlyKeys(item, ["audioUrl", "type"])
        && isBoundedString(item.audioUrl, MAX_DYNAMIC_TOOL_ITEM_BYTES)) {
        safeItem = { type: "inputAudio", audioUrl: item.audioUrl };
      } else {
        return undefined;
      }
      const itemBytes = Buffer.byteLength(JSON.stringify(safeItem), "utf8") + 1;
      if (itemBytes > MAX_DYNAMIC_TOOL_RESULT_BYTES - encodedBytes) return undefined;
      encodedBytes += itemBytes;
      contentItems.push(safeItem);
    }
    return { success: value.success, contentItems };
  } catch {
    return undefined;
  }
}

function leaseRequestId(value: unknown): RequestId | undefined {
  try {
    if (!isPlainRecord(value)
      || !hasOnlyKeys(value, ["arguments", "callId", "event", "executor", "kind", "requestId", "threadId", "tool", "turnId"])) return undefined;
    return requestId(value.requestId as string | number);
  } catch {
    return undefined;
  }
}

function sameLease(stored: DynamicToolLease, candidate: unknown): candidate is DynamicToolLease {
  const candidateId = leaseRequestId(candidate);
  if (candidateId === undefined || !isPlainRecord(candidate) || !isPlainRecord(candidate.event)) return false;
  const candidateArguments = cloneBoundedJsonObject(candidate.arguments);
  return candidate.kind === "tool-handoff"
    && candidate.executor === "grok"
    && candidateId === stored.requestId
    && candidate.callId === stored.callId
    && candidate.threadId === stored.threadId
    && candidate.turnId === stored.turnId
    && candidate.tool === stored.tool
    && candidateArguments !== undefined
    && sameJson(stored.arguments, candidateArguments)
    && hasOnlyKeys(candidate.event, ["callId", "executor", "kind"])
    && candidate.event.kind === "tool-request"
    && candidate.event.callId === stored.callId
    && candidate.event.executor === "grok";
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameJson(value, right[index]));
  }
  if (!isPlainRecord(left) || !isPlainRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJson(left[key], right[key]));
}

function isCompletedDynamicToolNotification(value: unknown): boolean {
  if (!isPlainRecord(value) || value.method !== "item/completed" || !isPlainRecord(value.params)) return false;
  const item = value.params.item;
  return isPlainRecord(item) && item.type === "dynamicToolCall";
}

function dynamicToolCompletionFromNotification(value: unknown): { readonly callId: CallId; readonly result: DynamicToolResult } | undefined {
  if (!isCompletedDynamicToolNotification(value)) return undefined;
  const params = (value as Record<string, unknown>).params as Record<string, unknown>;
  const item = params.item as Record<string, unknown>;
  if (typeof item.id !== "string" || item.id.length === 0 || item.status !== "completed" || item.success !== true) return undefined;
  const result = normalizeDynamicToolResult({ success: item.success, contentItems: item.contentItems } as DynamicToolResult);
  return result === undefined ? undefined : { callId: item.id as CallId, result };
}

function sameDynamicToolResult(left: DynamicToolResult, right: DynamicToolResult): boolean {
  return left.success === right.success && sameJson(left.contentItems, right.contentItems);
}

function isExpectedResponseEnvelope(raw: unknown, id: RequestId): boolean {
  return isPlainRecord(raw)
    && hasOwn(raw, "id") && raw.id === id && !hasOwn(raw, "method")
    && (hasOwn(raw, "result") || hasOwn(raw, "error"));
}

function isNotification(raw: unknown, method: string): boolean {
  return isPlainRecord(raw) && !hasOwn(raw, "id") && raw.method === method;
}

function isBoundedString(value: unknown, maxBytes: number): value is string {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= maxBytes && !value.includes("\0");
}

function isBoundedNonEmptyString(value: unknown, maxBytes: number): value is string {
  return isBoundedString(value, maxBytes) && value.length > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || key === "__proto__" || key === "constructor" || key === "prototype") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

async function settlesWithin(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function protocolError(): Error {
  return new Error("app server protocol failure");
}

function candidateError(code: string): Error {
  return new Error("app server candidate rejected: " + code);
}

function processError(): Error {
  return new Error("app server process failure");
}

class AppServerTimeoutError extends Error {
  constructor() {
    super("app server request timed out");
  }
}

function timeoutError(): AppServerTimeoutError {
  return new AppServerTimeoutError();
}

function abortError(): Error {
  return new Error("app server request aborted");
}
