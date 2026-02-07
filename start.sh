#!/bin/bash
set -e

echo "Starting backend..."
# Start FastAPI backend in background
cd /app/backend
python main.py > /tmp/backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready (check health endpoint)
echo "Waiting for backend to be ready..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:8000/api/health > /dev/null 2>&1; then
    echo "Backend is ready! (PID: $BACKEND_PID)"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Warning: Backend health check timed out, but continuing..."
  fi
  sleep 1
done

echo "Starting frontend..."
# Start Next.js frontend (production mode)
cd /app/frontend
PORT=3000 npm start > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started (PID: $FRONTEND_PID) on port 3000"
echo "=== Services running ==="
echo "Frontend: http://localhost:3000"
echo "Backend: http://localhost:8000"
echo "=== Waiting for requests ==="

# Keep script running and show logs
tail -f /tmp/backend.log /tmp/frontend.log

# Function to cleanup on exit
cleanup() {
    echo "Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGTERM SIGINT

# Wait for processes
wait $BACKEND_PID $FRONTEND_PID

