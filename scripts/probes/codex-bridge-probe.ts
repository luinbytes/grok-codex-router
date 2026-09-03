#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { probeInstalledAppServerSchemas, type AppServerSchemaReceipt } from "./app-server-schema.js";
import { probeIsolatedAppServerLifecycle, type AppServerLifecycleReceipt } from "./app-server-stdio.js";
import { decideRelease, projectSafeReport, type BridgeDecision, type SafeCandidateReport } from "./bridge-contract.js";
import { directFixture } from "./direct-candidate.js";

const ARTIFACT_SCHEMA_VERSION = 1;
const DEFAULT_OUTPUTS = {
  "fixtures-only": path.join("artifacts", "gcr-1", "fixture-report.json"),
  "schemas-only": path.join("artifacts", "gcr-1", "schema-report.json"),
  "isolated-lifecycle": path.join("artifacts", "gcr-1", "isolated-lifecycle-report.json")
} as const;

type ProbeMode = keyof typeof DEFAULT_OUTPUTS;

interface CliOptions {
  readonly mode: ProbeMode;
  readonly output: string | undefined;
  readonly model: string | undefined;
  readonly codexExecutable: string | undefined;
}

interface BaseArtifact {
  readonly schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  readonly mode: ProbeMode;
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

type ProbeArtifact = FixtureArtifact | SchemaArtifact | LifecycleArtifact;

function parseArgs(args: readonly string[]): CliOptions {
  let mode: ProbeMode | undefined;
  let output: string | undefined;
  let model: string | undefined;
  let codexExecutable: string | undefined;
  let index = 0;
  while (index < args.length) {
    const argument = args[index];
    if (argument === "--") {
      index += 1;
      continue;
    }
    if (argument === "--fixtures-only" || argument === "--schemas-only" || argument === "--isolated-lifecycle") {
      if (mode !== undefined) throw new Error("exactly one probe mode is required");
      if (argument === "--fixtures-only") mode = "fixtures-only";
      else if (argument === "--schemas-only") mode = "schemas-only";
      else mode = "isolated-lifecycle";
      index += 1;
      continue;
    }
    if (argument === "--output" || argument === "--model" || argument === "--codex") {
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
        if (codexExecutable !== undefined) throw new Error("duplicate option");
        codexExecutable = value;
      }
      index += 2;
      continue;
    }
    throw new Error("unknown option");
  }
  if (mode === undefined) throw new Error("exactly one probe mode is required");
  if (mode === "isolated-lifecycle" && model === undefined) throw new Error("--model is required for isolated lifecycle mode");
  if (mode !== "isolated-lifecycle" && model !== undefined) throw new Error("--model is only valid for isolated lifecycle mode");
  if (mode === "fixtures-only" && codexExecutable !== undefined) throw new Error("--codex is only valid for live local probes");
  return { mode, output, model, codexExecutable };
}

function baseArtifact(mode: ProbeMode): BaseArtifact {
  const report = directFixture();
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    mode,
    reports: [projectSafeReport(report)],
    decision: decideRelease([report])
  };
}

function fixtureArtifact(): FixtureArtifact {
  return { ...baseArtifact("fixtures-only"), mode: "fixtures-only" };
}

async function schemaArtifact(executable: string | undefined): Promise<SchemaArtifact> {
  const schema = await probeInstalledAppServerSchemas(executable === undefined ? {} : { executable });
  return { ...baseArtifact("schemas-only"), mode: "schemas-only", schema };
}

async function lifecycleArtifact(model: string, executable: string | undefined): Promise<LifecycleArtifact> {
  const command = executable === undefined
    ? { executable: "codex", args: ["app-server", "--stdio"] }
    : { executable, args: ["app-server", "--stdio"] };
  const lifecycle = await probeIsolatedAppServerLifecycle({
    clientVersion: readPackageVersion(),
    command,
    expectedModel: model,
    tools: [{
      name: "gcr_probe_echo",
      description: "returns a fixed probe value",
      inputSchema: { additionalProperties: false, properties: {}, type: "object" }
    }]
  });
  return { ...baseArtifact("isolated-lifecycle"), mode: "isolated-lifecycle", lifecycle };
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
    fs.renameSync(temporaryPath, outputPath);
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
  let artifact: ProbeArtifact;
  if (options.mode === "fixtures-only") artifact = fixtureArtifact();
  else if (options.mode === "schemas-only") artifact = await schemaArtifact(options.codexExecutable);
  else {
    if (options.model === undefined) throw new Error("--model is required for isolated lifecycle mode");
    artifact = await lifecycleArtifact(options.model, options.codexExecutable);
  }
  const outputPath = path.resolve(process.cwd(), options.output ?? DEFAULT_OUTPUTS[options.mode]);
  writeArtifact(outputPath, artifact);
  printDecision(artifact.decision);
  return artifact.decision.RELEASE_GATE === "BLOCKED" ? 1 : 0;
}

void run(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
}, (error: unknown) => {
  console.error("ERROR: " + (error instanceof Error ? error.message : "probe failed"));
  process.exitCode = 1;
});
