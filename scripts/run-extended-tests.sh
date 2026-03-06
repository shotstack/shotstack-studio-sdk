#!/usr/bin/env bash
# Run the extended behavioural regression suite if it is available as a sibling.
# Exits 0 (success) when the repo is not present

set -euo pipefail

SUITE_DIR="$(cd "$(dirname "$0")/.." && pwd)/../shotstack-studio-extended-regression-suite"

if [ ! -d "$SUITE_DIR" ]; then
  echo "[extended-tests] Suite not found at $SUITE_DIR — skipping."
  exit 0
fi

echo "[extended-tests] Running extended regression suite..."
(cd "$SUITE_DIR" && npm install --prefer-offline && npm test)
