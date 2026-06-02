#!/usr/bin/env bash
# Start the LandShark dev environment (frontend + backend + worker).
#
# Usage:
#   ./scripts/dev.sh          # start everything
#   ./scripts/dev.sh --tmux   # open in a tmux split (if tmux is installed)
#
# Ctrl+C stops everything cleanly.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
PYTHON="$BACKEND/.venv/bin/python"

# ---------------------------------------------------------------------------
# Validate prerequisites
# ---------------------------------------------------------------------------
if [ ! -f "$PYTHON" ]; then
  echo "✗ Python venv not found at $BACKEND/.venv"
  echo "  Run: python3 -m venv backend/.venv && backend/.venv/bin/pip install -e 'backend[dev]'"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "✗ node not found — install Node.js or check your PATH"
  exit 1
fi

# ---------------------------------------------------------------------------
# tmux mode
# ---------------------------------------------------------------------------
if [ "${1:-}" = "--tmux" ]; then
  if ! command -v tmux &>/dev/null; then
    echo "✗ tmux not installed — run without --tmux or: brew install tmux"
    exit 1
  fi
  SESSION="landshark-dev"
  tmux new-session -d -s "$SESSION" -x 220 -y 50 \
    "cd '$BACKEND' && '$PYTHON' manage.py devserver 8001; read"
  tmux split-window -h -t "$SESSION" \
    "cd '$ROOT' && npm run dev; read"
  tmux select-pane -t "$SESSION:0.0"
  echo "→ Attaching to tmux session '$SESSION'  (Ctrl+B D to detach, Ctrl+C to stop each pane)"
  tmux attach-session -t "$SESSION"
  exit 0
fi

# ---------------------------------------------------------------------------
# Inline mode — run both processes, stream combined output, kill on exit
# ---------------------------------------------------------------------------
BOLD="\033[1m"
CYAN="\033[36m"
YELLOW="\033[33m"
RESET="\033[0m"

prefix_output() {
  local label="$1"
  local color="$2"
  while IFS= read -r line; do
    printf "${color}${BOLD}[%s]${RESET} %s\n" "$label" "$line"
  done
}

cleanup() {
  echo ""
  echo "Stopping dev servers..."
  # Kill the entire process group so child processes (qcluster) also die
  kill -- -$BACKEND_PID 2>/dev/null || kill $BACKEND_PID 2>/dev/null || true
  kill -- -$FRONTEND_PID 2>/dev/null || kill $FRONTEND_PID 2>/dev/null || true
  wait 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

echo ""
printf "${BOLD}Starting LandShark dev environment…${RESET}\n"
printf "  Backend  → ${CYAN}http://localhost:8001${RESET}\n"
printf "  Frontend → ${YELLOW}http://localhost:5174${RESET}\n"
echo ""

# Start backend (devserver auto-starts qcluster)
(cd "$BACKEND" && "$PYTHON" manage.py devserver 8001 2>&1) \
  | prefix_output "backend" "$CYAN" &
BACKEND_PID=$!

# Give Django a moment to start before Vite floods the output
sleep 1

# Start frontend
(cd "$ROOT" && npm run dev 2>&1) \
  | prefix_output "frontend" "$YELLOW" &
FRONTEND_PID=$!

# Wait for either process to exit (crash or Ctrl+C)
wait $BACKEND_PID $FRONTEND_PID
