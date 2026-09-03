import { spawn, type ChildProcessByStdio } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import {
  isolatedCodexEnvironment,
  signalIsolatedProcessTree,
  supportsIsolatedProcessTree
} from "./codex-process.js";

const MAX_SCHEMA_BUNDLE_BYTES = 2 * 1024 * 1024;
const MAX_SCHEMA_DOCUMENT_BYTES = 256 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_SCHEMA_TIMEOUT_MS = 15_000;
const MAX_SCHEMA_TIMEOUT_MS = 60_000;

export interface AppServerSchemaReceipt {
  readonly protocolVersion: "v2";
  readonly cliVersion: string;
  readonly stableBundleSha256: string;
  readonly experimentalBundleSha256: string;
  readonly stableDynamicTools: false;
  readonly experimentalDynamicTools: true;
  readonly releaseEligibility: "blocked";
}

export interface AppServerSchemaProbeOptions {
  readonly executable?: string;
  readonly timeoutMs?: number;
}

export function inspectAppServerSchemaDirectories(
  stableDirectory: string,
  experimentalDirectory: string,
  cliVersion: string
): AppServerSchemaReceipt {
  if (!isVersion(cliVersion)) throw schemaError();
  const stableBundle = readBoundedFile(
    path.join(stableDirectory, "codex_app_server_protocol.v2.schemas.json"),
    MAX_SCHEMA_BUNDLE_BYTES
  );
  const experimentalBundle = readBoundedFile(
    path.join(experimentalDirectory, "codex_app_server_protocol.v2.schemas.json"),
    MAX_SCHEMA_BUNDLE_BYTES
  );
  validateProtocolBundle(stableBundle);
  validateProtocolBundle(experimentalBundle);
  const stableThread = parseSchema(path.join(stableDirectory, "v2", "ThreadStartParams.json"));
  const experimentalThread = parseSchema(path.join(experimentalDirectory, "v2", "ThreadStartParams.json"));
  const stableDynamicTools = dynamicToolsShape(stableThread);
  const experimentalDynamicTools = dynamicToolsShape(experimentalThread);
  if (stableDynamicTools !== "absent" || experimentalDynamicTools !== "valid") throw schemaError();
  return {
    protocolVersion: "v2",
    cliVersion,
    stableBundleSha256: crypto.createHash("sha256").update(stableBundle).digest("hex"),
    experimentalBundleSha256: crypto.createHash("sha256").update(experimentalBundle).digest("hex"),
    stableDynamicTools: false,
    experimentalDynamicTools: true,
    releaseEligibility: "blocked"
  };
}

export async function probeInstalledAppServerSchemas(options: AppServerSchemaProbeOptions = {}): Promise<AppServerSchemaReceipt> {
  if (!supportsIsolatedProcessTree(process.platform)) throw schemaError();
  validateOptions(options);
  const executable = options.executable ?? "codex";
  const timeoutMs = options.timeoutMs ?? DEFAULT_SCHEMA_TIMEOUT_MS;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gcr-app-server-schema-"));
  const stable = path.join(root, "stable");
  const experimental = path.join(root, "experimental");
  const codexHome = path.join(root, "codex-home");
  try {
    fs.mkdirSync(codexHome, { mode: 0o700 });
    const cliVersion = readVersion(await run(executable, ["--version"], root, codexHome, timeoutMs));
    await run(executable, ["app-server", "generate-json-schema", "--out", stable], root, codexHome, timeoutMs);
    await run(executable, ["app-server", "generate-json-schema", "--experimental", "--out", experimental], root, codexHome, timeoutMs);
    return inspectAppServerSchemaDirectories(stable, experimental, cliVersion);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function run(executable: string, args: readonly string[], cwd: string, codexHome: string, timeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(executable, args, {
        cwd,
        detached: true,
        env: isolatedCodexEnvironment(codexHome),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
    } catch {
      reject(schemaError());
      return;
    }
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failed = false;
    const fail = (): void => {
      failed = true;
      signalIsolatedProcessTree(child, "SIGKILL");
    };
    const timer = setTimeout(fail, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      if (failed) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_COMMAND_OUTPUT_BYTES) {
        fail();
        return;
      }
      stdout.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (failed) return;
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_COMMAND_OUTPUT_BYTES) fail();
    });
    child.once("error", fail);
    child.once("exit", () => signalIsolatedProcessTree(child, "SIGKILL"));
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (failed || code !== 0 || signal !== null || stdoutBytes > MAX_COMMAND_OUTPUT_BYTES
        || stderrBytes > MAX_COMMAND_OUTPUT_BYTES) {
        reject(schemaError());
        return;
      }
      resolve(Buffer.concat(stdout, stdoutBytes));
    });
  });
}

function readVersion(stdout: Buffer): string {
  let value: string;
  try {
    value = stdout.toString("utf8").trim();
  } catch {
    throw schemaError();
  }
  const match = /^codex-cli ([0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(value);
  if (match?.[1] === undefined || !isVersion(match[1])) throw schemaError();
  return match[1];
}

function readBoundedFile(file: string, maxBytes: number): Buffer {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(file);
  } catch {
    throw schemaError();
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) throw schemaError();
  const value = fs.readFileSync(file);
  if (value.length !== stat.size || value.length > maxBytes) throw schemaError();
  return value;
}

function parseSchema(file: string): Record<string, unknown> {
  return parseSchemaBytes(readBoundedFile(file, MAX_SCHEMA_DOCUMENT_BYTES));
}

function parseSchemaBytes(bytes: Buffer): Record<string, unknown> {
  try {
    const value = JSON.parse(bytes.toString("utf8")) as unknown;
    if (!isPlainRecord(value)) throw schemaError();
    return value;
  } catch {
    throw schemaError();
  }
}

function dynamicToolsShape(schema: Record<string, unknown>): "absent" | "valid" | "invalid" {
  const properties = schema.properties;
  if (!isPlainRecord(properties)) return "invalid";
  if (!Object.prototype.hasOwnProperty.call(properties, "dynamicTools")) return "absent";
  const dynamicTools = properties.dynamicTools;
  if (!isPlainRecord(dynamicTools) || dynamicTools.default !== null || !isPlainRecord(dynamicTools.items)
    || typeof dynamicTools.items.$ref !== "string" || !dynamicTools.items.$ref.endsWith("/DynamicToolSpec")
    || !Array.isArray(dynamicTools.type) || dynamicTools.type.length !== 2) return "invalid";
  const types = new Set(dynamicTools.type);
  return types.size === 2 && types.has("array") && types.has("null") ? "valid" : "invalid";
}

function validateProtocolBundle(bytes: Buffer): void {
  const schema = parseSchemaBytes(bytes);
  if (schema.title !== "CodexAppServerProtocolV2" || schema.type !== "object" || !isPlainRecord(schema.definitions)) {
    throw schemaError();
  }
}

function validateOptions(options: AppServerSchemaProbeOptions): void {
  try {
    if (!isPlainRecord(options) || !hasOnlyKeys(options, ["executable", "timeoutMs"])
      || (options.executable !== undefined && !isCommand(options.executable))
      || (options.timeoutMs !== undefined && (!isPositiveInteger(options.timeoutMs) || options.timeoutMs > MAX_SCHEMA_TIMEOUT_MS))) {
      throw schemaError();
    }
  } catch {
    throw schemaError();
  }
}

function isCommand(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 16 * 1024
    && Buffer.byteLength(value, "utf8") <= 16 * 1024 && !value.includes("\0");
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function schemaError(): Error {
  return new Error("app server schema probe failure");
}
