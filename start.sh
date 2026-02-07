#!/bin/bash
set -e

# Start FastAPI backend in background
cd /app/backend
python main.py &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3

# Start Next.js frontend (production mode)
cd /app/frontend
PORT=3000 npm start &
FRONTEND_PID=$!

# Function to cleanup on exit
cleanup() {
    echo "Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGTERM SIGINT

# Wait for processes
wait $BACKEND_PID $FRONTEND_PID

