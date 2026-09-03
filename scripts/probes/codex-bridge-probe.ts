#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { probeInstalledAppServerSchemas, type AppServerSchemaReceipt } from "./app-server-schema.js";
import { probeAuthenticatedAppServer, type AuthenticatedProbeReceipt } from "./app-server-authenticated.js";
import { probeIsolatedAppServerLifecycle, type AppServerLifecycleReceipt } from "./app-server-stdio.js";
import { decideRelease, projectSafeReport, type BridgeDecision, type SafeCandidateReport } from "./bridge-contract.js";
import { directFixture } from "./direct-candidate.js";
import { PINNED_CODEX_CLI_VERSION } from "./codex-process.js";

const ARTIFACT_SCHEMA_VERSION = 1;
const MAX_PROBE_BUILD_FILES = 64;
const MAX_PROBE_BUILD_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_OUTPUTS = {
  "fixtures-only": path.join("artifacts", "gcr-1", "fixture-report.json"),
  "schemas-only": path.join("artifacts", "gcr-1", "schema-report.json"),
  "isolated-lifecycle": path.join("artifacts", "gcr-1", "isolated-lifecycle-report.json"),
  "authenticated-tool-roundtrip": path.join("artifacts", "gcr-1", "authenticated-tool-report.json")
} as const;

type ProbeMode = keyof typeof DEFAULT_OUTPUTS;

interface CliOptions {
  readonly mode: ProbeMode;
  readonly output: string | undefined;
  readonly model: string | undefined;
  readonly codexHome: string | undefined;
}

interface ArtifactProvenance {
  readonly format: "gcr-probe-build/v1";
  readonly routerVersion: string;
  readonly probeBuildSha256: string;
}

interface BaseArtifact {
  readonly schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  readonly mode: ProbeMode;
  readonly provenance: ArtifactProvenance;
  readonly reports: readonly SafeCandidateReport[];
  readonly decision: BridgeDecision;
}

interface FixtureArtifact extends BaseArtifact {
  readonly mode: "fixtures-only";
}

interface SchemaArtifact extends BaseArtifact {
  readonly mode: "schemas-only";
  readonly schema: AppServerSchemaReceipt;
}

interface LifecycleArtifact extends BaseArtifact {
  readonly mode: "isolated-lifecycle";
  readonly lifecycle: AppServerLifecycleReceipt;
}

interface AuthenticatedArtifact extends BaseArtifact {
  readonly mode: "authenticated-tool-roundtrip";
  readonly authenticated: AuthenticatedProbeReceipt;
}

type ProbeArtifact = FixtureArtifact | SchemaArtifact | LifecycleArtifact | AuthenticatedArtifact;

function parseArgs(args: readonly string[]): CliOptions {
  let mode: ProbeMode | undefined;
  let output: string | undefined;
  let model: string | undefined;
  let codexHome: string | undefined;
  let index = 0;
  while (index < args.length) {
    const argument = args[index];
    if (argument === "--") {
      index += 1;
      continue;
    }
    if (argument === "--fixtures-only" || argument === "--schemas-only" || argument === "--isolated-lifecycle" || argument === "--authenticated-tool-roundtrip") {
      if (mode !== undefined) throw new Error("exactly one probe mode is required");
      if (argument === "--fixtures-only") mode = "fixtures-only";
      else if (argument === "--schemas-only") mode = "schemas-only";
      else if (argument === "--isolated-lifecycle") mode = "isolated-lifecycle";
      else mode = "authenticated-tool-roundtrip";
      index += 1;
      continue;
    }
    if (argument === "--output" || argument === "--model" || argument === "--codex-home") {
      const value = args[index + 1];
      if (value === undefined || value === "--" || value.startsWith("--") || value.length === 0) {
        throw new Error("missing option value");
      }
      if (argument === "--output") {
        if (output !== undefined) throw new Error("duplicate option");
        output = value;
      } else if (argument === "--model") {
        if (model !== undefined) throw new Error("duplicate option");
        model = value;
      } else {
        if (codexHome !== undefined) throw new Error("duplicate option");
        codexHome = value;
      }
      index += 2;
      continue;
    }
    throw new Error("unknown option");
  }
  if (mode === undefined) throw new Error("exactly one probe mode is required");
  if ((mode === "isolated-lifecycle" || mode === "authenticated-tool-roundtrip") && model === undefined) throw new Error("--model is required for live local probes");
  if (mode !== "isolated-lifecycle" && mode !== "authenticated-tool-roundtrip" && model !== undefined) throw new Error("--model is only valid for live local probes");
  if (mode === "authenticated-tool-roundtrip" && codexHome === undefined) throw new Error("--codex-home is required for authenticated mode");
  if (mode !== "authenticated-tool-roundtrip" && codexHome !== undefined) throw new Error("--codex-home is only valid for authenticated mode");
  return { mode, output, model, codexHome };
}

function baseArtifact(mode: ProbeMode): BaseArtifact {
  const report = directFixture();
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    mode,
    provenance: {
      format: "gcr-probe-build/v1",
      routerVersion: readPackageVersion(),
      probeBuildSha256: readProbeBuildSha256()
    },
    reports: [projectSafeReport(report)],
    decision: decideRelease([report])
  };
}

function fixtureArtifact(): FixtureArtifact {
  return { ...baseArtifact("fixtures-only"), mode: "fixtures-only" };
}

async function schemaArtifact(): Promise<SchemaArtifact> {
  const schema = await probeInstalledAppServerSchemas();
  return { ...baseArtifact("schemas-only"), mode: "schemas-only", schema };
}

async function lifecycleArtifact(model: string): Promise<LifecycleArtifact> {
  const lifecycle = await probeIsolatedAppServerLifecycle({
    clientVersion: readPackageVersion(),
    expectedCliVersion: PINNED_CODEX_CLI_VERSION,
    expectedModel: model,
    tools: [{
      name: "gcr_probe_echo",
      description: "returns a fixed probe value",
      inputSchema: { additionalProperties: false, properties: {}, type: "object" }
    }]
  });
  return { ...baseArtifact("isolated-lifecycle"), mode: "isolated-lifecycle", lifecycle };
}

function readProbeBuildSha256(): string {
  try {
    const entries = fs.readdirSync(__dirname, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
      .sort((left, right) => left.name.localeCompare(right.name));
    if (entries.length === 0 || entries.length > MAX_PROBE_BUILD_FILES) throw new Error();
    const hash = crypto.createHash("sha256");
    for (const entry of entries) {
      const file = path.join(__dirname, entry.name);
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_PROBE_BUILD_FILE_BYTES) throw new Error();
      const bytes = fs.readFileSync(file);
      if (bytes.length !== stat.size) throw new Error();
      hash.update(String(Buffer.byteLength(entry.name, "utf8")) + ":" + entry.name + ":" + bytes.length + ":");
      hash.update(bytes);
    }
    return hash.digest("hex");
  } catch {
    throw new Error("unable to read probe build identity");
  }
}

async function authenticatedArtifact(model: string, codexHome: string): Promise<AuthenticatedArtifact> {
  const authenticated = await probeAuthenticatedAppServer({
    clientVersion: readPackageVersion(),
    codexHome,
    expectedModel: model
  });
  return { ...baseArtifact("authenticated-tool-roundtrip"), mode: "authenticated-tool-roundtrip", authenticated };
}

function readPackageVersion(): string {
  const file = path.resolve(__dirname, "..", "..", "..", "package.json");
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 64 * 1024) throw new Error();
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (!isPlainRecord(parsed)) throw new Error();
    const version = parsed.version;
    if (typeof version !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) throw new Error();
    return version;
  } catch {
    throw new Error("unable to read package version");
  }
}

function writeArtifact(outputPath: string, artifact: ProbeArtifact): void {
  const directory = path.dirname(outputPath);
  let temporaryPath: string | undefined;
  let descriptor: number | undefined;
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const candidate = outputPath + ".tmp-" + process.pid + "-" + attempt;
      try {
        descriptor = fs.openSync(candidate, "wx", 0o600);
        temporaryPath = candidate;
        break;
      } catch (error: unknown) {
        if (!isAlreadyExists(error)) throw new Error("unable to create probe report temporary file");
      }
    }
    if (descriptor === undefined || temporaryPath === undefined) {
      throw new Error("unable to create probe report temporary file");
    }
    const bytes = JSON.stringify(artifact, null, 2) + "\n";
    fs.writeFileSync(descriptor, bytes, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.linkSync(temporaryPath, outputPath);
    fs.unlinkSync(temporaryPath);
    temporaryPath = undefined;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("unable to ")) throw error;
    throw new Error("unable to write probe report");
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch {}
    }
    if (temporaryPath !== undefined) {
      try { fs.unlinkSync(temporaryPath); } catch {}
    }
  }
}

function isAlreadyExists(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "EEXIST";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function printDecision(decision: BridgeDecision): void {
  console.log("BASELINE_BRIDGE=" + decision.BASELINE_BRIDGE);
  console.log("SELECTED_BRIDGE=" + decision.SELECTED_BRIDGE);
  console.log("STABLE_RELEASE=" + decision.STABLE_RELEASE);
  console.log("ALPHA_RELEASE=" + decision.ALPHA_RELEASE);
  console.log("RELEASE_GATE=" + decision.RELEASE_GATE);
}

async function run(args: readonly string[]): Promise<number> {
  const options = parseArgs(args);
  const outputPath = path.resolve(process.cwd(), options.output ?? DEFAULT_OUTPUTS[options.mode]);
  prepareArtifactOutput(outputPath);
  let artifact: ProbeArtifact;
  if (options.mode === "fixtures-only") artifact = fixtureArtifact();
  else if (options.mode === "schemas-only") artifact = await schemaArtifact();
  else if (options.mode === "isolated-lifecycle") {
    if (options.model === undefined) throw new Error("--model is required for live local probes");
    artifact = await lifecycleArtifact(options.model);
  } else {
    if (options.model === undefined || options.codexHome === undefined) throw new Error("authenticated probe configuration is incomplete");
    artifact = await authenticatedArtifact(options.model, options.codexHome);
  }
  writeArtifact(outputPath, artifact);
  printDecision(artifact.decision);
  return artifact.decision.RELEASE_GATE === "BLOCKED" ? 1 : 0;
}

function prepareArtifactOutput(outputPath: string): void {
  try {
    fs.lstatSync(outputPath);
    throw new Error("output exists");
  } catch (error: unknown) {
    if (isNotFound(error)) return;
    throw new Error("unable to prepare probe report");
  }
}

function isNotFound(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

void run(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
}, (error: unknown) => {
  console.error("ERROR: " + (error instanceof Error ? error.message : "probe failed"));
  process.exitCode = 1;
});
