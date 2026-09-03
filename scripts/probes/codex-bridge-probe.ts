#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { decideRelease, projectSafeReport, type BridgeDecision, type SafeCandidateReport } from "./bridge-contract.js";
import { directFixture } from "./direct-candidate.js";

const DEFAULT_OUTPUT = path.join("artifacts", "gcr-1", "fixture-report.json");
const ARTIFACT_SCHEMA_VERSION = 1;

interface CliOptions {
  readonly fixturesOnly: true;
  readonly output: string | undefined;
}

interface FixtureArtifact {
  readonly schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  readonly mode: "fixtures-only";
  readonly reports: readonly SafeCandidateReport[];
  readonly decision: BridgeDecision;
}

function parseArgs(args: readonly string[]): CliOptions {
  let fixturesOnly = false;
  let output: string | undefined;
  let index = 0;
  while (index < args.length) {
    const argument = args[index];
    if (argument === "--") {
      index += 1;
      continue;
    }
    if (argument === "--fixtures-only") {
      if (fixturesOnly) throw new Error("duplicate option: --fixtures-only");
      fixturesOnly = true;
      index += 1;
      continue;
    }
    if (argument === "--output") {
      if (output !== undefined) throw new Error("duplicate option: --output");
      const value = args[index + 1];
      if (value === undefined || value === "--" || value.startsWith("--") || value.length === 0) {
        throw new Error("missing value for --output");
      }
      output = value;
      index += 2;
      continue;
    }
    throw new Error("unknown option");
  }
  if (!fixturesOnly) throw new Error("--fixtures-only is required");
  return { fixturesOnly: true, output };
}

function artifactForFixture(): FixtureArtifact {
  const report = directFixture();
  const decision = decideRelease([report]);
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    mode: "fixtures-only",
    reports: [projectSafeReport(report)],
    decision
  };
}

function writeArtifact(outputPath: string, artifact: FixtureArtifact): void {
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
        if (!isAlreadyExists(error)) throw new Error("unable to create fixture report temporary file");
      }
    }
    if (descriptor === undefined || temporaryPath === undefined) {
      throw new Error("unable to create fixture report temporary file");
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
    throw new Error("unable to write fixture report");
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

function printDecision(decision: BridgeDecision): void {
  console.log("BASELINE_BRIDGE=" + decision.BASELINE_BRIDGE);
  console.log("SELECTED_BRIDGE=" + decision.SELECTED_BRIDGE);
  console.log("STABLE_RELEASE=" + decision.STABLE_RELEASE);
  console.log("ALPHA_RELEASE=" + decision.ALPHA_RELEASE);
  console.log("RELEASE_GATE=" + decision.RELEASE_GATE);
}

function run(args: readonly string[]): number {
  const options = parseArgs(args);
  const artifact = artifactForFixture();
  const outputPath = path.resolve(process.cwd(), options.output ?? DEFAULT_OUTPUT);
  writeArtifact(outputPath, artifact);
  printDecision(artifact.decision);
  return artifact.decision.RELEASE_GATE === "BLOCKED" ? 1 : 0;
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (error: unknown) {
  console.error("ERROR: " + (error instanceof Error ? error.message : "probe failed"));
  process.exitCode = 1;
}
