import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  PINNED_CODEX_CLI_VERSION,
  isolatedCodexEnvironment,
  processGroupExists,
  resolveCodexExecutable,
  resolvePinnedCodexExecutable,
  runOwnedCodexCommand,
  supportsOwnedProcessGroup,
  type VerifiedCodexExecutable
} from "../scripts/probes/codex-process.js";

const SUPPORTED = supportsOwnedProcessGroup(process.platform);

async function withTestRoot<T>(callback: (root: string) => Promise<T>): Promise<T> {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(process.cwd()), ".codex-process-test-"));
  const previousPath = process.env.PATH;
  try {
    return await callback(root);
  } finally {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function createCodex(root: string, version = PINNED_CODEX_CLI_VERSION): { readonly bin: string; readonly executable: string; readonly home: string } {
  const bin = path.join(root, "bin");
  const home = path.join(root, "codex-home");
  fs.mkdirSync(bin, { mode: 0o700 });
  fs.mkdirSync(home, { mode: 0o700 });
  const executable = path.join(bin, "codex");
  const source = [
    `#!${process.execPath}`,
    `const VERSION = ${JSON.stringify(version)};`,
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const { spawn } = require('node:child_process');",
    `const root = ${JSON.stringify(root)};`,
    "if (process.argv.includes('--version')) { process.stdout.write('codex-cli ' + VERSION + '\\n'); process.exit(0); }",
    "if (process.argv.includes('same-group')) { const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); fs.writeFileSync(path.join(root, 'same-group.pid'), String(child.pid)); process.stdout.write('same-group\\n'); process.exit(0); }",
    "if (process.argv.includes('escaped')) { const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' }); fs.writeFileSync(path.join(root, 'escaped.pid'), String(child.pid)); process.stdout.write('escaped\\n'); process.exit(0); }",
    "if (process.argv.includes('large-stdout')) { process.stdout.write('x'.repeat(1024)); process.exit(0); }",
    "if (process.argv.includes('large-stderr')) { process.stderr.write('x'.repeat(1024)); process.exit(0); }",
    "if (process.argv.includes('print-path')) { process.stdout.write(process.env.PATH || ''); process.exit(0); }",
    "if (process.argv.includes('hang')) { setInterval(() => {}, 1000); }",
    "process.stdout.write('ok\\n');"
  ].join("\n");
  fs.writeFileSync(executable, source, { encoding: "utf8", mode: 0o700 });
  fs.chmodSync(executable, 0o700);
  process.env.PATH = bin;
  return { bin, executable, home };
}

function command(executable: VerifiedCodexExecutable, home: string, args: readonly string[], timeoutMs = 2_000) {
  return runOwnedCodexCommand({ executable, args, cwd: home, codexHome: home, timeoutMs });
}

async function waitForFile(file: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!fs.existsSync(file)) {
    if (Date.now() >= deadline) throw new Error("test fixture did not start");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForPidGone(pid: number): Promise<boolean> {
  const deadline = Date.now() + 2_000;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("platform support is restricted to Darwin and Linux process groups", () => {
  assert.equal(supportsOwnedProcessGroup("darwin"), true);
  assert.equal(supportsOwnedProcessGroup("linux"), true);
  assert.equal(supportsOwnedProcessGroup("win32"), false);
  assert.equal(supportsOwnedProcessGroup("freebsd"), false);
});

test("resolver skips relative and hostile PATH entries and proves the exact pinned CLI", { skip: !SUPPORTED }, async () => {
  await withTestRoot(async (root) => {
    const hostile = path.join(root, "hostile");
    fs.mkdirSync(hostile, { mode: 0o777 });
    fs.chmodSync(hostile, 0o777);
    fs.writeFileSync(path.join(hostile, "codex"), "#!/bin/sh\nexit 1\n", { mode: 0o777 });
    const safe = createCodex(root);
    process.env.PATH = `relative${path.delimiter}${hostile}${path.delimiter}${safe.bin}`;
    assert.equal(resolveCodexExecutable(), safe.executable);
    const verified = await resolvePinnedCodexExecutable(safe.home, 2_000);
    assert.equal(verified.executable, fs.realpathSync(safe.executable));
    assert.equal(verified.version, PINNED_CODEX_CLI_VERSION);
    assert.match(verified.sha256, /^[0-9a-f]{64}$/);
    assert.equal(verified.containment, "same-process-group-only");
    assert.equal(Object.isFrozen(verified), true);
    assert.equal(Object.isFrozen(verified.identity), true);
    assert.equal(Number.isSafeInteger(verified.identity.device), true);
    assert.equal(Number.isSafeInteger(verified.identity.inode), true);
    const childPath = await command(verified, safe.home, ["print-path"]);
    assert.equal(childPath.stdout.toString("utf8"), safe.bin);
  });
});

test("resolver rejects the canonical root-owned sticky writable temp PATH entry", { skip: !SUPPORTED }, async () => {
  await withTestRoot(async (root) => {
    const fixture = createCodex(root);
    const canonicalTemp = fs.realpathSync("/tmp");
    const tempStat = fs.lstatSync(canonicalTemp);
    assert.equal(tempStat.isDirectory(), true);
    assert.equal(tempStat.uid, 0);
    assert.equal((tempStat.mode & 0o1000) !== 0, true);
    assert.equal((tempStat.mode & 0o022) !== 0, true);

    const previousPath = process.env.PATH;
    process.env.PATH = `${canonicalTemp}${path.delimiter}${fixture.bin}`;
    try {
      const environment = isolatedCodexEnvironment(fixture.home);
      assert.equal(environment.PATH, fixture.bin);
      assert.equal(resolveCodexExecutable(), fixture.executable);
    } finally {
      if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    }
  });
});

test("resolver rejects an exact-version mismatch with one static error", { skip: !SUPPORTED }, async () => {
  await withTestRoot(async (root) => {
    const fixture = createCodex(root, "0.152.0");
    await assert.rejects(
      () => resolvePinnedCodexExecutable(fixture.home, 2_000),
      (error: unknown) => error instanceof Error && error.message === "codex process boundary failure"
    );
  });
});

test("launcher rechecks both binary identity and content before spawning", { skip: !SUPPORTED }, async () => {
  await withTestRoot(async (root) => {
    const fixture = createCodex(root);
    const verified = await resolvePinnedCodexExecutable(fixture.home, 2_000);
    const forged = {
      ...verified,
      identity: { ...verified.identity, inode: verified.identity.inode + 1 }
    };
    await assert.rejects(() => command(forged, fixture.home, []), /codex process boundary failure/);

    fs.writeFileSync(fixture.executable, [
      `#!${process.execPath}`,
      "process.stdout.write('replacement\\n');"
    ].join("\n"), { encoding: "utf8", mode: 0o700 });
    fs.chmodSync(fixture.executable, 0o700);
    await assert.rejects(() => command(verified, fixture.home, []), /codex process boundary failure/);
  });
});

test("successful commands close same-group descendants and bound both output streams", { skip: !SUPPORTED }, async () => {
  await withTestRoot(async (root) => {
    const fixture = createCodex(root);
    const verified = await resolvePinnedCodexExecutable(fixture.home, 2_000);
    const result = await command(verified, fixture.home, ["same-group"]);
    assert.equal(result.stdout.toString("utf8"), "same-group\n");
    await waitForFile(path.join(root, "same-group.pid"));
    const childPid = Number(fs.readFileSync(path.join(root, "same-group.pid"), "utf8"));
    assert.equal(Number.isSafeInteger(childPid) && childPid > 0, true);
    assert.equal(await waitForPidGone(childPid), true);
    assert.equal(processGroupExists(childPid), false);

    await assert.rejects(() => runOwnedCodexCommand({ executable: verified, args: ["large-stdout"], cwd: fixture.home, codexHome: fixture.home, timeoutMs: 2_000, maxStdoutBytes: 128 }), /codex process boundary failure/);
    await assert.rejects(() => runOwnedCodexCommand({ executable: verified, args: ["large-stderr"], cwd: fixture.home, codexHome: fixture.home, timeoutMs: 2_000, maxStderrBytes: 128 }), /codex process boundary failure/);
  });
});

test("timeout closes the owned group and returns a static error", { skip: !SUPPORTED }, async () => {
  await withTestRoot(async (root) => {
    const fixture = createCodex(root);
    const verified = await resolvePinnedCodexExecutable(fixture.home, 2_000);
    await assert.rejects(() => command(verified, fixture.home, ["hang"], 50), /codex process boundary failure/);
  });
});

test("escaped setsid descendants are outside the proved group and are explicitly reaped by the test", { skip: !SUPPORTED }, async () => {
  await withTestRoot(async (root) => {
    const fixture = createCodex(root);
    const verified = await resolvePinnedCodexExecutable(fixture.home, 2_000);
    const result = await command(verified, fixture.home, ["escaped"]);
    assert.equal(result.stdout.toString("utf8"), "escaped\n");
    const pidFile = path.join(root, "escaped.pid");
    await waitForFile(pidFile);
    const escapedPid = Number(fs.readFileSync(pidFile, "utf8"));
    assert.equal(Number.isSafeInteger(escapedPid) && escapedPid > 0, true);
    assert.equal(processGroupExists(escapedPid), true);
    try {
      process.kill(escapedPid, "SIGKILL");
    } catch {}
    assert.equal(await waitForPidGone(escapedPid), true);
  });
});
