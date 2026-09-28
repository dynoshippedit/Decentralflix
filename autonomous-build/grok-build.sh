#!/bin/bash
# =============================================================================
# DecentralFlix — Grok Autonomous Build Driver
# Mirrors autonomous-build.sh but uses Grok CLI instead of Claude CLI
# =============================================================================
# Run:     ./grok-build.sh              (foreground with live output)
# Run bg:  nohup ./grok-build.sh >> GROK_BUILD.log 2>&1 & echo "PID: $!"
# Watch:   ./watch-progress.sh          (live dashboard in another terminal)
# =============================================================================

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
BUILD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="/home/dino/Decentralflix"
QUEUE="$BUILD_DIR/task-queue.json"
STATUS_FILE="$BUILD_DIR/LIVE_STATUS.md"
BUILD_LOG="$BUILD_DIR/GROK_BUILD.log"
PROJECT_LOG="$PROJECT_DIR/live-build-status.log"
PID_FILE="$BUILD_DIR/grok-driver.pid"
GROK_BIN="/home/dino/.grok/bin/grok"
TASK_TIMEOUT=2400   # 40 min max per task
MAX_RETRIES=2

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Guard: one instance only ──────────────────────────────────────────────────
if [[ -f "$PID_FILE" ]]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo -e "${RED}ERROR: Grok driver already running (PID $OLD_PID). Kill it first.${RESET}"
        exit 1
    fi
fi
echo $$ > "$PID_FILE"

# ── Cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
    echo -e "\n${YELLOW}[GROK DRIVER] Shutting down...${RESET}"
    rm -f "$PID_FILE"
}
trap cleanup SIGINT SIGTERM SIGHUP EXIT

# ── Helpers ───────────────────────────────────────────────────────────────────
log() {
    local msg="$1"
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${CYAN}[$ts]${RESET} $msg"
    echo "[$ts] $msg" >> "$BUILD_LOG"
}

update_queue_status() {
    local task_id="$1"
    local new_status="$2"
    local tmp
    tmp=$(mktemp)
    python3 -c "
import json, sys
with open('$QUEUE') as f:
    q = json.load(f)
for t in q['tasks']:
    if t['id'] == '$task_id':
        t['status'] = '$new_status'
with open('$tmp', 'w') as f:
    json.dump(q, f, indent=2)
" && mv "$tmp" "$QUEUE"
}

get_next_pending() {
    python3 -c "
import json
with open('$QUEUE') as f:
    q = json.load(f)
pending = [t for t in q['tasks'] if t['status'] == 'pending']
if not pending:
    print('')
else:
    pending.sort(key=lambda t: t['priority'])
    t = pending[0]
    print(t['id'])
"
}

get_task_field() {
    local task_id="$1"
    local field="$2"
    python3 -c "
import json
with open('$QUEUE') as f:
    q = json.load(f)
for t in q['tasks']:
    if t['id'] == '$task_id':
        print(t.get('$field', ''))
        break
"
}

run_verify() {
    local task_id="$1"
    local verify_cmd
    verify_cmd=$(get_task_field "$task_id" "verify_cmd")
    local verify_pass
    verify_pass=$(get_task_field "$task_id" "verify_pass")
    if [[ -z "$verify_cmd" ]]; then
        return 0
    fi
    local result
    result=$(eval "$verify_cmd" 2>/dev/null || echo "ERROR")
    result=$(echo "$result" | tr -d '[:space:]')
    if [[ "$result" == "$verify_pass" ]]; then
        log "${GREEN}[VERIFY PASS] $task_id: got '$result' (expected '$verify_pass')${RESET}"
        return 0
    else
        log "${RED}[VERIFY FAIL] $task_id: got '$result' (expected '$verify_pass')${RESET}"
        return 1
    fi
}

# ── Bootstrap prompt file ─────────────────────────────────────────────────────
write_task_prompt() {
    local task_id="$1"
    local prompt_file="$2"
    local task_prompt
    task_prompt=$(python3 -c "
import json
with open('$QUEUE') as f:
    q = json.load(f)
for t in q['tasks']:
    if t['id'] == '$task_id':
        print(t.get('prompt', ''))
        break
")
    # Prepend the bootstrap context so Grok has full project awareness
    cat > "$prompt_file" << HEADER
CONTEXT: You are working on the DecentralFlix project. Full spec is at /home/dino/Decentralflix/GROK.md. Architecture review is at /home/dino/Decentralflix/ARCHITECTURE_REVIEW_v2.md. Task queue is at /home/dino/Decentralflix/autonomous-build/task-queue.json.

CRITICAL RULES:
- Never ask for input or approval
- Never write stubs — write real, working code
- Never claim done without running: cd /home/dino/Decentralflix && npx tsc --noEmit 2>&1 | tail -20
- For Solidity changes: cd /home/dino/Decentralflix/packages/contracts && npx hardhat compile
- After task complete: append one line to /home/dino/Decentralflix/live-build-status.log in format: [${task_id} COMPLETE] \$(date -Iseconds) | files_changed: N | tsc: PASS | <summary>
- Update /home/dino/Decentralflix/autonomous-build/task-queue.json: set ${task_id} status to "completed"
- Update /home/dino/Decentralflix/autonomous-build/LIVE_STATUS.md with current progress

NOTE: Grok may write files as hidden files (dot-prefixed). After writing any file, verify it exists at the expected non-hidden path. If you find a hidden version (e.g. .cloudflare-access.ts instead of cloudflare-access.ts), rename it to the correct non-hidden path.

NOW EXECUTE THIS TASK:

HEADER
    echo "$task_prompt" >> "$prompt_file"
}

# ── Hidden-file scanner (Grok sometimes writes .filename instead of filename) ──
fix_hidden_files() {
    local project="$1"
    local fixed=0
    # Scan lib/, hooks/, components/, app/ for hidden files that should be visible
    local search_dirs=(
        "$project/apps/frontend/lib"
        "$project/apps/frontend/hooks"
        "$project/apps/frontend/components"
        "$project/apps/frontend/app"
        "$project/cloudflare-worker"
        "$project/packages/contracts/contracts"
    )
    for dir in "${search_dirs[@]}"; do
        [[ -d "$dir" ]] || continue
        while IFS= read -r -d '' hidden_file; do
            local basename
            basename=$(basename "$hidden_file")
            local visible_name="${basename#.}"  # strip leading dot
            local visible_path
            visible_path="$(dirname "$hidden_file")/$visible_name"
            if [[ ! -f "$visible_path" ]]; then
                log "${YELLOW}[HIDDEN FILE FIX] Renaming $hidden_file → $visible_path${RESET}"
                mv "$hidden_file" "$visible_path"
                fixed=$((fixed + 1))
            fi
        done < <(find "$dir" -maxdepth 2 -name '.*' -type f \
            ! -name '.gitignore' ! -name '.env*' ! -name '.eslintrc*' \
            ! -name '.prettierrc*' ! -name '.babelrc*' -print0 2>/dev/null)
    done
    if [[ $fixed -gt 0 ]]; then
        log "${GREEN}[HIDDEN FILE FIX] Fixed $fixed hidden file(s)${RESET}"
    fi
}

# ── Main loop ─────────────────────────────────────────────────────────────────
log "${BOLD}${GREEN}DecentralFlix Grok Autonomous Build Driver — Starting${RESET}"
log "Project: $PROJECT_DIR"
log "Queue:   $QUEUE"
log "Log:     $BUILD_LOG"

if [[ ! -x "$GROK_BIN" ]]; then
    log "${RED}ERROR: Grok CLI not found at $GROK_BIN${RESET}"
    exit 1
fi

completed_count=0
failed_count=0

while true; do
    next_task=$(get_next_pending)
    if [[ -z "$next_task" ]]; then
        log "${GREEN}${BOLD}ALL TASKS COMPLETE! Build finished. Completed: $completed_count, Failed: $failed_count${RESET}"
        echo "[$(date -Iseconds)] [BUILD COMPLETE] All tasks done. Completed: $completed_count, Failed: $failed_count" >> "$PROJECT_LOG"
        break
    fi

    task_name=$(get_task_field "$next_task" "name")
    task_priority=$(get_task_field "$next_task" "priority")

    log "${BOLD}${BLUE}━━━ Starting $next_task (priority $task_priority): $task_name ━━━${RESET}"

    # Mark in-progress
    update_queue_status "$next_task" "in_progress"

    # Write task prompt file
    prompt_file=$(mktemp /tmp/grok-task-XXXXXX.md)
    write_task_prompt "$next_task" "$prompt_file"

    # Run Grok
    exit_code=0
    log "Invoking Grok CLI for $next_task..."
    timeout "$TASK_TIMEOUT" "$GROK_BIN" \
        --prompt-file "$prompt_file" \
        --permission-mode bypassPermissions \
        --always-approve \
        --cwd "$PROJECT_DIR" \
        2>&1 | tee -a "$BUILD_LOG" || exit_code=${PIPESTATUS[0]}

    rm -f "$prompt_file"

    # Fix any hidden files Grok wrote (known Grok quirk: .filename instead of filename)
    fix_hidden_files "$PROJECT_DIR"

    if [[ $exit_code -ne 0 ]]; then
        log "${RED}[WARN] Grok exited with code $exit_code for $next_task — checking verification anyway${RESET}"
    fi

    # Run verification
    retry=0
    verified=false
    while [[ $retry -le $MAX_RETRIES ]]; do
        if run_verify "$next_task"; then
            verified=true
            break
        fi
        retry=$((retry + 1))
        if [[ $retry -le $MAX_RETRIES ]]; then
            log "${YELLOW}Verification failed for $next_task — retry $retry/$MAX_RETRIES${RESET}"
            # Re-run Grok to fix
            fix_prompt_file=$(mktemp /tmp/grok-fix-XXXXXX.md)
            cat > "$fix_prompt_file" << FIX
The previous attempt at $next_task failed verification. Read the task-queue.json for the task $next_task and fix the issues so that its verify_cmd passes.

verify_cmd: $(get_task_field "$next_task" "verify_cmd")
expected result: $(get_task_field "$next_task" "verify_pass")

Rules: Never ask for input. Always run tsc after fixing TypeScript. Always run hardhat compile after fixing Solidity. Write real fixes not stubs.
FIX
            timeout "$TASK_TIMEOUT" "$GROK_BIN" \
                --prompt-file "$fix_prompt_file" \
                --permission-mode bypassPermissions \
                --always-approve \
                --cwd "$PROJECT_DIR" \
                2>&1 | tee -a "$BUILD_LOG" || true
            rm -f "$fix_prompt_file"
        fi
    done

    if $verified; then
        update_queue_status "$next_task" "completed"
        completed_count=$((completed_count + 1))
        log "${GREEN}[DONE] $next_task complete. Total completed: $completed_count${RESET}"
    else
        update_queue_status "$next_task" "failed"
        failed_count=$((failed_count + 1))
        log "${RED}[FAIL] $next_task failed after $MAX_RETRIES retries. Continuing to next task.${RESET}"
        echo "[$(date -Iseconds)] [${next_task} FAILED] Verification failed after retries" >> "$PROJECT_LOG"
    fi

    # Brief pause between tasks
    sleep 3
done
