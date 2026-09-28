#!/usr/bin/env bash
# Decentralflix — one-command local run.
# Starts:  lifeboat backend+storefront on :8080  (node apps/lifeboat/server.js)
#          Next.js marketing site on :3000        (next start)
# Run from the repo root:  ./scripts/run.sh
# Stop:                    ./scripts/stop.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDDIR="$ROOT/.pids"; LOGDIR="$ROOT/logs"
mkdir -p "$PIDDIR" "$LOGDIR"

start_svc() { # name, pidfile, logfile, cmd...
  local name="$1" pidfile="$2" logfile="$3"; shift 3
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name already running (pid $(cat "$pidfile"))"
    return 0
  fi
  echo "starting $name..."
  nohup "$@" >"$logfile" 2>&1 &
  echo $! > "$pidfile"
  echo "$name pid $!"
}

cd "$ROOT"
start_svc "lifeboat"  "$PIDDIR/lifeboat.pid"  "$LOGDIR/lifeboat.log"  node apps/lifeboat/server.js
start_svc "nextjs"    "$PIDDIR/nextjs.pid"    "$LOGDIR/nextjs.log"    npx --prefix apps/frontend next start -p 3000 apps/frontend

echo "waiting for health checks..."
for i in $(seq 1 30); do
  LB_OK=""; NX_OK=""
  curl -sf -o /dev/null http://127.0.0.1:8080/api/health && LB_OK=1 || true
  curl -sf -o /dev/null http://127.0.0.1:3000/ && NX_OK=1 || true
  if [ -n "$LB_OK" ] && [ -n "$NX_OK" ]; then break; fi
  sleep 2
done

echo ""
echo "Decentralflix is running:"
echo "  Marketing site : http://localhost:3000   (also http://100.85.119.8:3000)"
echo "  Working service: http://localhost:8080   (also http://100.85.119.8:8080)"
echo "  Logs: $LOGDIR   PIDs: $PIDDIR"
curl -sf -o /dev/null http://127.0.0.1:8080/api/health && echo "  lifeboat : OK" || echo "  lifeboat : NOT RESPONDING (see $LOGDIR/lifeboat.log)"
curl -sf -o /dev/null http://127.0.0.1:3000/ && echo "  nextjs   : OK" || echo "  nextjs   : NOT RESPONDING (see $LOGDIR/nextjs.log)"
