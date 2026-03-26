#!/bin/bash
set -e

VERSION=$(cat VERSION | tr -d '[:space:]')
if [ -z "$VERSION" ]; then
  echo "Error: VERSION file is empty"
  exit 1
fi

echo "Building tmdx v${VERSION}..."

DIST_DIR="dist/v${VERSION}"
mkdir -p "${DIST_DIR}"

sed -i "s/window.__VERSION__ = '';/window.__VERSION__ = '${VERSION}';/" \
  cloud/src-client/app.js

echo "[cloud] npm run build..."
(cd cloud && npm run build)
echo "[cloud] go build..."
(cd cloud && CGO_ENABLED=0 go build \
  -ldflags "-X cloud/internal/version.Version=${VERSION}" \
  -o "../${DIST_DIR}/tmd-cloud" ./cmd/cloud/)

echo "[agent] go build (linux/amd64)..."
(cd agent && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
  -ldflags "-X agent/internal/config.Version=${VERSION}" \
  -o "../${DIST_DIR}/tmd-agent-linux-amd64" ./cmd/tmd-agent)

echo "[agent] go build (darwin/arm64)..."
(cd agent && CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build \
  -ldflags "-X agent/internal/config.Version=${VERSION}" \
  -o "../${DIST_DIR}/tmd-agent-darwin-arm64" ./cmd/tmd-agent)

sed -i "s/window.__VERSION__ = '${VERSION}';/window.__VERSION__ = '';/" \
  cloud/src-client/app.js

echo ""
echo "Done → ${DIST_DIR}/"
ls -lh "${DIST_DIR}/"
