#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) throw new Error("dist must not be a symbolic link");
fs.rmSync(output, { recursive: true, force: true });
const result = spawnSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", path.join(root, "tsconfig.json")], {
  cwd: root,
  stdio: "inherit"
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
for (const directory of ["bin", "scripts"]) {
  for (const file of fs.readdirSync(path.join(output, directory))) {
    if (file.endsWith(".js")) fs.chmodSync(path.join(output, directory, file), 0o755);
  }
}
