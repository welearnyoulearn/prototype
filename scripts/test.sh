#!/bin/bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== WLYL Local CI ===${NC}"
echo ""

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}Docker is not running. Start Docker Desktop and try again.${NC}"
  exit 1
fi

STEP=1

# --- Type Check ---
echo -e "${YELLOW}[$STEP/3] Type checking...${NC}"
docker compose run --rm --no-deps app npx tsc --noEmit
echo -e "${GREEN}[$STEP/3] Type check passed${NC}"
echo ""
STEP=$((STEP + 1))

# --- Build ---
echo -e "${YELLOW}[$STEP/3] Building app...${NC}"
docker compose build app
echo -e "${GREEN}[$STEP/3] Build passed${NC}"
echo ""
STEP=$((STEP + 1))

# --- E2E Tests ---
echo -e "${YELLOW}[$STEP/3] Running E2E tests...${NC}"
docker compose up -d db
echo "Waiting for database..."
sleep 3
docker compose up -d app
echo "Waiting for app to start..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker compose --profile test run --rm e2e
E2E_EXIT=$?

# Cleanup
docker compose --profile test down -v

if [ $E2E_EXIT -ne 0 ]; then
  echo ""
  echo -e "${RED}[$STEP/3] E2E tests FAILED${NC}"
  echo -e "${RED}Check test-results/ for screenshots and traces${NC}"
  exit 1
fi

echo -e "${GREEN}[$STEP/3] E2E tests passed${NC}"
echo ""
echo -e "${GREEN}=== All checks passed ===${NC}"
