import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  inspectAppServerSchemaDirectories,
  probeInstalledAppServerSchemas
} from "../scripts/probes/app-server-schema.js";

function withSchemaDirectories<T>(callback: (stable: string, experimental: string) => T): T {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gcr-schema-test-"));
  const stable = path.join(root, "stable");
  const experimental = path.join(root, "experimental");
  try {
    for (const directory of [stable, experimental]) fs.mkdirSync(path.join(directory, "v2"), { recursive: true });
    return callback(stable, experimental);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
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

function writeSchemas(stable: string, experimental: string): { readonly stableBundle: Buffer; readonly experimentalBundle: Buffer } {
  const stableBundle = Buffer.from(JSON.stringify({ definitions: {}, title: "CodexAppServerProtocolV2", type: "object" }) + "\n");
  const experimentalBundle = Buffer.from(JSON.stringify({ definitions: {}, title: "CodexAppServerProtocolV2", type: "object" }) + "\n");
  fs.writeFileSync(path.join(stable, "codex_app_server_protocol.v2.schemas.json"), stableBundle);
  fs.writeFileSync(path.join(experimental, "codex_app_server_protocol.v2.schemas.json"), experimentalBundle);
  fs.writeFileSync(path.join(stable, "v2", "ThreadStartParams.json"), JSON.stringify({ properties: { model: { type: "string" } } }));
  fs.writeFileSync(path.join(experimental, "v2", "ThreadStartParams.json"), JSON.stringify({ properties: {
    dynamicTools: { default: null, items: { $ref: "#/definitions/DynamicToolSpec" }, type: ["array", "null"] },
    model: { type: "string" }
  } }));
  return { stableBundle, experimentalBundle };
}

test("schema inspector records version-derived hashes and the experimental boundary", () => {
  withSchemaDirectories((stable, experimental) => {
    const bundles = writeSchemas(stable, experimental);
    assert.deepEqual(inspectAppServerSchemaDirectories(stable, experimental, "0.151.0"), {
      protocolVersion: "v2",
      cliVersion: "0.151.0",
      stableBundleSha256: crypto.createHash("sha256").update(bundles.stableBundle).digest("hex"),
      experimentalBundleSha256: crypto.createHash("sha256").update(bundles.experimentalBundle).digest("hex"),
      stableDynamicTools: false,
      experimentalDynamicTools: true,
      releaseEligibility: "blocked"
    });
  });
});

test("schema inspector fails closed on drift, malformed files, symlinks, and versions", () => {
  withSchemaDirectories((stable, experimental) => {
    writeSchemas(stable, experimental);
    assert.throws(() => inspectAppServerSchemaDirectories(stable, experimental, "not-a-version"), /schema probe failure/);

    fs.writeFileSync(path.join(stable, "v2", "ThreadStartParams.json"), JSON.stringify({ properties: { dynamicTools: {} } }));
    assert.throws(() => inspectAppServerSchemaDirectories(stable, experimental, "0.151.0"), /schema probe failure/);

    fs.writeFileSync(path.join(stable, "v2", "ThreadStartParams.json"), "not-json");
    assert.throws(() => inspectAppServerSchemaDirectories(stable, experimental, "0.151.0"), /schema probe failure/);

    writeSchemas(stable, experimental);
    fs.writeFileSync(path.join(experimental, "v2", "ThreadStartParams.json"), JSON.stringify({ properties: {
      dynamicTools: false
    } }));
    assert.throws(() => inspectAppServerSchemaDirectories(stable, experimental, "0.151.0"), /schema probe failure/);

    writeSchemas(stable, experimental);
    fs.writeFileSync(path.join(experimental, "codex_app_server_protocol.v2.schemas.json"), "not-json");
    assert.throws(() => inspectAppServerSchemaDirectories(stable, experimental, "0.151.0"), /schema probe failure/);

    writeSchemas(stable, experimental);
    fs.unlinkSync(path.join(stable, "codex_app_server_protocol.v2.schemas.json"));
    fs.symlinkSync(path.join(experimental, "codex_app_server_protocol.v2.schemas.json"), path.join(stable, "codex_app_server_protocol.v2.schemas.json"));
    assert.throws(() => inspectAppServerSchemaDirectories(stable, experimental, "0.151.0"), /schema probe failure/);
  });
});

test("installed schema probe rejects invalid options without exposing their values", async () => {
  const secret = "sk-proj-private-command";
  let message = "";
  try {
    await probeInstalledAppServerSchemas({ timeoutMs: 0, privateValue: secret } as { timeoutMs: number });
  } catch (error: unknown) {
    message = error instanceof Error ? error.message : "unknown";
  }
  assert.equal(message, "app server schema probe failure");
  assert.equal(message.includes(secret), false);
});

test("installed schema probe terminates descendants of a timed-out wrapper", { skip: process.platform === "win32" }, async () => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "gcr-schema-process-test-"));
  const executable = path.join(directory, "codex");
  const pidFile = path.join(directory, "descendant.pid");
  const wrapper = `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
fs.writeFileSync(path.join(__dirname, "descendant.pid"), String(child.pid));
setInterval(() => {}, 1000);
`;
  const previousPath = process.env.PATH;
  try {
    fs.writeFileSync(executable, wrapper, { mode: 0o700 });
    process.env.PATH = directory;
    await assert.rejects(() => probeInstalledAppServerSchemas({ timeoutMs: 2_000 }), /schema probe failure/);
    const descendantPid = Number(fs.readFileSync(pidFile, "utf8"));
    assert.equal(await waitForProcessExit(descendantPid), true);
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("installed schema probe proves successful schema child groups are closed", { skip: process.platform === "win32" }, async () => {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "gcr-schema-success-test-"));
  const executable = path.join(directory, "codex");
  const pidFile = path.join(directory, "descendants.pid");
  const wrapper = `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.151.0\\n");
  process.exit(0);
}
const outputIndex = process.argv.indexOf("--out");
if (outputIndex < 0 || !process.argv[outputIndex + 1]) process.exit(2);
const output = process.argv[outputIndex + 1];
const experimental = process.argv.includes("--experimental");
fs.mkdirSync(path.join(output, "v2"), { recursive: true });
fs.writeFileSync(path.join(output, "codex_app_server_protocol.v2.schemas.json"), JSON.stringify({ definitions: {}, title: "CodexAppServerProtocolV2", type: "object" }) + "\\n");
const properties = experimental
  ? { dynamicTools: { default: null, items: { $ref: "#/definitions/DynamicToolSpec" }, type: ["array", "null"] }, model: { type: "string" } }
  : { model: { type: "string" } };
fs.writeFileSync(path.join(output, "v2", "ThreadStartParams.json"), JSON.stringify({ properties }));
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
fs.appendFileSync(${JSON.stringify(pidFile)}, String(child.pid) + "\\n");
process.exit(0);
`;
  const previousPath = process.env.PATH;
  try {
    fs.writeFileSync(executable, wrapper, { mode: 0o700 });
    process.env.PATH = directory;
    const receipt = await probeInstalledAppServerSchemas({ timeoutMs: 2_000 });
    assert.equal(receipt.cliVersion, "0.151.0");
    assert.match(receipt.codexCliSha256 ?? "", /^[a-f0-9]{64}$/);
    assert.equal(receipt.processContainment, "same-process-group-only");
    const pids = fs.readFileSync(pidFile, "utf8").trim().split("\n").map(Number);
    assert.equal(pids.length, 2);
    for (const pid of pids) assert.equal(await waitForProcessExit(pid), true);
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
