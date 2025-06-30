#!/bin/bash

# Simple Audio Server Startup Script
echo "🎵 Starting Audio Server..."

# Kill any existing processes
echo "Cleaning up existing processes..."
pkill -f "node server.js" 2>/dev/null || true
pkill -f "pktriot" 2>/dev/null || true
sleep 2

# Start Node.js server in background
echo "Starting Node.js server on port 8000..."
node server.js &
NODE_PID=$!
echo "✅ Node.js server started (PID: $NODE_PID)"

# Wait for server to start
sleep 3

# Start pktriot tunnel
echo "Starting pktriot tunnel..."
cd pktriot-0.15.6
./pktriot http 8000 &
PKTRIOT_PID=$!
cd ..
echo "✅ Pktriot tunnel started (PID: $PKTRIOT_PID)"

# Display URLs
echo ""
echo "🚀 Services started successfully!"
echo "=================================="
echo "Local server:  http://localhost:8000"
echo "Public tunnel: https://sleepy-thunder-45656.pktriot.net"
echo "GitHub Pages:  https://keshava9nus.github.io/tunnel_test"
echo ""
echo "💡 To stop services, run: ./stop.sh"
echo "📊 To view logs, check the terminal output"
echo ""
echo "Press Ctrl+C to stop all services"

# Save PIDs for stop script
echo "$NODE_PID" > .node_pid
echo "$PKTRIOT_PID" > .pktriot_pid

# Wait for processes
wait
