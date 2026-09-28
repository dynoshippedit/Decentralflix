#!/usr/bin/env bash
# Stop Decentralflix services by exact PID (never broad kills).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDDIR="$ROOT/.pids"
for name in lifeboat nextjs; do
  pidfile="$PIDDIR/$name.pid"
  if [ -f "$pidfile" ]; then
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      echo "stopping $name (pid $pid)..."
      kill "$pid"
      for i in $(seq 1 15); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
      kill -0 "$pid" 2>/dev/null && { echo "$name did not exit, sending KILL"; kill -9 "$pid"; } || true
    else
      echo "$name not running (stale pidfile)"
    fi
    rm -f "$pidfile"
  else
    echo "$name: no pidfile"
  fi
done
echo "done"
