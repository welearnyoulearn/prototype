#!/bin/bash
set -e

export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "$(git rev-parse --show-toplevel)"

# Load env vars
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== WLYL Local CI ===${NC}"
echo ""

STEP=1

# --- Type Check ---
echo -e "${YELLOW}[$STEP/3] Type checking...${NC}"
npx tsc --noEmit
echo -e "${GREEN}[$STEP/3] Type check passed${NC}"
echo ""
STEP=$((STEP + 1))

# --- Build ---
echo -e "${YELLOW}[$STEP/3] Building app...${NC}"
npm run build
echo -e "${GREEN}[$STEP/3] Build passed${NC}"
echo ""
STEP=$((STEP + 1))

# --- E2E Tests ---
echo -e "${YELLOW}[$STEP/3] Running E2E tests...${NC}"
npx playwright test
E2E_EXIT=$?

if [ $E2E_EXIT -ne 0 ]; then
  echo ""
  echo -e "${RED}[$STEP/3] E2E tests FAILED${NC}"
  echo -e "${RED}Check test-results/ for screenshots and traces${NC}"
  exit 1
fi

echo -e "${GREEN}[$STEP/3] E2E tests passed${NC}"
echo ""
echo -e "${GREEN}=== All checks passed ===${NC}"
