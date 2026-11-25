#!/bin/sh
# Scans the files staged for commit with TruffleHog and blocks the commit on a verified secret.
# If TruffleHog isn't installed, it warns instead of failing (CI still scans every push).
set -e
if ! command -v trufflehog >/dev/null 2>&1; then
  echo "⚠️  trufflehog not installed: skipping local secret scan (CI will still scan). Install: brew install trufflehog"
  exit 0
fi
STAGED=$(git diff --cached --name-only --diff-filter=ACMR)
[ -z "$STAGED" ] && exit 0
# shellcheck disable=SC2086
echo "$STAGED" | tr '\n' '\0' | xargs -0 trufflehog filesystem --results=verified --fail --no-update
