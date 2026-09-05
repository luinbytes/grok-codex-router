import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repository = path.resolve(__dirname, "..", "..");

test("shell and agent setup reject installation before any private-state access or mutation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gcr-install-check-"));
  try {
    const checkout = path.join(root, "checkout with spaces");
    fs.mkdirSync(path.join(checkout, "scripts"), { recursive: true });
    fs.copyFileSync(path.join(repository, "install.sh"), path.join(checkout, "install.sh"));
    fs.copyFileSync(path.join(repository, "scripts", "install-preflight.cjs"), path.join(checkout, "scripts", "install-preflight.cjs"));
    const before = fs.readdirSync(root, { recursive: true }).sort();
    const env = {
      PATH: process.env.PATH,
      HOME: root,
      CODEX_HOME: path.join(root, "unreadable-credentials"),
      SAND_DATA_ROOT: path.join(root, "absent-data"),
      SAND_HOST_DIR: path.join(root, "absent-host"),
      GCR_RELEASE_GATE: "READY"
    };
    fs.mkdirSync(env.CODEX_HOME, { mode: 0 });
    for (const args of [[], ["--check"], ["--json"], ["--check", "--json"]]) {
      const result = spawnSync("/bin/sh", [path.join(checkout, "install.sh"), ...args], { env, cwd: root, encoding: "utf8" });
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stderr, "");
      if (args.includes("--json")) {
        const report = JSON.parse(result.stdout);
        assert.equal(report.status, "blocked");
        assert.equal(report.selectedBridge, "none");
        assert.equal(report.activationImplemented, false);
        assert.ok(report.blockers.length > 0);
      } else {
        assert.match(result.stdout, /INSTALL_STATE=blocked/);
      }
    }
    for (const command of ["install", "recover"]) {
      const result = spawnSync(process.execPath, [path.join(repository, "dist", "bin", "grok-codex-router.js"), command], { env, cwd: root, encoding: "utf8" });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stdout, /INSTALL_STATE=blocked/);
      assert.equal(result.stderr, "");
    }
    fs.chmodSync(env.CODEX_HOME, 0o700);
    fs.rmdirSync(env.CODEX_HOME);
    assert.deepEqual(fs.readdirSync(root, { recursive: true }).sort(), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("installer rejects unknown and duplicate flags and exposes help without dependencies", () => {
  for (const args of [["--force"], ["--check", "--check"], ["--json", "--json"], ["--help", "--force"]]) {
    const result = spawnSync("/bin/sh", [path.join(repository, "install.sh"), ...args], { encoding: "utf8" });
    assert.equal(result.status, 2);
  }
  const help = spawnSync("/bin/sh", [path.join(repository, "install.sh"), "--help"], { env: { PATH: "/nonexistent" }, encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
});
