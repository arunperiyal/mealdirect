#!/bin/bash
#
# MealDirect dev session: backend API + Expo dev servers, one pane each.
#
#   ./dev-session.sh                       # backend + all four apps
#   ./dev-session.sh customer restaurant   # backend + just these apps
#
# Apps: customer, restaurant (partner), admin, delivery (rider)

set -euo pipefail

# The repo root: this script lives there
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
BACKEND="$ROOT/backend"
MOBILE="$ROOT/mobile"

SESSION="MEALDIRECT"
DB_CONTAINER="mess_postgres"

# Fixed Metro ports, so each app keeps the same address on the phone
declare -A PORTS=(
    [customer]=8081
    [restaurant]=8082
    [admin]=8083
    [delivery]=8084
)
ALL_APPS=(customer restaurant admin delivery)

log() {
    echo "[mealdirect] $1"
}

# Attach, or switch when already inside tmux (attaching there would nest sessions)
attach() {
    if [ -n "${TMUX:-}" ]; then
        exec tmux switch-client -t "$SESSION"
    fi
    exec tmux attach-session -t "$SESSION"
}

# If session exists → attach
if tmux has-session -t "$SESSION" 2>/dev/null; then
    log "Session exists. Attaching..."
    attach
fi

# Which apps to start
APPS=("$@")
[ ${#APPS[@]} -eq 0 ] && APPS=("${ALL_APPS[@]}")
for app in "${APPS[@]}"; do
    if [ -z "${PORTS[$app]:-}" ]; then
        echo "Unknown app: $app (choose from: ${ALL_APPS[*]})" >&2
        exit 1
    fi
done

# The dev database runs in Docker; start it if it's stopped
if command -v docker >/dev/null 2>&1 && docker container inspect "$DB_CONTAINER" >/dev/null 2>&1; then
    if [ "$(docker container inspect -f '{{.State.Running}}' "$DB_CONTAINER")" != "true" ]; then
        log "Starting database container $DB_CONTAINER..."
        docker start "$DB_CONTAINER" >/dev/null
    fi
else
    log "Database container $DB_CONTAINER not found; the backend may not connect."
fi

log "Creating new session..."

# =========================
# SERVERS WINDOW
# =========================
# Left: backend API. Right: one pane per app, stacked.
tmux new-session -d -s "$SESSION" -n servers -c "$BACKEND"

PANE_API=$(tmux display-message -p -t "$SESSION:servers" '#{pane_id}')
log "Backend pane: $PANE_API"
tmux send-keys -t "$PANE_API" "npm run dev" C-m

PANE_PREV=""
for app in "${APPS[@]}"; do
    if [ -z "$PANE_PREV" ]; then
        PANE_APP=$(tmux split-window -h -P -F '#{pane_id}' -t "$PANE_API" -c "$MOBILE/$app")
    else
        PANE_APP=$(tmux split-window -v -P -F '#{pane_id}' -t "$PANE_PREV" -c "$MOBILE/$app")
    fi
    log "$app pane: $PANE_APP (port ${PORTS[$app]})"
    tmux select-pane -t "$PANE_APP" -T "$app"
    tmux send-keys -t "$PANE_APP" "npx expo start --port ${PORTS[$app]}" C-m
    PANE_PREV=$PANE_APP
done

# Even out the stacked app panes; prefix + z zooms one to read its QR code
tmux select-layout -t "$SESSION:servers" main-vertical
tmux set-option -w -t "$SESSION:servers" pane-border-status top
tmux set-option -w -t "$SESSION:servers" pane-border-format ' #{pane_title} '
tmux select-pane -t "$PANE_API" -T backend

# =========================
# MAIN WINDOW (editor)
# =========================
log "Creating main window..."
tmux new-window -t "$SESSION" -n main -c "$ROOT"
tmux send-keys -t "$SESSION:main" "nvim ." C-m

# =========================
# ZSH WINDOW (scratch)
# =========================
# Top left: backend (tests, scripts). Bottom left: repo root (git). Right: mobile workspace.
log "Creating zsh window..."
tmux new-window -t "$SESSION" -n zsh -c "$BACKEND"

PANE_Z1=$(tmux display-message -p -t "$SESSION:zsh" '#{pane_id}')
PANE_Z2=$(tmux split-window -h -P -F '#{pane_id}' -t "$PANE_Z1" -c "$MOBILE")
PANE_Z3=$(tmux split-window -v -P -F '#{pane_id}' -t "$PANE_Z1" -c "$ROOT")
log "Scratch panes: $PANE_Z1 $PANE_Z2 $PANE_Z3"

tmux send-keys -t "$PANE_Z3" "git status -sb" C-m

# Back to servers window, backend pane
tmux select-window -t "$SESSION:servers"
tmux select-pane -t "$PANE_API"

log "Setup complete. Attaching..."
attach
