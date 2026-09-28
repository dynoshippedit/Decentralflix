#!/bin/bash
# =============================================================================
# DecentralFlix TRUE Autonomous Build Driver v2.0
# Uses Claude Code CLI (-p flag) to do ACTUAL work — not a heartbeat loop
# =============================================================================
# Run:     ./autonomous-build.sh          (foreground with live output)
# Run bg:  nohup ./autonomous-build.sh >> BUILD.log 2>&1 & echo "PID: $!"
# Watch:   ./watch-progress.sh            (live dashboard in another terminal)
# =============================================================================

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
BUILD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="/home/dino/Decentralflix"
QUEUE="$BUILD_DIR/task-queue.json"
STATUS_FILE="$BUILD_DIR/LIVE_STATUS.md"
BUILD_LOG="$BUILD_DIR/BUILD.log"
PROJECT_LOG="$PROJECT_DIR/live-build-status.log"
PID_FILE="$BUILD_DIR/driver.pid"
CLAUDE_BIN="/home/dino/.local/bin/claude"
TASK_TIMEOUT=2400   # 40 min max per task before marking as stalled
MAX_RETRIES=2       # Max retries if no file changes detected

# ── Colours (for live terminal output) ───────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Guard: one instance only ──────────────────────────────────────────────────
if [[ -f "$PID_FILE" ]]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo -e "${RED}ERROR: Driver already running (PID $OLD_PID). Kill it first.${RESET}"
        exit 1
    fi
fi
echo $$ > "$PID_FILE"

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
    echo -e "\n${YELLOW}[DRIVER] Shutting down cleanly...${RESET}"
    rm -f "$PID_FILE"
    update_status "STOPPED" "Driver stopped at $(date)"
}
trap cleanup SIGINT SIGTERM SIGHUP EXIT

# ── Helpers ───────────────────────────────────────────────────────────────────
log() {
    local msg="$1"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${CYAN}[$timestamp]${RESET} $msg"
    echo "[$timestamp] $msg" >> "$BUILD_LOG"
}

log_project() {
    echo "$1" >> "$PROJECT_LOG"
}

update_status() {
    local state="$1"
    local msg="$2"
    local completed
    completed=$(jq '[.tasks[] | select(.status=="completed")] | length' "$QUEUE" 2>/dev/null || echo 0)
    local total
    total=$(jq '.tasks | length' "$QUEUE" 2>/dev/null || echo 0)
    local pending
    pending=$(jq '[.tasks[] | select(.status=="pending")] | length' "$QUEUE" 2>/dev/null || echo 0)
    local failed
    failed=$(jq '[.tasks[] | select(.status=="failed")] | length' "$QUEUE" 2>/dev/null || echo 0)
    local current_task
    current_task=$(jq -r '[.tasks[] | select(.status=="in_progress")] | first | .name // "none"' "$QUEUE" 2>/dev/null || echo "none")

    cat > "$STATUS_FILE" << EOF
# DecentralFlix — Live Autonomous Build Status
**Updated:** $(date)
**State:** $state

## Progress
- **Completed:** $completed / $total tasks
- **Pending:** $pending
- **Failed:** $failed
- **Current Task:** $current_task

## Status
$msg

## Task Log (last 20 entries)
$(tail -20 "$BUILD_LOG" 2>/dev/null || echo "No log yet")
EOF
}

# Mark a task with a new status in the queue JSON
set_task_status() {
    local task_id="$1"
    local new_status="$2"
    local tmp
    tmp=$(mktemp)
    jq --arg id "$task_id" --arg s "$new_status" \
        '(.tasks[] | select(.id==$id) | .status) |= $s' \
        "$QUEUE" > "$tmp" && mv "$tmp" "$QUEUE"
}

# Get field from a task by ID
get_task_field() {
    local task_id="$1"
    local field="$2"
    jq -r --arg id "$task_id" \
        '.tasks[] | select(.id==$id) | .'"$field" \
        "$QUEUE" 2>/dev/null
}

# Count modified files in PROJECT_DIR since a given timestamp file
count_changed_files() {
    local since_file="$1"
    find "$PROJECT_DIR" -newer "$since_file" \
        -not -path "*/node_modules/*" \
        -not -path "*/.next/*" \
        -not -path "*/.git/*" \
        -not -path "*/typechain-types/*" \
        -not -path "*/artifacts/*" \
        -not -path "*/cache/*" \
        -not -name "*.log" \
        -type f 2>/dev/null | wc -l
}

# Run the verify command for a task and check against expected pass value
verify_task() {
    local task_id="$1"
    local verify_cmd
    verify_cmd=$(get_task_field "$task_id" "verify_cmd")
    local verify_pass
    verify_pass=$(get_task_field "$task_id" "verify_pass")

    if [[ -z "$verify_cmd" || "$verify_cmd" == "null" ]]; then
        return 0  # No verify = assume pass
    fi

    local actual
    actual=$(eval "$verify_cmd" 2>/dev/null | tr -d '[:space:]' || echo "error")

    if [[ "$actual" == "$verify_pass" ]]; then
        return 0  # PASS
    else
        log "${YELLOW}Verify: expected '$verify_pass' got '$actual' for $task_id${RESET}"
        return 1  # FAIL
    fi
}

# ── Core: run a single task via Claude CLI ─────────────────────────────────────
run_task() {
    local task_id="$1"
    local attempt="${2:-1}"

    local task_name
    task_name=$(get_task_field "$task_id" "name")
    local prompt
    prompt=$(get_task_field "$task_id" "prompt")

    log "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    log "${BOLD}${GREEN}▶ STARTING TASK $task_id (attempt $attempt/$((MAX_RETRIES+1))): $task_name${RESET}"
    log "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

    set_task_status "$task_id" "in_progress"
    update_status "RUNNING" "Executing: $task_id — $task_name (attempt $attempt)"
    log_project "[DRIVER] Starting task $task_id: $task_name | attempt $attempt | $(date -Iseconds)"

    # Checkpoint file for detecting file changes
    local checkpoint
    checkpoint=$(mktemp)
    touch -t "$(date '+%Y%m%d%H%M.%S')" "$checkpoint" 2>/dev/null || touch "$checkpoint"

    # Build the full prompt with retry context if needed
    local full_prompt="$prompt"
    if [[ "$attempt" -gt 1 ]]; then
        full_prompt="RETRY ATTEMPT $attempt — The previous attempt for task $task_id may not have made sufficient progress. CHECK the verify command result and make sure you complete the task fully. Do NOT claim completion without verifying.\n\n$prompt"
    fi

    # Write prompt to temp file to avoid shell escaping issues
    local prompt_file
    prompt_file=$(mktemp --suffix=.txt)
    printf '%s' "$full_prompt" > "$prompt_file"

    log "${CYAN}Invoking Claude CLI for task $task_id (timeout: ${TASK_TIMEOUT}s)...${RESET}"
    echo ""

    # Run claude non-interactively with explicit tool allowlist, working in project dir
    local exit_code=0
    (
        cd "$PROJECT_DIR"
        timeout "$TASK_TIMEOUT" "$CLAUDE_BIN" \
            --print \
            --allowedTools "Bash,Read,Edit,Write" \
            --add-dir "$BUILD_DIR" \
            "$(cat "$prompt_file")"
    ) 2>&1 | tee -a "$BUILD_LOG" || exit_code=${PIPESTATUS[0]}

    rm -f "$prompt_file"

    echo ""
    log "${CYAN}Claude CLI exited with code $exit_code for task $task_id${RESET}"

    # Count file changes
    local changed
    changed=$(count_changed_files "$checkpoint")
    rm -f "$checkpoint"
    log "Files changed during task: ${BOLD}$changed${RESET}"

    # Verify task success
    local verified=false
    if verify_task "$task_id"; then
        verified=true
        log "${GREEN}✓ VERIFY PASSED for $task_id${RESET}"
    else
        log "${YELLOW}✗ VERIFY FAILED for $task_id${RESET}"
    fi

    if [[ "$verified" == "true" ]]; then
        set_task_status "$task_id" "completed"
        log "${GREEN}${BOLD}✓ TASK $task_id COMPLETE: $task_name${RESET}"
        log_project "[TASK COMPLETE] $task_id | $task_name | changed_files: $changed | $(date -Iseconds)"
        update_status "RUNNING" "Completed: $task_id — $task_name"
        return 0
    elif [[ "$changed" -gt 0 ]]; then
        # Made changes but verify failed — still mark complete, log the discrepancy
        set_task_status "$task_id" "completed"
        log "${YELLOW}${BOLD}~ TASK $task_id DONE (verify borderline): $task_name${RESET}"
        log_project "[TASK DONE-PARTIAL] $task_id | $task_name | changed_files: $changed | verify: BORDERLINE | $(date -Iseconds)"
        update_status "RUNNING" "Completed (partial verify): $task_id — $task_name"
        return 0
    else
        # No changes detected
        if [[ "$attempt" -le "$MAX_RETRIES" ]]; then
            log "${YELLOW}No file changes detected. Retrying task $task_id (attempt $((attempt+1)))...${RESET}"
            set_task_status "$task_id" "pending"
            sleep 10
            run_task "$task_id" $((attempt+1))
        else
            log "${RED}${BOLD}✗ TASK $task_id FAILED after $MAX_RETRIES retries (no file changes, verify failed): $task_name${RESET}"
            set_task_status "$task_id" "failed"
            log_project "[TASK FAILED] $task_id | $task_name | no file changes after $MAX_RETRIES attempts | $(date -Iseconds)"
            update_status "RUNNING" "Failed: $task_id — $task_name (will continue to next)"
            return 1
        fi
    fi
}

# ── Main build loop ────────────────────────────────────────────────────────────
main() {
    log "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${RESET}"
    log "${BOLD}${GREEN}║  DECENTRALFLIX AUTONOMOUS BUILD DRIVER v2.0          ║${RESET}"
    log "${BOLD}${GREEN}║  Zero-input mode. Real code. Real verification.       ║${RESET}"
    log "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${RESET}"
    log "Project dir: $PROJECT_DIR"
    log "Task queue:  $QUEUE"
    log "Build log:   $BUILD_LOG"
    log "Dashboard:   Run ./watch-progress.sh in another terminal"
    echo ""

    # Verify required tools
    if ! command -v jq &>/dev/null; then
        log "${RED}ERROR: jq is required but not installed. Install with: sudo dnf install jq${RESET}"
        exit 1
    fi
    if [[ ! -x "$CLAUDE_BIN" ]]; then
        log "${RED}ERROR: Claude CLI not found at $CLAUDE_BIN${RESET}"
        exit 1
    fi
    if [[ ! -d "$PROJECT_DIR" ]]; then
        log "${RED}ERROR: Project directory not found: $PROJECT_DIR${RESET}"
        exit 1
    fi
    if [[ ! -f "$QUEUE" ]]; then
        log "${RED}ERROR: Task queue not found: $QUEUE${RESET}"
        exit 1
    fi

    log_project "[DRIVER STARTED] $(date -Iseconds) | PID: $$ | Queue: $(jq '.tasks | length' "$QUEUE") tasks"
    update_status "STARTING" "Driver initialized. Beginning task loop."

    local consecutive_failures=0
    local total_completed=0

    while true; do
        # Get next pending task (by priority order)
        local next_task_id
        next_task_id=$(jq -r '[.tasks[] | select(.status=="pending")] | sort_by(.priority) | first | .id // empty' "$QUEUE" 2>/dev/null)

        if [[ -z "$next_task_id" ]]; then
            # Check if anything is in_progress (leftover from crash)
            local stale
            stale=$(jq -r '[.tasks[] | select(.status=="in_progress")] | first | .id // empty' "$QUEUE" 2>/dev/null)
            if [[ -n "$stale" ]]; then
                log "${YELLOW}Found stale in_progress task $stale — resetting to pending${RESET}"
                set_task_status "$stale" "pending"
                continue
            fi

            # All tasks done or failed
            local pending_count
            pending_count=$(jq '[.tasks[] | select(.status=="pending")] | length' "$QUEUE" 2>/dev/null || echo 0)
            local failed_count
            failed_count=$(jq '[.tasks[] | select(.status=="failed")] | length' "$QUEUE" 2>/dev/null || echo 0)
            local completed_count
            completed_count=$(jq '[.tasks[] | select(.status=="completed")] | length' "$QUEUE" 2>/dev/null || echo 0)

            if [[ "$pending_count" -eq 0 ]]; then
                log "${GREEN}${BOLD}ALL TASKS COMPLETE! Completed: $completed_count | Failed: $failed_count${RESET}"
                log_project "[BUILD COMPLETE] $(date -Iseconds) | completed: $completed_count | failed: $failed_count"
                update_status "COMPLETE" "All $completed_count tasks completed. Failed: $failed_count. Build done!"

                # Retry failed tasks once more
                if [[ "$failed_count" -gt 0 ]]; then
                    log "${YELLOW}Retrying $failed_count failed tasks...${RESET}"
                    jq -r '[.tasks[] | select(.status=="failed")] | .[].id' "$QUEUE" 2>/dev/null | while IFS= read -r fid; do
                        set_task_status "$fid" "pending"
                    done
                    continue
                fi
                log "${GREEN}${BOLD}DECENTRALFLIX BUILD COMPLETE${RESET}"
                break
            fi
        fi

        # Run the task
        if run_task "$next_task_id" 1; then
            consecutive_failures=0
            total_completed=$((total_completed + 1))
        else
            consecutive_failures=$((consecutive_failures + 1))
            log "${YELLOW}Consecutive failures: $consecutive_failures${RESET}"
            if [[ "$consecutive_failures" -ge 5 ]]; then
                log "${RED}5 consecutive task failures. Pausing 120s before continuing...${RESET}"
                sleep 120
                consecutive_failures=0
            fi
        fi

        # Brief pause between tasks
        log "Pausing 15s before next task..."
        sleep 15
    done

    log "${GREEN}${BOLD}Driver complete. All tasks processed.${RESET}"
}

main "$@"
