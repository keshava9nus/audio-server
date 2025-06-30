#!/bin/bash

# Stop Audio Server Script
echo "🛑 Stopping Audio Server..."

# Kill processes by name
echo "Stopping Node.js server..."
pkill -f "node server.js" && echo "✅ Node.js server stopped" || echo "ℹ️  No Node.js server running"

echo "Stopping pktriot tunnel..."
pkill -f "pktriot" && echo "✅ Pktriot tunnel stopped" || echo "ℹ️  No pktriot tunnel running"

# Clean up PID files
rm -f .node_pid .pktriot_pid

echo ""
echo "🔴 All services stopped"