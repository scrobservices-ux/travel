#!/bin/sh
# Starts the Playwright MCP server. In cloud sessions, use the pre-installed
# Chromium, headless and without the sandbox (it refuses to start as root
# otherwise); on a local machine, let Playwright pick its own Chrome.
set -- --isolated --output-dir .playwright-mcp "$@"
chrome=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome 2>/dev/null | head -n 1)
if [ -n "$chrome" ] && [ "$(id -u)" = 0 ]; then
  set -- --headless --no-sandbox --executable-path "$chrome" "$@"
fi
exec npx -y @playwright/mcp@0.0.83 "$@"
