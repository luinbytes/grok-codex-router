import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  MAX_APP_SERVER_LINE_BYTES,
  createBoundedJsonlDecoder,
  openAppServerStdioClient,
  probeIsolatedAppServerLifecycle,
  type AppServerStdioClientOptions
} from "../scripts/probes/app-server-stdio.js";
import { ISOLATED_APP_SERVER_ARGS } from "../scripts/probes/app-server-launch.js";
import {
  resolvePinnedCodexExecutable,
  supportsOwnedProcessGroup,
  type VerifiedCodexExecutable
} from "../scripts/probes/codex-process.js";

const FAKE_SERVER = String.raw`
const readline = require("node:readline");
if (process.env.GCR_PRIVATE_TEST_SECRET) throw new Error("private environment inherited");
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const notificationsFirst = process.argv[1] === "notifications-first";
const completesWithOutstandingTool = process.argv[1] === "unresolved-tool";
const emitsLateMcp = process.argv[1] === "mcp-after-thread";
const emitsEndlessAccepted = process.argv[1] === "endless-accepted";
const wrongCredentialStore = process.argv[1] === "wrong-credential-store";
const signedInAccount = process.argv[1] === "signed-in";
let threadId = "thread-server-generated";
let turnId = "turn-server-generated";
function send(value) { process.stdout.write(JSON.stringify(value) + "\n"); }
function thread(cwd) {
  return {
    cliVersion: "0.151.0",
    createdAt: 1,
    cwd,
    ephemeral: true,
    id: threadId,
    modelProvider: "openai",
    preview: "",
    projectId: null,
    sessionId: "session-server-generated",
    source: "vscode",
    status: { type: "idle" },
    threadSource: "appServer",
    turns: [],
    updatedAt: 1
  };
}
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({ id: message.id, result: { codexHome: "/synthetic/codex", platformFamily: "unix", platformOs: "synthetic", userAgent: "synthetic" } });
    return;
  }
  if (message.method === "initialized") return;
  if (message.method === "config/read") {
    send({ id: message.id, result: { config: { cli_auth_credentials_store: wrongCredentialStore ? "keyring" : "file" }, origins: {} } });
    return;
  }
  if (message.method === "account/read") {
    send({ id: message.id, result: signedInAccount
      ? { account: { email: "private@example.invalid", planType: "plus", type: "chatgpt" }, requiresOpenaiAuth: true }
      : { account: null, requiresOpenaiAuth: true } });
    return;
  }
  if (message.method === "model/list") {
    send({ id: message.id, result: { data: [{ defaultReasoningEffort: "high", description: "synthetic", displayName: "Synthetic", hidden: false, id: "model-synthetic", isDefault: true, model: "gpt-synthetic", supportedReasoningEfforts: [{ description: "", reasoningEffort: "high" }] }], nextCursor: null } });
    return;
  }
  if (message.method === "mcpServerStatus/list") {
    send({ id: message.id, result: { data: [], nextCursor: null } });
    if (emitsEndlessAccepted && message.params.threadId) {
      let index = 0;
      const interval = setInterval(() => {
        send({ method: "remoteControl/status/changed", params: { environmentId: null, installationId: "installation-" + index, serverName: "server-" + index, status: "disabled" } });
        index += 1;
        if (index === 80) clearInterval(interval);
      }, 1);
    }
    return;
  }
  if (message.method === "hooks/list") {
    send({ id: message.id, result: { data: [{ cwd: message.params.cwds[0], errors: [], hooks: [], warnings: [] }] } });
    return;
  }
  if (message.method === "thread/start") {
    const value = thread(message.params.cwd);
    const response = { id: message.id, result: { approvalPolicy: "never", approvalsReviewer: "user", cwd: message.params.cwd, model: "gpt-synthetic", modelProvider: "openai", runtimeWorkspaceRoots: [], sandbox: { networkAccess: false, type: "readOnly" }, thread: value } };
    const notification = { method: "thread/started", params: { thread: value } };
    if (notificationsFirst) { send(notification); send(response); }
    else { send(response); send(notification); }
    if (emitsLateMcp) send({ method: "mcpServer/startupStatus/updated", params: {} });
    return;
  }
  if (message.method === "turn/start") {
    const response = { id: message.id, result: { turn: { id: turnId, items: [], status: "inProgress" } } };
    const notification = { method: "turn/started", params: { threadId, turn: { id: turnId, items: [], status: "inProgress" } } };
    if (notificationsFirst) { send(notification); send(response); }
    else { send(response); send(notification); }
    const item = { arguments: {}, id: "call-server-generated", namespace: null, status: "inProgress", success: null, tool: "gcr_probe_echo", type: "dynamicToolCall" };
    send({ method: "item/started", params: { item, startedAtMs: 1, threadId, turnId } });
    send({ id: "request-server-generated", method: "item/tool/call", params: { arguments: {}, callId: item.id, namespace: null, threadId, tool: item.tool, turnId } });
    if (completesWithOutstandingTool) send({ method: "turn/completed", params: { threadId, turn: { id: turnId, items: [], status: "completed" } } });
    return;
  }
  if (message.id === "request-server-generated" && message.result) {
    const item = { arguments: {}, contentItems: message.result.contentItems, durationMs: 1, id: "call-server-generated", namespace: null, status: message.result.success ? "completed" : "failed", success: message.result.success, tool: "gcr_probe_echo", type: "dynamicToolCall" };
    send({ method: "item/completed", params: { completedAtMs: 2, item, threadId, turnId } });
    send({ method: "turn/completed", params: { threadId, turn: { id: turnId, items: [item], status: "completed" } } });
    return;
  }
  if (message.method === "turn/interrupt") {
    send({ id: message.id, result: {} });
    send({ method: "turn/completed", params: { threadId, turn: { id: turnId, items: [], status: "interrupted" } } });
  }
});
`;

interface FakeCodexFixture {
  readonly executable: VerifiedCodexExecutable;
  readonly codexHome: string;
  readonly cwd: string;
  readonly argsPath: string;
}

async function createFakeCodex(root: string, server: string, mode: string): Promise<FakeCodexFixture> {
  const bin = path.join(root, "bin");
  const codexHome = path.join(root, "codex-home");
  const cwd = path.join(root, "workspace");
  const serverPath = path.join(root, "fake-server.cjs");
  const argsPath = path.join(root, "app-server-args.json");
  fs.mkdirSync(bin, { mode: 0o700 });
  fs.mkdirSync(codexHome, { mode: 0o700 });
  fs.mkdirSync(cwd, { mode: 0o700 });
  fs.writeFileSync(serverPath, server, { encoding: "utf8", mode: 0o600 });
  const executablePath = path.join(bin, "codex");
  const wrapper = [
    `#!${process.execPath}`,
    "const fs = require('node:fs');",
    "const expected = " + JSON.stringify(ISOLATED_APP_SERVER_ARGS) + ";",
    "const actual = process.argv.slice(2);",
    `const argsPath = ${JSON.stringify(argsPath)};`,
    `const mode = ${JSON.stringify(mode)};`,
    `const serverPath = ${JSON.stringify(serverPath)};`,
    "if (actual.length === 1 && actual[0] === '--version') { process.stdout.write('codex-cli 0.151.0\\n'); process.exit(0); }",
    "fs.writeFileSync(argsPath, JSON.stringify(actual));",
    "if (JSON.stringify(actual) !== JSON.stringify(expected)) { process.stderr.write('unexpected app-server arguments\\n'); process.exit(42); }",
    "process.argv[1] = mode;",
    "require(serverPath);"
  ].join("\n");
  fs.writeFileSync(executablePath, wrapper, { encoding: "utf8", mode: 0o700 });
  fs.chmodSync(executablePath, 0o700);
  const previousPath = process.env.PATH;
  process.env.PATH = bin;
  try {
    return {
      executable: await resolvePinnedCodexExecutable(codexHome, 2_000),
      codexHome,
      cwd,
      argsPath
    };
  } catch (error: unknown) {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    throw error;
  }
}

function options(fixture: FakeCodexFixture): AppServerStdioClientOptions {
  return {
    executable: fixture.executable,
    clientVersion: "0.1.0-test",
    codexHome: fixture.codexHome,
    cwd: fixture.cwd,
    expectedCliVersion: "0.151.0",
    expectedModel: "gpt-synthetic",
    requestTimeoutMs: 2_000,
    shutdownTimeoutMs: 100,
    tools: [{
      name: "gcr_probe_echo",
      description: "returns a fixed synthetic value",
      inputSchema: { additionalProperties: false, properties: {}, type: "object" }
    }]
  };
}

async function withTemporaryDirectory<T>(
  callback: (directory: string, fixture: FakeCodexFixture) => Promise<T>,
  specification: (directory: string) => { readonly mode?: string; readonly server?: string } = () => ({})
): Promise<T> {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(process.cwd()), ".gcr-app-server-stdio-"));
  const previousPath = process.env.PATH;
  try {
    const { mode = "default", server = FAKE_SERVER } = specification(directory);
    const fixture = await createFakeCodex(directory, server, mode);
    const result = await callback(directory, fixture);
    if (fs.existsSync(fixture.argsPath)) {
      assert.deepEqual(JSON.parse(fs.readFileSync(fixture.argsPath, "utf8")), ISOLATED_APP_SERVER_ARGS);
    }
    return result;
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function prepareThread(client: ReturnType<typeof openAppServerStdioClient>): Promise<void> {
  assert.equal(await client.listMcpServers(), "mcp-inventoried");
  assert.equal(await client.listHooks(), "hooks-inventoried");
  await client.startThread();
  assert.equal(await client.verifyThreadIsolation(), "isolation-verified");
}

async function waitForProcessExit(pid: number): Promise<boolean> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

async function waitForFile(file: string): Promise<boolean> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (fs.existsSync(file)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

test("bounded JSONL decoder accepts fragmented UTF-8 and CRLF frames", () => {
  const decoder = createBoundedJsonlDecoder();
  const bytes = Buffer.from('{"value":"snowman ☃"}\r\n{"second":true}\n', "utf8");
  const split = bytes.indexOf(Buffer.from("☃")) + 1;
  assert.deepEqual(decoder.push(bytes.subarray(0, split)), []);
  assert.deepEqual(decoder.push(bytes.subarray(split)), [{ value: "snowman ☃" }, { second: true }]);
  decoder.finish();
  decoder.finish();
});

test("stdio clients reject platforms without owned process-group control", () => {
  assert.equal(supportsOwnedProcessGroup("win32"), false);
  assert.equal(supportsOwnedProcessGroup("darwin"), true);
  assert.equal(supportsOwnedProcessGroup("linux"), true);
});

test("bounded JSONL decoder rejects unsafe framing before JSON parsing", () => {
  assert.throws(() => createBoundedJsonlDecoder(0), /protocol failure/);
  assert.throws(() => createBoundedJsonlDecoder(MAX_APP_SERVER_LINE_BYTES + 1), /protocol failure/);

  const malformed = createBoundedJsonlDecoder();
  assert.throws(() => malformed.push(Buffer.from("not-json\n")), /protocol failure/);

  const blank = createBoundedJsonlDecoder();
  assert.throws(() => blank.push(Buffer.from("\n")), /protocol failure/);

  const invalidUtf8 = createBoundedJsonlDecoder();
  assert.throws(() => invalidUtf8.push(Buffer.from([0xff, 0x0a])), /protocol failure/);

  const oversized = createBoundedJsonlDecoder(8);
  assert.deepEqual(oversized.push(Buffer.from("12345678")), []);
  assert.throws(() => oversized.push(Buffer.from("9")), /protocol failure/);

  const unterminated = createBoundedJsonlDecoder();
  assert.deepEqual(unterminated.push(Buffer.from("{}")), []);
  assert.throws(() => unterminated.finish(), /protocol failure/);

  const flooded = createBoundedJsonlDecoder();
  assert.throws(() => flooded.push(Buffer.from("{}\n".repeat(65))), /protocol failure/);
});

test("stdio client completes the safe lifecycle and closes without exposing private fields", async () => {
  await withTemporaryDirectory(async (directory, fixture) => {
    const receipt = await probeIsolatedAppServerLifecycle({
      clientVersion: "0.1.0-test",
      expectedCliVersion: "0.151.0",
      expectedModel: "gpt-synthetic",
      tools: [{
        name: "gcr_probe_echo",
        description: "returns a fixed synthetic value",
        inputSchema: { additionalProperties: false, properties: {}, type: "object" }
      }]
    });
    assert.deepEqual(receipt, {
      candidate: "app-server-dynamic",
      codexCliVersion: "0.151.0",
      codexCliSha256: fixture.executable.sha256,
      protocol: "stdio-jsonl",
      authenticationOwner: "codex",
      authenticationStatus: "signed-out",
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
    });
    const serialized = JSON.stringify(receipt);
    for (const forbidden of ["private@example.invalid", "/synthetic/codex", directory, "gpt-synthetic", "thread-server-generated"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });
});

test("stdio client preserves dynamic request identity and records Grok execution", async () => {
  await withTemporaryDirectory(async (_directory, fixture) => {
    const client = openAppServerStdioClient(options(fixture));
    try {
      await client.initialize();
      assert.equal(await client.readAccount(), "signed-out");
      assert.equal(await client.listModels(), "model-available");
      await prepareThread(client);
      await client.startTurn("synthetic prompt body");
      const request = await client.next();
      assert.equal(request.kind, "tool-handoff");
      if (request.kind !== "tool-handoff") return;
      assert.equal(request.requestId, "request-server-generated");
      assert.equal(request.callId, "call-server-generated");
      assert.equal(request.executor, "grok");
      const result = await client.respondToDynamicTool(request, {
        success: true,
        contentItems: [{ type: "inputText", text: "fixed synthetic result" }]
      });
      assert.deepEqual(result, { kind: "tool-result", callId: "call-server-generated", executor: "grok" });
      await assert.rejects(() => client.respondToDynamicTool(request, { success: true, contentItems: [] }), /protocol failure/);
      const completed = await client.next();
      assert.deepEqual(completed, { kind: "events", events: [{ kind: "completed" }] });
    } finally {
      await client.close();
    }
  });
});

test("stdio client consumes only the complete parser-issued dynamic tool lease", async () => {
  await withTemporaryDirectory(async (_directory, fixture) => {
    const client = openAppServerStdioClient(options(fixture));
    try {
      await client.initialize();
      await client.readAccount();
      await client.listModels();
      await prepareThread(client);
      await client.startTurn("synthetic prompt body");
      const request = await client.next();
      assert.equal(request.kind, "tool-handoff");
      if (request.kind !== "tool-handoff") return;
      await assert.rejects(() => client.respondToDynamicTool({ ...request, turnId: "turn-forged" }, {
        success: true,
        contentItems: [{ type: "inputText", text: "fixed synthetic result" }]
      }), /protocol failure/);
      await assert.rejects(() => client.respondToDynamicTool({ ...request, arguments: { unexpected: true } }, {
        success: true,
        contentItems: [{ type: "inputText", text: "fixed synthetic result" }]
      }), /protocol failure/);
      const result = await client.respondToDynamicTool(request, {
        success: true,
        contentItems: [{ type: "inputText", text: "fixed synthetic result" }]
      });
      assert.equal(result.callId, request.callId);
      assert.deepEqual(await client.next(), { kind: "events", events: [{ kind: "completed" }] });
    } finally {
      await client.close();
    }
  });
});

test("stdio client reconciles lifecycle notifications that precede responses", async () => {
  await withTemporaryDirectory(async (_directory, fixture) => {
    const client = openAppServerStdioClient(options(fixture));
    try {
      await client.initialize();
      await client.readAccount();
      await client.listModels();
      await prepareThread(client);
      await client.startTurn("synthetic prompt body");
      const request = await client.next();
      assert.equal(request.kind, "tool-handoff");
    } finally {
      await client.close();
    }
  }, () => ({ mode: "notifications-first" }));
});

test("stdio client rejects turn completion while a tool request is unresolved", async () => {
  await withTemporaryDirectory(async (_directory, fixture) => {
    const client = openAppServerStdioClient(options(fixture));
    try {
      await client.initialize();
      await client.readAccount();
      await client.listModels();
      await prepareThread(client);
      await client.startTurn("synthetic prompt body");
      const request = await client.next();
      assert.equal(request.kind, "tool-handoff");
      await assert.rejects(() => client.next(), /protocol-failure/);
    } finally {
      await client.close();
    }
  }, () => ({ mode: "unresolved-tool" }));
});

test("stdio client bounds an endless accepted post-start audit", async () => {
  await withTemporaryDirectory(async (_directory, fixture) => {
    const client = openAppServerStdioClient(options(fixture));
    try {
      await client.initialize();
      await client.readAccount();
      await client.listModels();
      await prepareThread(client);
      await assert.rejects(() => client.auditUntilIdle(50), /protocol failure/);
    } finally {
      await client.close();
    }
  }, () => ({ mode: "endless-accepted" }));
});

test("stdio client serializes operations and reserves tool responses before writes", async () => {
  await withTemporaryDirectory(async (_directory, fixture) => {
    const client = openAppServerStdioClient(options(fixture));
    try {
      await client.initialize();
      await client.readAccount();
      await client.listModels();
      await prepareThread(client);
      const starting = client.startTurn("synthetic prompt body");
      await assert.rejects(() => client.next(), /protocol failure/);
      await starting;
      const request = await client.next();
      assert.equal(request.kind, "tool-handoff");
      if (request.kind !== "tool-handoff") return;
      const responding = client.respondToDynamicTool(request, {
        success: true,
        contentItems: [{ type: "inputText", text: "fixed synthetic result" }]
      });
      await assert.rejects(() => client.respondToDynamicTool(request, {
        success: true,
        contentItems: []
      }), /protocol failure/);
      await responding;
    } finally {
      await client.close();
    }
  });
});

test("stdio client rejects aggregate tool output before transport serialization", async () => {
  await withTemporaryDirectory(async (_directory, fixture) => {
    const client = openAppServerStdioClient(options(fixture));
    try {
      await client.initialize();
      await client.readAccount();
      await client.listModels();
      await prepareThread(client);
      await client.startTurn("synthetic prompt body");
      const request = await client.next();
      assert.equal(request.kind, "tool-handoff");
      if (request.kind !== "tool-handoff") return;
      const large = "x".repeat(1024 * 1024);
      await assert.rejects(() => client.respondToDynamicTool(request, {
        success: true,
        contentItems: Array.from({ length: 5 }, () => ({ type: "inputText" as const, text: large }))
      }), /protocol failure/);
    } finally {
      await client.close();
    }
  });
});

test("stdio client strips unapproved parent environment values", async () => {
  await withTemporaryDirectory(async (_directory, fixture) => {
    const previous = process.env.GCR_PRIVATE_TEST_SECRET;
    process.env.GCR_PRIVATE_TEST_SECRET = "private inherited value";
    let client;
    try {
      client = openAppServerStdioClient(options(fixture));
    } finally {
      if (previous === undefined) delete process.env.GCR_PRIVATE_TEST_SECRET;
      else process.env.GCR_PRIVATE_TEST_SECRET = previous;
    }
    try {
      await client.initialize();
      await client.readAccount();
    } finally {
      await client.close();
    }
  });
});

test("stdio client fails closed on unexpected MCP traffic", async () => {
  const server = String.raw`
    const readline = require("node:readline");
    const lines = readline.createInterface({ input: process.stdin });
    lines.on("line", (line) => {
      const message = JSON.parse(line);
      if (message.method === "initialize") process.stdout.write(JSON.stringify({ id: message.id, result: { codexHome: "/synthetic", platformFamily: "unix", platformOs: "synthetic", userAgent: "synthetic" } }) + "\n");
      if (message.method === "initialized") process.stdout.write(JSON.stringify({ method: "mcpServer/startupStatus/updated", params: {} }) + "\n");
    });
  `;
  await withTemporaryDirectory(async (_directory, fixture) => {
    const client = openAppServerStdioClient(options(fixture));
    try {
      await client.initialize();
      await assert.rejects(() => client.readAccount(), /candidate rejected/);
    } finally {
      await client.close();
    }
  }, () => ({ server }));
});

test("isolated lifecycle rejects MCP traffic emitted after thread startup", async () => {
  await withTemporaryDirectory(async () => {
    await assert.rejects(() => probeIsolatedAppServerLifecycle({
      clientVersion: "0.1.0-test",
      expectedCliVersion: "0.151.0",
      expectedModel: "gpt-synthetic",
      requestTimeoutMs: 1_000,
      shutdownTimeoutMs: 100,
      tools: [{
        name: "gcr_probe_echo",
        description: "returns a fixed synthetic value",
        inputSchema: { additionalProperties: false, properties: {}, type: "object" }
      }]
    }), /isolated app server lifecycle failure/);
  }, () => ({ mode: "mcp-after-thread" }));
});

test("isolated lifecycle requires the effective file credential store", async () => {
  await withTemporaryDirectory(async () => {
    await assert.rejects(() => probeIsolatedAppServerLifecycle({
      clientVersion: "0.1.0-test",
      expectedCliVersion: "0.151.0",
      expectedModel: "gpt-synthetic",
      requestTimeoutMs: 1_000,
      shutdownTimeoutMs: 100,
      tools: [{
        name: "gcr_probe_echo",
        description: "returns a fixed synthetic value",
        inputSchema: { additionalProperties: false, properties: {}, type: "object" }
      }]
    }), /isolated app server lifecycle failure/);
  }, () => ({ mode: "wrong-credential-store" }));
});

test("isolated lifecycle rejects a signed-in account before any provider turn", async () => {
  await withTemporaryDirectory(async () => {
    await assert.rejects(() => probeIsolatedAppServerLifecycle({
      clientVersion: "0.1.0-test",
      expectedCliVersion: "0.151.0",
      expectedModel: "gpt-synthetic",
      requestTimeoutMs: 1_000,
      shutdownTimeoutMs: 100,
      tools: [{
        name: "gcr_probe_echo",
        description: "returns a fixed synthetic value",
        inputSchema: { additionalProperties: false, properties: {}, type: "object" }
      }]
    }), /isolated app server lifecycle failure/);
  }, () => ({ mode: "signed-in" }));
});

test("stdio client redacts child diagnostics, times out, and terminates its owned child", async () => {
  await withTemporaryDirectory(async (directory, fixture) => {
    const pidPath = path.join(directory, "child.pid");
    const client = openAppServerStdioClient({
      ...options(fixture),
      requestTimeoutMs: 50,
      shutdownTimeoutMs: 50
    });
    let message = "";
    try {
      assert.equal(await waitForFile(pidPath), true);
      await client.initialize();
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : "unknown";
    } finally {
      await client.close();
    }
    assert.equal(message, "app server request timed out");
    assert.equal(message.includes("private diagnostic"), false);
    assert.equal(message.includes("sk-proj-secret"), false);
    const pid = Number(fs.readFileSync(pidPath, "utf8"));
    assert.throws(() => process.kill(pid, 0));
  }, (directory) => ({ mode: path.join(directory, "child.pid"), server: String.raw`
      const fs = require("node:fs");
      fs.writeFileSync(process.argv[1], String(process.pid));
      process.stderr.write("private diagnostic sk-proj-secret\n");
      process.stdin.resume();
      setInterval(() => {}, 1000);
    ` }));
});

test("stdio client coordinates close with an active operation", async () => {
  const server = String.raw`
    const readline = require("node:readline");
    const lines = readline.createInterface({ input: process.stdin });
    lines.on("line", (line) => {
      const message = JSON.parse(line);
      if (message.method === "initialize") setTimeout(() => {
        process.stdout.write(JSON.stringify({ id: message.id, result: { codexHome: "/synthetic", platformFamily: "unix", platformOs: "synthetic", userAgent: "synthetic" } }) + "\n");
      }, 500);
    });
  `;
  await withTemporaryDirectory(async (_directory, fixture) => {
    const client = openAppServerStdioClient({
      ...options(fixture),
      requestTimeoutMs: 1_000,
      shutdownTimeoutMs: 25
    });
    const initializing = client.initialize();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const closing = client.close();
    await assert.rejects(() => initializing, /process failure/);
    await closing;
    await assert.rejects(() => client.readAccount(), /protocol failure/);
  }, () => ({ server }));
});

test("stdio client terminates its owned process group", { skip: process.platform === "win32" }, async () => {
  await withTemporaryDirectory(async (directory, fixture) => {
    const descendantPath = path.join(directory, "descendant.pid");
    const client = openAppServerStdioClient({
      ...options(fixture),
      requestTimeoutMs: 50,
      shutdownTimeoutMs: 50
    });
    try {
      assert.equal(await waitForFile(descendantPath), true);
      await assert.rejects(() => client.initialize(), /timed out/);
    } finally {
      await client.close();
    }
    const descendantPid = Number(fs.readFileSync(descendantPath, "utf8"));
    assert.equal(await waitForProcessExit(descendantPid), true);
  }, (directory) => ({
    mode: path.join(directory, "descendant.pid"),
    server: String.raw`
      const fs = require("node:fs");
      const { spawn } = require("node:child_process");
      const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
      fs.writeFileSync(process.argv[1], String(child.pid));
      process.stdin.resume();
      setInterval(() => {}, 1000);
    `
  }));
});

test("stdio client rejects invalid launch and dynamic result boundaries", async () => {
  await withTemporaryDirectory(async (_directory, fixture) => {
    assert.equal(Object.isFrozen(ISOLATED_APP_SERVER_ARGS), true);
    assert.throws(() => openAppServerStdioClient({ ...options(fixture), cwd: "relative" }), /protocol failure/);
    assert.throws(() => openAppServerStdioClient({
      ...options(fixture),
      command: { executable: process.execPath, args: ["-e", "process.exit(0)"] }
    } as AppServerStdioClientOptions), /protocol failure/);
    assert.throws(() => openAppServerStdioClient({
      ...options(fixture),
      tools: [options(fixture).tools[0] as NonNullable<AppServerStdioClientOptions["tools"]>[number], options(fixture).tools[0] as NonNullable<AppServerStdioClientOptions["tools"]>[number]]
    }), /protocol failure/);
    const privateMessage = "private proxy diagnostic";
    const hostile = new Proxy({}, {
      getPrototypeOf() {
        throw new Error(privateMessage);
      }
    });
    assert.throws(
      () => Reflect.apply(openAppServerStdioClient, undefined, [hostile]),
      (error: unknown) => error instanceof Error
        && error.message === "app server protocol failure"
        && !error.message.includes(privateMessage)
    );
  });
});
