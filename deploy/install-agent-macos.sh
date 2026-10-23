#!/usr/bin/env bash
# Lance l'agent automatiquement à l'ouverture de session sur macOS (launchd), relancé s'il s'arrête.
# Prérequis : Ollama installé (app native), apps/agent/.env.production rempli (SERVER_URL=https://<domaine>, clé de prod).
# Le .env de dev reste libre : un agent de dev (pnpm --filter agent dev) peut tourner à côté, avec le même Ollama.
# Usage : bash deploy/install-agent-macos.sh        Désinstaller : bash deploy/install-agent-macos.sh --uninstall
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LABEL=fr.dashia.agent
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/dashia-agent.log"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$PLIST"
  echo "Agent désinstallé."
  exit 0
fi

[[ -f "$REPO/apps/agent/.env.production" ]] || { echo "apps/agent/.env.production manquant (voir apps/agent/.env.example)." >&2; exit 1; }
NODE="$(command -v node)"
TSX="$REPO/apps/agent/node_modules/.bin/tsx"
[[ -x "$TSX" ]] || { echo "Dépendances absentes : lancer pnpm install à la racine." >&2; exit 1; }

mkdir -p "$(dirname "$PLIST")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$REPO/apps/agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>$TSX</string>
    <string>--env-file=.env.production</string>
    <string>src/index.ts</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Agent lancé (et relancé à chaque ouverture de session). Journal : $LOG"
