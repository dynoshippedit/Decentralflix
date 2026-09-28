#!/bin/bash
# =============================================================================
# show-grok-changes.sh — Legacy change lister (review protocol archived)
# 
# This was created as part of the Claude review handoff system.
# Per user directive (full autonomy, no reviews needed), the forced review
# protocol (CLAUDE_REVIEW.md) has been archived and removed from instructions.
#
# This script is now deprecated for gating purposes. It can still be used
# manually to see what files changed recently if desired.
# =============================================================================

PROJECT="/home/dino/Decentralflix"
MARKER="$PROJECT/autonomous-build/.last-review"
QUEUE="$PROJECT/autonomous-build/task-queue.json"

CYAN='\033[0;36m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RESET='\033[0m'; BOLD='\033[1m'

echo -e "${BOLD}${CYAN}=== Grok changes since last Claude review ===${RESET}"

if [[ -f "$MARKER" ]]; then
    LAST=$(cat "$MARKER")
    echo "Last review: $LAST"
    echo ""
    echo -e "${BOLD}Files modified since then:${RESET}"
    find "$PROJECT/apps/frontend" "$PROJECT/packages/contracts/contracts" "$PROJECT/cloudflare-worker" \
        -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.sol' -o -name '*.js' \) \
        -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/artifacts/*' -not -path '*/typechain-types/*' \
        -newer "$MARKER" -printf '  %TY-%Tm-%Td %TH:%TM  %p\n' 2>/dev/null | sort
else
    echo -e "${YELLOW}No .last-review marker yet — this is the first review.${RESET}"
    echo "After reviewing, run: date -Iseconds > $MARKER"
    echo ""
    echo -e "${BOLD}Most recently modified code files (top 25):${RESET}"
    find "$PROJECT/apps/frontend" "$PROJECT/packages/contracts/contracts" "$PROJECT/cloudflare-worker" \
        -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.sol' -o -name '*.js' \) \
        -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/artifacts/*' -not -path '*/typechain-types/*' \
        -printf '%T@ %TY-%Tm-%Td %TH:%TM  %p\n' 2>/dev/null | sort -rn | head -25 | cut -d' ' -f2-
fi

echo ""
echo -e "${BOLD}${CYAN}=== Tasks awaiting review (needs_review) ===${RESET}"
python3 -c "
import json
try:
    q = json.load(open('$QUEUE'))
    nr = [t for t in q['tasks'] if t.get('status') == 'needs_review']
    if not nr:
        print('  (none)')
    for t in sorted(nr, key=lambda x: x.get('priority', 999)):
        print(f\"  {t['id']} (prio {t.get('priority','?')}): {t['name']}\")
        print(f\"      verify: {t.get('verify_cmd','(none)')}\")
except Exception as e:
    print(f'  error reading queue: {e}')
"

echo ""
echo -e "${BOLD}${CYAN}=== Kicked-back tasks (pending with review_notes) ===${RESET}"
python3 -c "
import json
try:
    q = json.load(open('$QUEUE'))
    kb = [t for t in q['tasks'] if t.get('status') == 'pending' and t.get('review_notes')]
    if not kb:
        print('  (none)')
    for t in kb:
        print(f\"  {t['id']}: {t['name']}\")
        print(f\"      notes: {t['review_notes']}\")
except Exception as e:
    print(f'  error: {e}')
"

echo ""
echo -e "${YELLOW}Note: Review handoff protocol has been archived (full autonomy mode).${RESET}"
echo -e "${YELLOW}This script is legacy and no longer used for progress gating.${RESET}"
