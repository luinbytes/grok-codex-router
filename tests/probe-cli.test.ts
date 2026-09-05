import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const CLI = path.resolve(__dirname, "../scripts/probes/codex-bridge-probe.js");
const EXPECTED_STDOUT = [
  "BASELINE_BRIDGE=direct",
  "SELECTED_BRIDGE=none",
  "STABLE_RELEASE=blocked",
  "ALPHA_RELEASE=blocked",
  "RELEASE_GATE=BLOCKED"
].join("\n") + "\n";

interface Invocation {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function invoke(cwd: string, args: readonly string[], pathValue?: string): Invocation {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    ...(pathValue === undefined ? {} : { env: { ...process.env, PATH: pathValue } })
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function withTemporaryDirectory<T>(callback: (directory: string) => T): T {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gcr-probe-cli-"));
  try {
    return callback(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("fixture CLI writes a safe deterministic blocked report", () => {
  withTemporaryDirectory((directory) => {
    const relativeOutput = path.join("nested", "reports", "fixture-report.json");
    const first = invoke(directory, ["--", "--fixtures-only", "--output", relativeOutput]);
    assert.equal(first.status, 1);
    assert.equal(first.stdout, EXPECTED_STDOUT);
    assert.equal(first.stderr, "");
    assert.equal(first.stdout.includes(relativeOutput), false);

    const reportPath = path.join(directory, relativeOutput);
    const firstBytes = fs.readFileSync(reportPath);
    const report: unknown = JSON.parse(firstBytes.toString("utf8"));
    const reportRecord = requireRecord(report);
    assert.deepEqual(Object.keys(reportRecord), ["schemaVersion", "mode", "provenance", "reports", "decision"]);
    assert.equal(reportRecord.schemaVersion, 1);
    assert.equal(reportRecord.mode, "fixtures-only");
    const provenance = requireRecord(reportRecord.provenance);
    assert.equal(provenance.format, "gcr-probe-build/v1");
    assert.equal(provenance.routerVersion, "0.1.0");
    assert.match(String(provenance.probeBuildSha256), /^[a-f0-9]{64}$/);
    assert.deepEqual(requireRecord(reportRecord.decision), {
      BASELINE_BRIDGE: "direct",
      SELECTED_BRIDGE: "none",
      STABLE_RELEASE: "blocked",
      ALPHA_RELEASE: "blocked",
      RELEASE_GATE: "BLOCKED"
    });
    assert.equal(Array.isArray(reportRecord.reports), true);

    const source = firstBytes.toString("utf8");
    for (const secret of [
      "sk-proj-secret",
      "Bearer secret-token",
      "prompt-body",
      "conversation-id",
      "account-id",
      "call-id",
      "raw-event",
      "/Users/private/attachment.png"
    ]) {
      assert.equal(source.includes(secret), false);
    }
    assert.equal(source.includes(relativeOutput), false);
    for (const key of ["raw", "prompts", "args", "paths", "callIds", "credentials", "environment"]) {
      assert.equal(source.includes('"' + key + '"'), false);
    }

    const second = invoke(directory, ["--fixtures-only", "--output", "second.json"]);
    assert.equal(second.status, 1);
    assert.equal(second.stdout, EXPECTED_STDOUT);
    assert.equal(second.stderr, "");
    assert.deepEqual(fs.readFileSync(path.join(directory, "second.json")), firstBytes);

    if (process.platform !== "win32") {
      assert.equal(fs.statSync(reportPath).mode & 0o777, 0o600);
      assert.equal(fs.statSync(path.join(directory, "nested", "reports")).mode & 0o777, 0o700);
    }
  });
});

test("fixture CLI resolves its default artifact under the invocation directory", () => {
  withTemporaryDirectory((directory) => {
    const result = invoke(directory, ["--fixtures-only"]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, EXPECTED_STDOUT);
    assert.equal(result.stderr, "");
    assert.equal(fs.existsSync(path.join(directory, "artifacts", "gcr-1", "fixture-report.json")), true);
  });
});

test("fixture CLI rejects unknown, duplicate, and missing option values", () => {
  withTemporaryDirectory((directory) => {
    const cases: readonly (readonly string[])[] = [
      ["--fixtures-only", "--unknown"],
      ["--fixtures-only", "--fixtures-only"],
      ["--fixtures-only", "--output", "first.json", "--output", "second.json"],
      ["--fixtures-only", "--output"],
      ["--fixtures-only", "--output", "--"],
      ["--fixtures-only", "--schemas-only"],
      ["--schemas-only", "--model", "gpt-synthetic"],
      ["--isolated-lifecycle"],
      ["--fixtures-only", "--codex", "codex"],
      ["--schemas-only", "--codex", "first"],
      ["--isolated-lifecycle", "--model"],
      ["--authenticated-tool-roundtrip"],
      ["--authenticated-tool-roundtrip", "--model", "gpt-synthetic"],
      ["--authenticated-tool-roundtrip", "--model", "gpt-synthetic", "--codex-home", "/tmp/codex-home", "--codex", "codex"],
      ["--fixtures-only", "--codex-home", "/tmp/codex-home"],
      ["--authenticated-tool-roundtrip", "--model", "gpt-synthetic", "--model", "gpt-other"],
      ["--unexpected-positional"]
    ];
    for (const args of cases) {
      const result = invoke(directory, args);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /^ERROR: /);
    }
    assert.deepEqual(fs.readdirSync(directory), []);

    const secretArgument = "--api-key=sk-proj-secret";
    const secretResult = invoke(directory, [secretArgument]);
    assert.equal(secretResult.status, 1);
    assert.equal(secretResult.stdout, "");
    assert.equal(secretResult.stderr, "ERROR: unknown option\n");
    assert.equal(secretResult.stderr.includes(secretArgument), false);
  });
});

test("authenticated CLI accepts model, output, and dedicated-home options but writes no failure artifact", () => {
  withTemporaryDirectory((directory) => {
    fs.writeFileSync(path.join(directory, ".grok-codex-router-home"), "GCR_CODEX_HOME_V1\n", { mode: 0o600 });
    const result = invoke(directory, [
      "--authenticated-tool-roundtrip",
      "--model", "gpt-synthetic",
      "--codex-home", directory,
      "--output", "auth-report.json"
    ], "");
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "ERROR: authenticated app server probe failed\n");
    assert.equal(fs.existsSync(path.join(directory, "auth-report.json")), false);
    assert.deepEqual(fs.readdirSync(directory), [".grok-codex-router-home"]);
  });
});

test("authenticated CLI preserves recognized evidence and refuses a reused output path", () => {
  withTemporaryDirectory((directory) => {
    const reportPath = path.join(directory, "auth-report.json");
    const original = JSON.stringify({
      schemaVersion: 1,
      mode: "authenticated-tool-roundtrip",
      reports: [],
      decision: {},
      authenticated: {}
    });
    fs.writeFileSync(reportPath, original);
    const result = invoke(directory, [
      "--authenticated-tool-roundtrip",
      "--model", "gpt-synthetic",
      "--codex-home", directory,
      "--output", "auth-report.json"
    ]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "ERROR: unable to prepare probe report\n");
    assert.equal(fs.readFileSync(reportPath, "utf8"), original);
  });
});

test("authenticated CLI preserves an unrecognized output target and refuses before spawn", () => {
  withTemporaryDirectory((directory) => {
    const reportPath = path.join(directory, "auth-report.json");
    const original = "operator-owned-content\n";
    fs.writeFileSync(reportPath, original);
    const result = invoke(directory, [
      "--authenticated-tool-roundtrip",
      "--model", "gpt-synthetic",
      "--codex-home", directory,
      "--output", "auth-report.json"
    ]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "ERROR: unable to prepare probe report\n");
    assert.equal(fs.readFileSync(reportPath, "utf8"), original);
  });
});

test("fixture CLI refuses an output directory without creating a temporary file", () => {
  withTemporaryDirectory((directory) => {
    const outputDirectory = path.join(directory, "output-directory");
    fs.mkdirSync(outputDirectory);
    const result = invoke(directory, ["--fixtures-only", "--output", "output-directory"]);

    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "ERROR: unable to prepare probe report\n");
    assert.deepEqual(fs.readdirSync(directory), ["output-directory"]);
    assert.deepEqual(fs.readdirSync(outputDirectory), []);
  });
});

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("expected JSON object");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
