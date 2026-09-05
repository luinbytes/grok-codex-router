import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  probeAuthenticatedAppServer,
  validateDedicatedCodexHome,
  type AuthenticatedProbeOptions
} from "../scripts/probes/app-server-authenticated.js";
import {
  CODEX_SYSTEM_SKILLS_DIRECTORIES,
  CODEX_SYSTEM_SKILLS_FILES
} from "../scripts/probes/codex-home.js";
import { supportsAuthenticatedAppServerPlatform } from "../scripts/probes/codex-process.js";

const EXPECTED_FIXED_ARGS = [
  "app-server",
  "--stdio",
  "--strict-config",
  "-c",
  "notify=[]",
  "-c",
  'cli_auth_credentials_store="file"',
  "-c",
  'history.persistence="none"',
  "-c",
  'web_search="disabled"',
  "-c",
  "tools.web_search=false",
  "--disable",
  "default_mode_request_user_input",
  "--disable",
  "apps",
  "--disable",
  "auth_elicitation",
  "--disable",
  "browser_use",
  "--disable",
  "browser_use_external",
  "--disable",
  "browser_use_full_cdp_access",
  "--disable",
  "code_mode",
  "--disable",
  "computer_use",
  "--disable",
  "image_generation",
  "--disable",
  "goals",
  "--disable",
  "hooks",
  "--disable",
  "memories",
  "--disable",
  "multi_agent",
  "--disable",
  "plugin_sharing",
  "--disable",
  "plugins",
  "--disable",
  "remote_plugin",
  "--disable",
  "request_permissions_tool",
  "--disable",
  "shell_tool",
  "--disable",
  "skill_mcp_dependency_install",
  "--disable",
  "skill_search",
  "--enable",
  "skip_host_skill_discovery",
  "--disable",
  "tool_call_mcp_elicitation",
  "--disable",
  "tool_suggest",
  "--disable",
  "unified_exec",
  "--disable",
  "view_image",
  "--disable",
  "workspace_dependencies"
] as const;

const FAKE_SERVER = String.raw`
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
let threadId = "thread-synthetic";
let turnId = "turn-synthetic";
const mcpName = "private.mcp/name";
const hookKey = "private.hook/path";
const IS_SIGNED_OUT_PREFLIGHT = process.env.CODEX_HOME !== EXPECTED_CODEX_HOME;
function send(value) { process.stdout.write(JSON.stringify(value) + "\n"); }
function record(value) { fs.appendFileSync(AUDIT_PATH, value + "\n"); }
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(EXPECTED_ARGS)) {
  record("invalid-arguments");
  process.exit(7);
}
record("arguments-ok");
function thread(cwd) {
  return { cliVersion: MODE === "wrong-cli-version" ? "0.154.0" : "0.153.4", createdAt: 1, cwd, ephemeral: true, id: threadId,
    modelProvider: "openai", preview: "", projectId: null, sessionId: "session-synthetic",
    source: "vscode", status: { type: "idle" }, threadSource: "appServer", turns: [], updatedAt: 1 };
}
if (MODE === "orphan-exit") {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  fs.writeFileSync(AUDIT_PATH, String(child.pid));
  process.exit(0);
}
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  record(message.method || "response");
  if (message.method === "initialize") {
    if (MODE === "timeout") return;
    if (process.env.GCR_PRIVATE_TEST_SECRET || process.env.OPENAI_API_KEY || !process.env.CODEX_HOME) process.exit(9);
    send({ id: message.id, result: { codexHome: "/private", platformFamily: "unix", platformOs: "synthetic", userAgent: "synthetic" } });
    return;
  }
  if (message.method === "initialized") return;
  if (message.method === "config/read") {
    send({ id: message.id, result: { config: { cli_auth_credentials_store: MODE === "wrong-credential-store" ? "keyring" : "file" }, origins: {} } });
    return;
  }
  if (message.method === "account/read") {
    send({ id: message.id, result: MODE === "signed-out" || IS_SIGNED_OUT_PREFLIGHT
      ? { account: null, requiresOpenaiAuth: true }
      : { account: { email: "private@example.invalid", planType: "plus", type: "chatgpt" }, requiresOpenaiAuth: true } });
    return;
  }
  if (message.method === "model/list") {
    send({ id: message.id, result: { data: [{ defaultReasoningEffort: "high", description: "synthetic", displayName: "Synthetic", hidden: false, id: "model-synthetic", isDefault: true, model: "gpt-synthetic", supportedReasoningEfforts: [{ description: "", reasoningEffort: "high" }] }], nextCursor: null } });
    return;
  }
  if (message.method === "mcpServerStatus/list") {
    const base = { authStatus: "unsupported", name: mcpName, pluginId: null, resourceTemplates: [], resources: [], runtimeStatus: null, serverInfo: null, tools: {} };
    if (message.params.threadId) {
      const status = { ...base, runtimeStatus: MODE === "thread-enabled-mcp" ? "connected" : "disabled" };
      const data = MODE === "thread-extra-mcp" ? [status, { ...status, name: "unexpected-mcp" }] : [status];
      send({ id: message.id, result: { data, nextCursor: null } });
    } else if (MODE === "bad-mcp") send({ id: message.id, result: { data: [{ name: mcpName }], nextCursor: null } });
    else if (MODE === "active-mcp") send({ id: message.id, result: { data: [{ ...base, runtimeStatus: "connected" }], nextCursor: null } });
    else if (MODE === "exposed-mcp") send({ id: message.id, result: { data: [{ ...base, tools: { privateTool: {} } }], nextCursor: null } });
    else if (MODE === "paged-mcp") send({ id: message.id, result: { data: [base], nextCursor: "private-cursor" } });
    else if (MODE === "malformed-mcp") send({ id: message.id, result: { data: {}, nextCursor: null } });
    else send({ id: message.id, result: { data: [base], nextCursor: null } });
    return;
  }
  if (message.method === "hooks/list") {
    if (MODE === "malformed-hooks") {
      send({ id: message.id, result: { data: [] } });
      return;
    }
    const entry = { cwd: message.params.cwds[0], errors: [], hooks: [{ enabled: true, key: hookKey }], warnings: [] };
    if (MODE === "bad-hooks") entry.hooks = [{ name: "private-hook" }];
    if (MODE === "hook-warning") entry.warnings.push("private warning");
    if (MODE === "hook-error") entry.errors.push({ message: "private error" });
    send({ id: message.id, result: { data: [entry] } });
    return;
  }
  if (message.method === "thread/start") {
    const config = message.params.config;
    if (config?.mcp_servers?.[mcpName]?.enabled !== false
      || config?.hooks?.state?.[hookKey]?.enabled !== false
      || config?.features?.hooks !== false
      || config?.features?.plugins !== false) {
      record("invalid-isolation-config");
      process.exit(10);
    }
    const value = thread(message.params.cwd);
    send({ id: message.id, result: { approvalPolicy: "never", approvalsReviewer: "user", cwd: message.params.cwd, model: "gpt-synthetic", modelProvider: "openai", runtimeWorkspaceRoots: [], sandbox: { networkAccess: false, type: "readOnly" }, thread: value } });
    send({ method: "thread/started", params: { thread: value } });
    if (MODE === "mcp-notification") send({ method: "mcpServer/startupStatus/updated", params: {} });
    if (MODE === "hook-notification") send({ method: "hook/started", params: {} });
    return;
  }
  if (message.method === "turn/start") {
    send({ id: message.id, result: { turn: { id: turnId, items: [], status: "inProgress" } } });
    send({ method: "turn/started", params: { threadId, turn: { id: turnId, items: [], status: "inProgress" } } });
    if (MODE === "failed-turn" || MODE === "interrupted-turn") {
      send({ method: "turn/completed", params: { threadId, turn: { id: turnId, items: [], status: MODE === "failed-turn" ? "failed" : "interrupted" } } });
      return;
    }
    const forbiddenTypes = {
      "command-item": "commandExecution",
      "file-item": "fileChange",
      "web-item": "webSearch",
      "unknown-item": "futureBuiltIn"
    };
    if (forbiddenTypes[MODE]) {
      send({ method: "item/started", params: { item: { id: "forbidden", type: forbiddenTypes[MODE] }, startedAtMs: 1, threadId, turnId } });
      return;
    }
    if (MODE === "approval-request") {
      send({ id: "approval-synthetic", method: "execCommandApproval", params: {} });
      return;
    }
    const challenge = MODE === "wrong-arguments" ? "WRONG" : "GCR_AUTH_PROBE_CHALLENGE";
    const item = { arguments: { challenge }, id: "call-synthetic", namespace: null, status: "inProgress", success: null, tool: "gcr_probe_echo", type: "dynamicToolCall" };
    send({ method: "item/started", params: { item, startedAtMs: 1, threadId, turnId } });
    send({ id: "request-synthetic", method: "item/tool/call", params: { arguments: item.arguments, callId: item.id, namespace: null, threadId, tool: item.tool, turnId } });
    if (MODE === "duplicate") send({ id: "request-duplicate", method: "item/tool/call", params: { arguments: item.arguments, callId: "call-duplicate", namespace: null, threadId, tool: item.tool, turnId } });
    if (MODE === "premature-completion") send({ method: "turn/completed", params: { threadId, turn: { id: turnId, items: [], status: "completed" } } });
    return;
  }
  if (message.id === "request-synthetic" && message.result) {
    if (!message.result.success || message.result.contentItems[0]?.text !== "GCR_AUTH_PROBE_OK") process.exit(8);
    const callId = MODE === "wrong-completion" ? "call-wrong" : "call-synthetic";
    const contentItems = MODE === "wrong-output" ? [{ type: "inputText", text: "WRONG" }] : message.result.contentItems;
    const item = { arguments: { challenge: "GCR_AUTH_PROBE_CHALLENGE" }, contentItems, durationMs: 1, id: callId, namespace: null, status: MODE === "failed-dynamic" ? "failed" : "completed", success: MODE === "failed-dynamic" ? false : true, tool: "gcr_probe_echo", type: "dynamicToolCall" };
    send({ method: "item/completed", params: { completedAtMs: 2, item, threadId, turnId } });
    send({ method: "turn/completed", params: { threadId, turn: { id: turnId, items: [item], status: "completed" } } });
    if (MODE === "late-forbidden") send({ method: "mcpServer/startupStatus/updated", params: {} });
    if (MODE === "mutate-home") fs.writeFileSync(require("node:path").join(EXPECTED_CODEX_HOME, "config.toml"), "private=true\n");
    if (MODE === "replace-auth") {
      const path = require("node:path");
      const replacement = path.join(path.dirname(EXPECTED_CODEX_HOME), "replacement-auth.json");
      fs.writeFileSync(replacement, "{}\n", { mode: 0o600 });
      fs.unlinkSync(path.join(EXPECTED_CODEX_HOME, "auth.json"));
      fs.symlinkSync(replacement, path.join(EXPECTED_CODEX_HOME, "auth.json"));
    }
  }
});
`;

function createFakeCodex(directory: string, mode: string, auditPath: string): string {
  const binDirectory = path.join(directory, "bin");
  const codexHome = path.join(directory, "codex-home");
  const executable = path.join(binDirectory, "codex");
  const source = [
    `#!${process.execPath}`,
    `const MODE = ${JSON.stringify(mode)};`,
    `const AUDIT_PATH = ${JSON.stringify(auditPath)};`,
    `const EXPECTED_CODEX_HOME = ${JSON.stringify(codexHome)};`,
    `const EXPECTED_ARGS = ${JSON.stringify(EXPECTED_FIXED_ARGS)};`,
    `if (process.argv.length === 3 && process.argv[2] === "--version") { console.log("codex-cli " + (MODE === "wrong-cli-version" ? "0.154.0" : "0.153.4")); process.exit(0); }`,
    FAKE_SERVER
  ].join("\n");
  fs.writeFileSync(executable, source, { encoding: "utf8", mode: 0o700 });
  const logDirectory = path.join(codexHome, "log");
  const tmpDirectory = path.join(codexHome, "tmp");
  const arg0Directory = path.join(tmpDirectory, "arg0");
  const helperDirectory = path.join(arg0Directory, "codex-arg0SYNTH1");
  fs.mkdirSync(logDirectory, { recursive: true, mode: 0o755 });
  fs.chmodSync(logDirectory, 0o755);
  fs.writeFileSync(path.join(logDirectory, "codex-login.log"), "synthetic login diagnostic\n", { mode: 0o600 });
  fs.chmodSync(path.join(logDirectory, "codex-login.log"), 0o600);
  fs.mkdirSync(arg0Directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(tmpDirectory, 0o755);
  fs.chmodSync(arg0Directory, 0o700);
  fs.mkdirSync(helperDirectory, { recursive: true, mode: 0o755 });
  fs.chmodSync(helperDirectory, 0o755);
  fs.writeFileSync(path.join(helperDirectory, ".lock"), "", { mode: 0o644 });
  fs.chmodSync(path.join(helperDirectory, ".lock"), 0o644);
  for (const helper of ["applypatch", "apply_patch", "codex-execve-wrapper"]) {
    const target = path.join(helperDirectory, helper);
    try { fs.unlinkSync(target); } catch {}
    fs.symlinkSync(executable, target);
  }
  return executable;
}

function withTemporaryDirectory<T>(callback: (directory: string) => Promise<T>): Promise<T> {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(process.cwd()), ".gcr-authenticated-probe-"));
  const binDirectory = path.join(directory, "bin");
  const codexHome = path.join(directory, "codex-home");
  fs.mkdirSync(binDirectory, { mode: 0o700 });
  fs.mkdirSync(codexHome, { mode: 0o700 });
  fs.writeFileSync(path.join(codexHome, ".grok-codex-router-home"), "GCR_CODEX_HOME_V1\n", { mode: 0o600 });
  fs.writeFileSync(path.join(codexHome, "auth.json"), "{}\n", { mode: 0o600 });
  const previousPath = process.env.PATH;
  process.env.PATH = binDirectory + path.delimiter + (previousPath ?? "");
  return callback(directory).finally(() => {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  });
}

function options(executable: string): AuthenticatedProbeOptions {
  const directory = path.dirname(path.dirname(executable));
  return {
    clientVersion: "0.1.0-test",
    codexHome: path.join(directory, "codex-home"),
    expectedModel: "gpt-synthetic",
    requestTimeoutMs: 2_000,
    shutdownTimeoutMs: 100
  };
}

function createSystemSkillsFixture(codexHome: string): string {
  const system = path.join(codexHome, "skills", ".system");
  fs.mkdirSync(system, { recursive: true, mode: 0o755 });
  fs.chmodSync(path.join(codexHome, "skills"), 0o755);
  fs.chmodSync(system, 0o755);
  for (const relative of CODEX_SYSTEM_SKILLS_DIRECTORIES) {
    const target = path.join(system, relative);
    fs.mkdirSync(target, { recursive: true, mode: 0o755 });
    fs.chmodSync(target, 0o755);
  }
  for (const relative of CODEX_SYSTEM_SKILLS_FILES) {
    const target = path.join(system, relative);
    fs.writeFileSync(target, "synthetic system skill fixture\n", { mode: 0o644 });
    fs.chmodSync(target, 0o644);
  }
  return system;
}

const supportedPlatform = supportsAuthenticatedAppServerPlatform(process.platform);

test("authenticated probe uses the fixed launch, safe preflights, and one identity-preserving tool round-trip", { skip: !supportedPlatform }, async () => {
  await withTemporaryDirectory(async (directory) => {
    const auditPath = path.join(directory, "methods.log");
    const executable = createFakeCodex(directory, "success", auditPath);
    const executableSha256 = crypto.createHash("sha256").update(fs.readFileSync(executable)).digest("hex");
    const previous = {
      secret: process.env.GCR_PRIVATE_TEST_SECRET,
      key: process.env.OPENAI_API_KEY,
      home: process.env.CODEX_HOME
    };
    process.env.GCR_PRIVATE_TEST_SECRET = "private-sentinel";
    process.env.OPENAI_API_KEY = "sk-test-sentinel";
    process.env.CODEX_HOME = "/private/sentinel";
    const receipt = await (async () => {
      try {
        return await probeAuthenticatedAppServer(options(executable));
      } finally {
        if (previous.secret === undefined) delete process.env.GCR_PRIVATE_TEST_SECRET; else process.env.GCR_PRIVATE_TEST_SECRET = previous.secret;
        if (previous.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.key;
        if (previous.home === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previous.home;
      }
    })();
    assert.deepEqual(receipt, {
      candidate: "app-server-dynamic",
      codexCliVersion: "0.153.4",
      codexCliSha256: executableSha256,
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
    });
    const serialized = JSON.stringify(receipt);
    for (const privateValue of ["private@example.invalid", "/private", "private.mcp/name", "private.hook/path", "gpt-synthetic", "GCR_AUTH_PROBE_CHALLENGE", "GCR_AUTH_PROBE_OK", "request-synthetic", "call-synthetic"]) {
      assert.equal(serialized.includes(privateValue), false);
    }
    assert.deepEqual(fs.readFileSync(auditPath, "utf8").trim().split("\n"), [
      "arguments-ok", "initialize", "initialized", "config/read", "account/read", "model/list",
      "mcpServerStatus/list", "hooks/list", "thread/start", "mcpServerStatus/list",
      "arguments-ok", "initialize", "initialized", "config/read", "account/read", "model/list",
      "mcpServerStatus/list", "hooks/list", "thread/start", "mcpServerStatus/list", "turn/start", "response"
    ]);
  });
});

test("authenticated probe rejects unsafe preflight and turn states with one public error", { skip: !supportedPlatform }, async () => {
  await withTemporaryDirectory(async (directory) => {
    const modes = [
      "signed-out", "bad-mcp", "active-mcp", "exposed-mcp", "paged-mcp", "malformed-mcp", "thread-enabled-mcp", "thread-extra-mcp", "bad-hooks", "hook-warning",
      "hook-error", "malformed-hooks", "wrong-cli-version", "wrong-credential-store", "duplicate", "wrong-arguments", "wrong-completion",
      "wrong-output", "failed-dynamic", "premature-completion", "failed-turn", "interrupted-turn", "command-item",
      "file-item", "web-item", "unknown-item", "approval-request", "late-forbidden", "timeout", "mutate-home", "replace-auth"
    ];
    for (const mode of modes) {
      const auditPath = path.join(directory, mode + ".log");
      const executable = createFakeCodex(directory, mode, auditPath);
      await assert.rejects(
        () => probeAuthenticatedAppServer({ ...options(executable), requestTimeoutMs: mode === "timeout" ? 100 : 2_000 }),
        (error: unknown) => error instanceof Error && error.message === "authenticated app server probe failed"
      );
    }
  });
});

test("authenticated probe audits MCP and hook traffic before starting a provider turn", { skip: !supportedPlatform }, async () => {
  await withTemporaryDirectory(async (directory) => {
    for (const mode of ["mcp-notification", "hook-notification", "thread-enabled-mcp", "thread-extra-mcp"]) {
      const auditPath = path.join(directory, mode + ".log");
      const executable = createFakeCodex(directory, mode, auditPath);
      await assert.rejects(() => probeAuthenticatedAppServer(options(executable)), /authenticated app server probe failed/);
      const methods = fs.readFileSync(auditPath, "utf8").trim().split("\n");
      assert.equal(methods.includes("turn/start"), false);
    }
    for (const mode of ["active-mcp", "exposed-mcp", "paged-mcp", "hook-warning", "hook-error"]) {
      const auditPath = path.join(directory, mode + "-early.log");
      const executable = createFakeCodex(directory, mode, auditPath);
      await assert.rejects(() => probeAuthenticatedAppServer(options(executable)), /authenticated app server probe failed/);
      const methods = fs.readFileSync(auditPath, "utf8").trim().split("\n");
      assert.equal(methods.includes("thread/start"), false);
      assert.equal(methods.includes("turn/start"), false);
    }
  });
});

test("authenticated probe requires a private, owned, real dedicated Codex home", { skip: !supportedPlatform }, async () => {
  await withTemporaryDirectory(async (directory) => {
    const auditPath = path.join(directory, "home-boundary.log");
    const executable = createFakeCodex(directory, "success", auditPath);
    const insecure = path.join(directory, "insecure-home");
    fs.mkdirSync(insecure, { mode: 0o700 });
    fs.chmodSync(insecure, 0o755);
    fs.writeFileSync(path.join(insecure, ".grok-codex-router-home"), "GCR_CODEX_HOME_V1\n", { mode: 0o600 });
    const missing = path.join(directory, "missing-home");
    const linked = path.join(directory, "linked-home");
    const unmarked = path.join(directory, "unmarked-home");
    fs.mkdirSync(unmarked, { mode: 0o700 });
    const oversizedMarker = path.join(directory, "oversized-marker-home");
    fs.mkdirSync(oversizedMarker, { mode: 0o700 });
    fs.writeFileSync(path.join(oversizedMarker, ".grok-codex-router-home"), "GCR_CODEX_HOME_V1\nextra", { mode: 0o600 });
    const configured = path.join(directory, "configured-home");
    fs.mkdirSync(configured, { mode: 0o700 });
    fs.writeFileSync(path.join(configured, ".grok-codex-router-home"), "GCR_CODEX_HOME_V1\n", { mode: 0o600 });
    fs.writeFileSync(path.join(configured, "auth.json"), "{}\n", { mode: 0o600 });
    fs.writeFileSync(path.join(configured, "config.toml"), "[mcp_servers.private]\n");
    const missingAuth = path.join(directory, "missing-auth-home");
    fs.mkdirSync(missingAuth, { mode: 0o700 });
    fs.writeFileSync(path.join(missingAuth, ".grok-codex-router-home"), "GCR_CODEX_HOME_V1\n", { mode: 0o600 });
    const insecureAuth = path.join(directory, "insecure-auth-home");
    fs.mkdirSync(insecureAuth, { mode: 0o700 });
    fs.writeFileSync(path.join(insecureAuth, ".grok-codex-router-home"), "GCR_CODEX_HOME_V1\n", { mode: 0o600 });
    fs.writeFileSync(path.join(insecureAuth, "auth.json"), "{}\n", { mode: 0o644 });
    fs.chmodSync(path.join(insecureAuth, "auth.json"), 0o644);
    const emptyAuth = path.join(directory, "empty-auth-home");
    fs.mkdirSync(emptyAuth, { mode: 0o700 });
    fs.writeFileSync(path.join(emptyAuth, ".grok-codex-router-home"), "GCR_CODEX_HOME_V1\n", { mode: 0o600 });
    fs.writeFileSync(path.join(emptyAuth, "auth.json"), "", { mode: 0o600 });
    const linkedAuth = path.join(directory, "linked-auth-home");
    fs.mkdirSync(linkedAuth, { mode: 0o700 });
    fs.writeFileSync(path.join(linkedAuth, ".grok-codex-router-home"), "GCR_CODEX_HOME_V1\n", { mode: 0o600 });
    fs.symlinkSync(path.join(insecureAuth, "auth.json"), path.join(linkedAuth, "auth.json"));
    const hardlinkedAuth = path.join(directory, "hardlinked-auth-home");
    fs.mkdirSync(hardlinkedAuth, { mode: 0o700 });
    fs.writeFileSync(path.join(hardlinkedAuth, ".grok-codex-router-home"), "GCR_CODEX_HOME_V1\n", { mode: 0o600 });
    const authSource = path.join(directory, "auth-source.json");
    fs.writeFileSync(authSource, "{}\n", { mode: 0o600 });
    fs.linkSync(authSource, path.join(hardlinkedAuth, "auth.json"));
    const denseHome = path.join(directory, "dense-home");
    fs.mkdirSync(denseHome, { mode: 0o700 });
    fs.writeFileSync(path.join(denseHome, ".grok-codex-router-home"), "GCR_CODEX_HOME_V1\n", { mode: 0o600 });
    fs.writeFileSync(path.join(denseHome, "auth.json"), "{}\n", { mode: 0o600 });
    for (let index = 0; index < 1024; index += 1) {
      fs.writeFileSync(path.join(denseHome, "entry-" + index), "", { mode: 0o600 });
    }
    const nonemptySkills = path.join(directory, "nonempty-skills-home");
    fs.mkdirSync(nonemptySkills, { mode: 0o700 });
    fs.writeFileSync(path.join(nonemptySkills, ".grok-codex-router-home"), "GCR_CODEX_HOME_V1\n", { mode: 0o600 });
    fs.writeFileSync(path.join(nonemptySkills, "auth.json"), "{}\n", { mode: 0o600 });
    fs.mkdirSync(path.join(nonemptySkills, "skills"), { mode: 0o755 });
    fs.writeFileSync(path.join(nonemptySkills, "skills", "injected.md"), "private instructions\n", { mode: 0o600 });
    const linkedEntry = path.join(directory, "linked-entry-home");
    fs.mkdirSync(linkedEntry, { mode: 0o700 });
    fs.writeFileSync(path.join(linkedEntry, ".grok-codex-router-home"), "GCR_CODEX_HOME_V1\n", { mode: 0o600 });
    fs.writeFileSync(path.join(linkedEntry, "auth.json"), "{}\n", { mode: 0o600 });
    fs.symlinkSync(path.join(directory, "auth-source.json"), path.join(linkedEntry, "state_5.sqlite"));
    fs.symlinkSync(directory, linked, "dir");
    for (const codexHome of [insecure, missing, linked, unmarked, oversizedMarker, configured, missingAuth, insecureAuth, emptyAuth, linkedAuth, hardlinkedAuth, denseHome, nonemptySkills, linkedEntry]) {
      await assert.rejects(
        () => probeAuthenticatedAppServer({ ...options(executable), codexHome }),
        (error: unknown) => error instanceof Error && error.message === "authenticated app server probe failed"
      );
    }
    assert.equal(fs.existsSync(auditPath), false);
  });
});

test("authenticated probe reuses only the pinned Codex runtime layout", { skip: !supportedPlatform }, async () => {
  await withTemporaryDirectory(async (directory) => {
    const auditPath = path.join(directory, "reusable-home.log");
    const executable = createFakeCodex(directory, "success", auditPath);
    const codexHome = options(executable).codexHome;
    fs.writeFileSync(path.join(codexHome, "installation_id"), "installation-synthetic\n", { mode: 0o644 });
    for (const name of ["goals_1.sqlite", "logs_2.sqlite-shm", "memories_1.sqlite-wal", "queue_1.sqlite", "state_5.sqlite"]) {
      fs.writeFileSync(path.join(codexHome, name), "", { mode: 0o644 });
    }
    fs.mkdirSync(path.join(codexHome, "tmp"), { mode: 0o755, recursive: true });
    const receipt = await probeAuthenticatedAppServer(options(executable));
    assert.equal(receipt.dynamicToolRoundTrip, "passed");
  });
});

test("dedicated Codex home accepts the observed 0.153.4 helper layout and rejects drift", { skip: !supportedPlatform }, async () => {
  await withTemporaryDirectory(async (directory) => {
    const executable = createFakeCodex(directory, "success", path.join(directory, "layout.log"));
    const codexHome = options(executable).codexHome;
    const trustedExecutable = fs.realpathSync(executable);
    validateDedicatedCodexHome(codexHome, trustedExecutable);

    const system = createSystemSkillsFixture(codexHome);
    validateDedicatedCodexHome(codexHome, trustedExecutable);
    fs.mkdirSync(path.join(codexHome, "skills", "injected"), { mode: 0o755 });
    assert.throws(() => validateDedicatedCodexHome(codexHome, trustedExecutable), /authenticated app server probe failed/);
    fs.rmdirSync(path.join(codexHome, "skills", "injected"));
    const driftedSkill = path.join(system, "imagegen", "SKILL.md");
    fs.unlinkSync(driftedSkill);
    assert.throws(() => validateDedicatedCodexHome(codexHome, trustedExecutable), /authenticated app server probe failed/);
    fs.writeFileSync(driftedSkill, "synthetic system skill fixture\n", { mode: 0o644 });
    fs.chmodSync(driftedSkill, 0o644);

    const linkedSkill = path.join(system, "imagegen", "LICENSE.txt");
    fs.unlinkSync(linkedSkill);
    fs.symlinkSync(path.join(directory, "outside-skill"), linkedSkill);
    assert.throws(() => validateDedicatedCodexHome(codexHome, trustedExecutable), /authenticated app server probe failed/);
    fs.unlinkSync(linkedSkill);
    fs.writeFileSync(linkedSkill, "synthetic system skill fixture\n", { mode: 0o644 });
    fs.chmodSync(linkedSkill, 0o644);

    const oversizedSkill = path.join(system, "openai-docs", "SKILL.md");
    fs.writeFileSync(oversizedSkill, Buffer.alloc(512 * 1024 + 1, 0x78), { mode: 0o644 });
    assert.throws(() => validateDedicatedCodexHome(codexHome, trustedExecutable), /authenticated app server probe failed/);
    fs.writeFileSync(oversizedSkill, "synthetic system skill fixture\n", { mode: 0o644 });
    fs.chmodSync(oversizedSkill, 0o644);

    const log = path.join(codexHome, "log", "codex-login.log");
    fs.chmodSync(log, 0o644);
    assert.throws(() => validateDedicatedCodexHome(codexHome, trustedExecutable), /authenticated app server probe failed/);
    fs.chmodSync(log, 0o600);

    const helperDirectory = path.join(codexHome, "tmp", "arg0", "codex-arg0SYNTH1");
    const helper = path.join(helperDirectory, "applypatch");
    fs.unlinkSync(helper);
    fs.symlinkSync(path.join(directory, "not-the-codex"), helper);
    assert.throws(() => validateDedicatedCodexHome(codexHome, trustedExecutable), /authenticated app server probe failed/);
    fs.unlinkSync(helper);
    fs.symlinkSync(executable, helper);

    fs.rmSync(helperDirectory, { recursive: true, force: true });
    assert.doesNotThrow(() => validateDedicatedCodexHome(codexHome, trustedExecutable));

    const arg0Directory = path.join(codexHome, "tmp", "arg0");
    fs.writeFileSync(path.join(arg0Directory, "unexpected"), "", { mode: 0o600 });
    assert.throws(() => validateDedicatedCodexHome(codexHome, trustedExecutable), /authenticated app server probe failed/);
  });
});

test("authenticated probe removes an orphaned descendant after its direct child exits", { skip: !supportedPlatform }, async () => {
  await withTemporaryDirectory(async (directory) => {
    const pidPath = path.join(directory, "descendant.pid");
    const executable = createFakeCodex(directory, "orphan-exit", pidPath);
    await assert.rejects(
      () => probeAuthenticatedAppServer({ ...options(executable), requestTimeoutMs: 2_000, shutdownTimeoutMs: 100 }),
      /authenticated app server probe failed/
    );
    const pid = Number(fs.readFileSync(pidPath, "utf8"));
    assert.throws(() => process.kill(pid, 0));
  });
});

test("authenticated probe supports only Darwin and Linux process ownership", () => {
  assert.equal(supportsAuthenticatedAppServerPlatform("darwin"), true);
  assert.equal(supportsAuthenticatedAppServerPlatform("linux"), true);
  for (const platform of ["aix", "android", "freebsd", "openbsd", "sunos", "win32"] as const) {
    assert.equal(supportsAuthenticatedAppServerPlatform(platform), false);
  }
});
