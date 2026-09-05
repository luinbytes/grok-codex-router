#!/bin/sh
set -eu

case "${1-}" in
  --help|-h)
    if [ "$#" -ne 1 ]; then exit 2; fi
    printf '%s\n' 'Usage: sh install.sh [--check] [--json]' \
      'Checks public installation readiness without changing your setup.' \
      'Exit 0: help. Exit 1: installation blocked. Exit 2: invalid arguments.'
    exit 0
    ;;
esac
json=false
check=false
for argument in "$@"; do
  case "$argument" in
    --check) if "$check"; then exit 2; fi; check=true ;;
    --json) if "$json"; then exit 2; fi; json=true ;;
    *) printf '%s\n' 'Unknown option. Run sh install.sh --help.' >&2; exit 2 ;;
  esac
done
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Node.js is required to check installation readiness. No changes were made.' >&2
  exit 1
fi
script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
if "$json"; then
  exec node "$script_directory/scripts/install-preflight.cjs" --json
fi
exec node "$script_directory/scripts/install-preflight.cjs"
