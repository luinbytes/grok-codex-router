import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  MAX_APP_SERVER_LINE_BYTES,
  createBoundedJsonlDecoder,
  openAppServerStdioClient,
  probeIsolatedAppServerLifecycle,
  type AppServerStdioClientOptions
} from "../scripts/probes/app-server-stdio.js";
import { supportsIsolatedProcessTree } from "../scripts/probes/codex-process.js";

const FAKE_SERVER = String.raw`
const readline = require("node:readline");
if (process.env.GCR_PRIVATE_TEST_SECRET) throw new Error("private environment inherited");
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const notificationsFirst = process.argv[1] === "notifications-first";
const completesWithOutstandingTool = process.argv[1] === "unresolved-tool";
const emitsLateMcp = process.argv[1] === "mcp-after-thread";
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
  if (message.method === "account/read") {
    send({ id: message.id, result: { account: { email: "private@example.invalid", planType: "plus", type: "chatgpt" }, requiresOpenaiAuth: false } });
    return;
  }
  if (message.method === "model/list") {
    send({ id: message.id, result: { data: [{ defaultReasoningEffort: "high", description: "synthetic", displayName: "Synthetic", hidden: false, id: "model-synthetic", isDefault: true, model: "gpt-synthetic", supportedReasoningEfforts: [{ description: "", reasoningEffort: "high" }] }], nextCursor: null } });
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

function options(directory: string, server = FAKE_SERVER): AppServerStdioClientOptions {
  return {
    command: { executable: process.execPath, args: ["-e", server] },
    clientVersion: "0.1.0-test",
    codexHome: directory,
    cwd: directory,
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

async function withTemporaryDirectory<T>(callback: (directory: string) => Promise<T>): Promise<T> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gcr-app-server-stdio-"));
  try {
    return await callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
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

test("bounded JSONL decoder accepts fragmented UTF-8 and CRLF frames", () => {
  const decoder = createBoundedJsonlDecoder();
  const bytes = Buffer.from('{"value":"snowman ☃"}\r\n{"second":true}\n', "utf8");
  const split = bytes.indexOf(Buffer.from("☃")) + 1;
  assert.deepEqual(decoder.push(bytes.subarray(0, split)), []);
  assert.deepEqual(decoder.push(bytes.subarray(split)), [{ value: "snowman ☃" }, { second: true }]);
  decoder.finish();
  decoder.finish();
});

test("live probes reject platforms without owned process-tree containment", () => {
  assert.equal(supportsIsolatedProcessTree("win32"), false);
  assert.equal(supportsIsolatedProcessTree("darwin"), true);
  assert.equal(supportsIsolatedProcessTree("linux"), true);
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
  await withTemporaryDirectory(async (directory) => {
    const receipt = await probeIsolatedAppServerLifecycle({
      clientVersion: "0.1.0-test",
      command: { executable: process.execPath, args: ["-e", FAKE_SERVER] },
      expectedModel: "gpt-synthetic",
      tools: [{
        name: "gcr_probe_echo",
        description: "returns a fixed synthetic value",
        inputSchema: { additionalProperties: false, properties: {}, type: "object" }
      }]
    });
    assert.deepEqual(receipt, {
      candidate: "app-server-dynamic",
      protocol: "stdio-jsonl",
      authenticationOwner: "codex",
      authenticationStatus: "signed-in",
      modelStatus: "available",
      threadPolicy: "ephemeral-read-only-no-network",
      threadStart: "accepted",
      postStartAudit: "quiet",
      directProcess: "closed",
      releaseEligibility: "blocked"
    });
    const serialized = JSON.stringify(receipt);
    for (const forbidden of ["private@example.invalid", "/synthetic/codex", directory, "gpt-synthetic", "thread-server-generated"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });
});

test("stdio client preserves dynamic request identity and records Grok execution", async () => {
  await withTemporaryDirectory(async (directory) => {
    const client = openAppServerStdioClient(options(directory));
    try {
      await client.initialize();
      assert.equal(await client.readAccount(), "signed-in");
      assert.equal(await client.listModels(), "model-available");
      await client.startThread();
      await client.startTurn("synthetic prompt body");
      const request = await client.next();
      assert.equal(request.kind, "tool-handoff");
      if (request.kind !== "tool-handoff") return;
      assert.equal(request.requestId, "request-server-generated");
      assert.equal(request.callId, "call-server-generated");
      assert.equal(request.executor, "grok");
      const result = await client.respondToDynamicTool(request.requestId, {
        success: true,
        contentItems: [{ type: "inputText", text: "fixed synthetic result" }]
      });
      assert.deepEqual(result, { kind: "tool-result", callId: "call-server-generated", executor: "grok" });
      await assert.rejects(() => client.respondToDynamicTool(request.requestId, { success: true, contentItems: [] }), /protocol failure/);
      const completed = await client.next();
      assert.deepEqual(completed, { kind: "events", events: [{ kind: "completed" }] });
    } finally {
      await client.close();
    }
  });
});

test("stdio client reconciles lifecycle notifications that precede responses", async () => {
  await withTemporaryDirectory(async (directory) => {
    const client = openAppServerStdioClient({
      ...options(directory),
      command: { executable: process.execPath, args: ["-e", FAKE_SERVER, "notifications-first"] }
    });
    try {
      await client.initialize();
      await client.readAccount();
      await client.listModels();
      await client.startThread();
      await client.startTurn("synthetic prompt body");
      const request = await client.next();
      assert.equal(request.kind, "tool-handoff");
    } finally {
      await client.close();
    }
  });
});

test("stdio client rejects turn completion while a tool request is unresolved", async () => {
  await withTemporaryDirectory(async (directory) => {
    const client = openAppServerStdioClient({
      ...options(directory),
      command: { executable: process.execPath, args: ["-e", FAKE_SERVER, "unresolved-tool"] }
    });
    try {
      await client.initialize();
      await client.readAccount();
      await client.listModels();
      await client.startThread();
      await client.startTurn("synthetic prompt body");
      const request = await client.next();
      assert.equal(request.kind, "tool-handoff");
      await assert.rejects(() => client.next(), /protocol-failure/);
    } finally {
      await client.close();
    }
  });
});

test("stdio client serializes operations and reserves tool responses before writes", async () => {
  await withTemporaryDirectory(async (directory) => {
    const client = openAppServerStdioClient(options(directory));
    try {
      await client.initialize();
      await client.readAccount();
      await client.listModels();
      await client.startThread();
      const starting = client.startTurn("synthetic prompt body");
      await assert.rejects(() => client.next(), /protocol failure/);
      await starting;
      const request = await client.next();
      assert.equal(request.kind, "tool-handoff");
      if (request.kind !== "tool-handoff") return;
      const responding = client.respondToDynamicTool(request.requestId, {
        success: true,
        contentItems: [{ type: "inputText", text: "fixed synthetic result" }]
      });
      await assert.rejects(() => client.respondToDynamicTool(request.requestId, {
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
  await withTemporaryDirectory(async (directory) => {
    const client = openAppServerStdioClient(options(directory));
    try {
      await client.initialize();
      await client.readAccount();
      await client.listModels();
      await client.startThread();
      await client.startTurn("synthetic prompt body");
      const request = await client.next();
      assert.equal(request.kind, "tool-handoff");
      if (request.kind !== "tool-handoff") return;
      const large = "x".repeat(1024 * 1024);
      await assert.rejects(() => client.respondToDynamicTool(request.requestId, {
        success: true,
        contentItems: Array.from({ length: 5 }, () => ({ type: "inputText" as const, text: large }))
      }), /protocol failure/);
    } finally {
      await client.close();
    }
  });
});

test("stdio client strips unapproved parent environment values", async () => {
  await withTemporaryDirectory(async (directory) => {
    const previous = process.env.GCR_PRIVATE_TEST_SECRET;
    process.env.GCR_PRIVATE_TEST_SECRET = "private inherited value";
    let client;
    try {
      client = openAppServerStdioClient(options(directory));
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
  await withTemporaryDirectory(async (directory) => {
    const client = openAppServerStdioClient(options(directory, server));
    try {
      await client.initialize();
      await assert.rejects(() => client.readAccount(), /candidate rejected/);
    } finally {
      await client.close();
    }
  });
});

test("isolated lifecycle rejects MCP traffic emitted after thread startup", async () => {
  await assert.rejects(() => probeIsolatedAppServerLifecycle({
    clientVersion: "0.1.0-test",
    command: { executable: process.execPath, args: ["-e", FAKE_SERVER, "mcp-after-thread"] },
    expectedModel: "gpt-synthetic",
    requestTimeoutMs: 1_000,
    shutdownTimeoutMs: 100,
    tools: [{
      name: "gcr_probe_echo",
      description: "returns a fixed synthetic value",
      inputSchema: { additionalProperties: false, properties: {}, type: "object" }
    }]
  }), /isolated app server lifecycle failure/);
});

test("stdio client redacts child diagnostics, times out, and terminates its owned child", async () => {
  await withTemporaryDirectory(async (directory) => {
    const pidPath = path.join(directory, "child.pid");
    const server = String.raw`
      const fs = require("node:fs");
      fs.writeFileSync(process.argv[1], String(process.pid));
      process.stderr.write("private diagnostic sk-proj-secret\n");
      process.stdin.resume();
      setInterval(() => {}, 1000);
    `;
    const client = openAppServerStdioClient({
      ...options(directory),
      command: { executable: process.execPath, args: ["-e", server, pidPath] },
      requestTimeoutMs: 50,
      shutdownTimeoutMs: 50
    });
    let message = "";
    try {
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
  });
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
  await withTemporaryDirectory(async (directory) => {
    const client = openAppServerStdioClient({
      ...options(directory, server),
      requestTimeoutMs: 1_000,
      shutdownTimeoutMs: 25
    });
    const initializing = client.initialize();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const closing = client.close();
    await assert.rejects(() => initializing, /process failure/);
    await closing;
    await assert.rejects(() => client.readAccount(), /protocol failure/);
  });
});

test("stdio client terminates its owned process group", { skip: process.platform === "win32" }, async () => {
  await withTemporaryDirectory(async (directory) => {
    const descendantPath = path.join(directory, "descendant.pid");
    const server = String.raw`
      const fs = require("node:fs");
      const { spawn } = require("node:child_process");
      const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
      fs.writeFileSync(process.argv[1], String(child.pid));
      process.stdin.resume();
      setInterval(() => {}, 1000);
    `;
    const client = openAppServerStdioClient({
      ...options(directory),
      command: { executable: process.execPath, args: ["-e", server, descendantPath] },
      requestTimeoutMs: 50,
      shutdownTimeoutMs: 50
    });
    try {
      await assert.rejects(() => client.initialize(), /timed out/);
    } finally {
      await client.close();
    }
    const descendantPid = Number(fs.readFileSync(descendantPath, "utf8"));
    assert.equal(await waitForProcessExit(descendantPid), true);
  });
});

test("stdio client rejects invalid launch and dynamic result boundaries", async () => {
  await withTemporaryDirectory(async (directory) => {
    assert.throws(() => openAppServerStdioClient({ ...options(directory), cwd: "relative" }), /protocol failure/);
    assert.throws(() => openAppServerStdioClient({
      ...options(directory),
      tools: [options(directory).tools[0] as NonNullable<AppServerStdioClientOptions["tools"]>[number], options(directory).tools[0] as NonNullable<AppServerStdioClientOptions["tools"]>[number]]
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
