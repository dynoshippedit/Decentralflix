#!/bin/bash
# =============================================================================
# DecentralFlix — Live Build Progress Dashboard
# Run in a separate terminal while autonomous-build.sh runs in another
# Usage: ./watch-progress.sh
# =============================================================================

BUILD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QUEUE="$BUILD_DIR/task-queue.json"
BUILD_LOG="$BUILD_DIR/BUILD.log"
PROJECT_LOG="/home/dino/Decentralflix/live-build-status.log"
PID_FILE="$BUILD_DIR/driver.pid"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
CLEAR='\033[2J\033[H'

render_dashboard() {
    echo -en "$CLEAR"

    # Header
    echo -e "${BOLD}${BLUE}╔════════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${BLUE}║${RESET}  ${BOLD}DECENTRALFLIX — Autonomous Build Dashboard${RESET}               ${BOLD}${BLUE}║${RESET}"
    echo -e "${BOLD}${BLUE}║${RESET}  $(date '+%Y-%m-%d %H:%M:%S')                                    ${BOLD}${BLUE}║${RESET}"
    echo -e "${BOLD}${BLUE}╚════════════════════════════════════════════════════════════╝${RESET}"
    echo ""

    # Driver status
    if [[ -f "$PID_FILE" ]]; then
        local pid
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "  Driver: ${GREEN}${BOLD}RUNNING${RESET} (PID $pid)"
        else
            echo -e "  Driver: ${RED}${BOLD}STOPPED${RESET} (stale PID $pid)"
        fi
    else
        echo -e "  Driver: ${RED}${BOLD}NOT RUNNING${RESET}"
        echo -e "  ${YELLOW}Start with: cd $BUILD_DIR && ./autonomous-build.sh${RESET}"
    fi
    echo ""

    # Task progress
    if [[ -f "$QUEUE" ]]; then
        local total completed pending failed in_progress
        total=$(jq '.tasks | length' "$QUEUE" 2>/dev/null || echo 0)
        completed=$(jq '[.tasks[] | select(.status=="completed")] | length' "$QUEUE" 2>/dev/null || echo 0)
        failed=$(jq '[.tasks[] | select(.status=="failed")] | length' "$QUEUE" 2>/dev/null || echo 0)
        pending=$(jq '[.tasks[] | select(.status=="pending")] | length' "$QUEUE" 2>/dev/null || echo 0)
        in_progress=$(jq '[.tasks[] | select(.status=="in_progress")] | length' "$QUEUE" 2>/dev/null || echo 0)

        # Progress bar
        local pct=0
        if [[ "$total" -gt 0 ]]; then
            pct=$(( completed * 100 / total ))
        fi
        local bar_filled=$(( pct * 40 / 100 ))
        local bar_empty=$(( 40 - bar_filled ))
        local bar=""
        for ((i=0; i<bar_filled; i++)); do bar+="█"; done
        for ((i=0; i<bar_empty; i++)); do bar+="░"; done

        echo -e "  ${BOLD}Progress: ${GREEN}$completed${RESET}/$total tasks (${BOLD}$pct%${RESET})"
        echo -e "  ${GREEN}$bar${RESET} $pct%"
        echo ""
        echo -e "  ${GREEN}✓ Completed: $completed${RESET}  |  ${CYAN}⟳ Running: $in_progress${RESET}  |  ${YELLOW}⧖ Pending: $pending${RESET}  |  ${RED}✗ Failed: $failed${RESET}"
        echo ""

        # Task list
        echo -e "${BOLD}  Tasks:${RESET}"
        jq -r '.tasks[] | "\(.id)|\(.status)|\(.name)"' "$QUEUE" 2>/dev/null | while IFS='|' read -r id status name; do
            local icon color
            case "$status" in
                completed)  icon="✓"; color="$GREEN";;
                in_progress) icon="⟳"; color="$CYAN";;
                failed)     icon="✗"; color="$RED";;
                pending)    icon="○"; color="$YELLOW";;
                *)          icon="?"; color="$RESET";;
            esac
            printf "  ${color}%s ${BOLD}%s${RESET} ${color}%s${RESET}\n" "$icon" "$id" "$name"
        done
    fi
    echo ""

    # Recent build log entries
    echo -e "${BOLD}  Recent Build Log:${RESET}"
    echo -e "  ${BLUE}─────────────────────────────────────────────────────────────${RESET}"
    if [[ -f "$BUILD_LOG" ]]; then
        tail -15 "$BUILD_LOG" 2>/dev/null | while IFS= read -r line; do
            if echo "$line" | grep -q "COMPLETE\|✓"; then
                echo -e "  ${GREEN}$line${RESET}"
            elif echo "$line" | grep -q "FAIL\|ERROR\|✗"; then
                echo -e "  ${RED}$line${RESET}"
            elif echo "$line" | grep -q "STARTING\|▶"; then
                echo -e "  ${CYAN}$line${RESET}"
            else
                echo -e "  $line"
            fi
        done
    else
        echo -e "  ${YELLOW}No build log yet${RESET}"
    fi
    echo ""

    # Recent project log
    echo -e "${BOLD}  Project Log (last 5):${RESET}"
    echo -e "  ${BLUE}─────────────────────────────────────────────────────────────${RESET}"
    if [[ -f "$PROJECT_LOG" ]]; then
        tail -5 "$PROJECT_LOG" 2>/dev/null | while IFS= read -r line; do
            echo -e "  ${CYAN}$line${RESET}"
        done
    fi
    echo ""
    echo -e "  ${YELLOW}Refreshing every 10s. Ctrl+C to exit.${RESET}"
}

# Handle Ctrl+C cleanly
trap 'echo -e "\n${YELLOW}Dashboard closed.${RESET}"; exit 0' SIGINT

# Main loop
while true; do
    render_dashboard
    sleep 10
done
