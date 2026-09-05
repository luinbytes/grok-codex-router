#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const mode = process.argv[2];
if (process.argv.length !== 3 || !["portable", "vm", "all"].includes(mode)) throw new Error("Usage: node scripts/test.cjs portable|vm|all");
const root = path.resolve(__dirname, "..");
const tests = fs.readdirSync(path.join(root, "dist", "tests"))
  .filter((file) => file.endsWith(".test.js"))
  .filter((file) => mode === "all" || (mode === "vm" ? file === "vm-contract.test.js" : file !== "vm-contract.test.js"))
  .sort().map((file) => path.join(root, "dist", "tests", file));
if (tests.length === 0) throw new Error("No compiled tests found");
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...tests], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
