#!/bin/sh
# SessionStart: let design-taste-frontend's browser scripts run in cloud sessions.
# Chromium refuses to start as root without --no-sandbox, and the skill passes no
# such flag, so point CHROME_PATH at a wrapper that adds it.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
[ "$(id -u)" = 0 ] || exit 0
chrome=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome 2>/dev/null | head -n 1)
[ -n "$chrome" ] || exit 0
wrapper="$HOME/.cache/design-skills/chrome"
mkdir -p "$(dirname "$wrapper")"
printf '#!/bin/sh\nexec "%s" --no-sandbox "$@"\n' "$chrome" > "$wrapper"
chmod +x "$wrapper"
[ -n "$CLAUDE_ENV_FILE" ] && echo "export CHROME_PATH=\"$wrapper\"" >> "$CLAUDE_ENV_FILE"
exit 0
