#!/usr/bin/env node
"use strict";

const args = process.argv.slice(2);
if (args.some((value) => value !== "--json") || args.length > 1) {
  process.stderr.write("Usage: node scripts/install-preflight.cjs [--json]\n");
  process.exit(2);
}
const report = {
  schemaVersion: 1,
  status: "blocked",
  selectedBridge: "none",
  activationImplemented: false,
  blockers: [
    { code: "NATIVE_BRIDGE_UNVERIFIED", message: "The Codex App Server bridge has not passed native Grok Bot validation." },
    { code: "CODEX_PROVENANCE_UNVERIFIED", message: "Approved Codex release packages and dedicated-home lifecycle ownership are not implemented." },
    { code: "UPDATE_ROLLBACK_UNIMPLEMENTED", message: "Verified updates and rollback to a working Codex CLI are not implemented." },
    { code: "TRANSACTIONAL_INSTALL_UNIMPLEMENTED", message: "Installation and uninstall recovery have not passed the supported VM matrix." }
  ],
  nextAction: "Read docs/transport-decision.md and docs/codex-update-recovery.md. Keep your existing Grok Bot installation."
};
if (args.includes("--json")) {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} else {
  process.stdout.write("INSTALL_STATE=blocked\nSELECTED_BRIDGE=none\n");
  for (const blocker of report.blockers) process.stdout.write(blocker.code + ": " + blocker.message + "\n");
  process.stdout.write(report.nextAction + "\n");
}
process.exitCode = 1;
