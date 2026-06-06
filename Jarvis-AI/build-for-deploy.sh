#!/bin/bash
set -e
cd extracted/Jarvis-AI

echo "==> Building frontend..."
pnpm --filter @workspace/jarvis run build

echo "==> Building API server..."
pnpm --filter @workspace/api-server run build

echo "==> Build complete."
