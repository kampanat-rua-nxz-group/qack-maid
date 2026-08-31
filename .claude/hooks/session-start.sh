#!/bin/bash
set -euo pipefail

# qack-maid is a single-file static app: index.html + vendored mermaid.min.js.
# By design there is no package manager, build step, linter, or test suite
# (see docs/adr/0002-single-file-static-deployment.md) — there is nothing to
# install. This hook only does a quick sanity check that the core files
# a session needs to work on the app are actually present.

# Only run this in Claude Code on the web / remote sessions.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

missing=0
for f in index.html mermaid.min.js; do
  if [ ! -f "$f" ]; then
    echo "warning: expected file '$f' not found in $CLAUDE_PROJECT_DIR" >&2
    missing=1
  fi
done

if [ "$missing" -eq 0 ]; then
  echo "qack-maid: core files present (index.html, mermaid.min.js). No dependencies to install — open index.html directly in a browser to work on it."
fi

exit 0
