#!/usr/bin/env bash
set -e

ARTIFACT_DIR="/root/.gemini/antigravity-cli/brain/327e8c5c-5da6-4094-a05a-834162ea34a3"

echo "Building lightweight Puppeteer test container..."
docker build -t meterpulse-test:latest -f tests/Dockerfile.test tests/

TEST_SCRIPT="${1:-test_ui.cjs}"

echo "Running UI tests & capturing screenshots using ${TEST_SCRIPT}..."
docker run --rm \
  --network meterpulse-network \
  --cap-add=SYS_ADMIN \
  --security-opt seccomp=unconfined \
  -e TARGET_URL=http://meterpulse-frontend:80 \
  -e SCREENSHOT_DIR=/screenshots \
  -v "${ARTIFACT_DIR}:/screenshots" \
  -v "$(pwd)/tests:/app/tests:ro" \
  meterpulse-test:latest node "tests/${TEST_SCRIPT}"
