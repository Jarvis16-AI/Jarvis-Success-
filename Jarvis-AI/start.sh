#!/bin/bash
set -e

# Kill any leftover processes on our ports
fuser -k 5000/tcp 8080/tcp 2>/dev/null || true
sleep 1

echo "Starting API server on port 8080..."
pnpm --filter @workspace/api-server run dev &
API_PID=$!

echo "Starting frontend on port 5000..."
PORT=5000 BASE_PATH=/ pnpm --filter @workspace/jarvis run dev &
FRONTEND_PID=$!

echo "Both services started."
wait $API_PID $FRONTEND_PID
