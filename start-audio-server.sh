#!/bin/bash

# Audio Server Startup Script
# This script starts both the Node.js audio server and the pktriot tunnel

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NODE_PORT=8000
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKTRIOT_DIR="$SCRIPT_DIR/pktriot-0.15.6"
PKTRIOT_BINARY="$PKTRIOT_DIR/pktriot"
SERVER_SCRIPT="$SCRIPT_DIR/server.js"

echo -e "${BLUE}🎵 Audio Server Startup Script${NC}"
echo "=================================="

# Function to cleanup processes on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"
    
    # Kill Node.js server
    if [ ! -z "$NODE_PID" ]; then
        echo "Stopping Node.js server (PID: $NODE_PID)"
        kill $NODE_PID 2>/dev/null || true
    fi
    
    # Kill pktriot tunnel
    if [ ! -z "$PKTRIOT_PID" ]; then
        echo "Stopping pktriot tunnel (PID: $PKTRIOT_PID)"
        kill $PKTRIOT_PID 2>/dev/null || true
    fi
    
    echo -e "${GREEN}Services stopped cleanly${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

# Check if server.js exists
if [ ! -f "$SERVER_SCRIPT" ]; then
    echo -e "${RED}Error: server.js not found at $SERVER_SCRIPT${NC}"
    exit 1
fi

# Check if pktriot binary exists
if [ ! -f "$PKTRIOT_BINARY" ]; then
    echo -e "${RED}Error: pktriot binary not found at $PKTRIOT_BINARY${NC}"
    exit 1
fi

# Check if port is already in use
if lsof -Pi :$NODE_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}Warning: Port $NODE_PORT is already in use. Attempting to kill existing process...${NC}"
    lsof -ti:$NODE_PORT | xargs kill -9 2>/dev/null || true
    sleep 2
fi

echo -e "${BLUE}Starting services...${NC}"

# Start Node.js server
echo "Starting Node.js audio server on port $NODE_PORT..."
cd "$SCRIPT_DIR"
node server.js &
NODE_PID=$!

# Wait a moment for the server to start
sleep 2

# Check if Node.js server started successfully
if ! kill -0 $NODE_PID 2>/dev/null; then
    echo -e "${RED}Error: Failed to start Node.js server${NC}"
    exit 1
fi

# Test local server
echo "Testing local server..."
if curl -s http://localhost:$NODE_PORT/api/files > /dev/null; then
    echo -e "${GREEN}✓ Node.js server is running successfully${NC}"
else
    echo -e "${RED}Error: Node.js server is not responding${NC}"
    kill $NODE_PID 2>/dev/null || true
    exit 1
fi

# Start pktriot tunnel
echo "Starting pktriot tunnel..."
cd "$PKTRIOT_DIR"
./pktriot http $NODE_PORT &
PKTRIOT_PID=$!

# Wait a moment for the tunnel to start
sleep 3

# Check if pktriot started successfully
if ! kill -0 $PKTRIOT_PID 2>/dev/null; then
    echo -e "${RED}Error: Failed to start pktriot tunnel${NC}"
    kill $NODE_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}✓ Pktriot tunnel is running${NC}"

# Display status
echo ""
echo -e "${GREEN}🚀 Services are running successfully!${NC}"
echo "=================================="
echo -e "Local server:  ${BLUE}http://localhost:$NODE_PORT${NC}"
echo -e "Public URL:    ${BLUE}https://sleepy-thunder-45656.pktriot.net${NC}"
echo -e "GitHub Pages:  ${BLUE}https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/${NC}"
echo ""
echo -e "Node.js PID:   ${YELLOW}$NODE_PID${NC}"
echo -e "Pktriot PID:   ${YELLOW}$PKTRIOT_PID${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"

# Keep script running and wait for signals
while true; do
    # Check if processes are still running
    if ! kill -0 $NODE_PID 2>/dev/null; then
        echo -e "${RED}Error: Node.js server stopped unexpectedly${NC}"
        cleanup
    fi
    
    if ! kill -0 $PKTRIOT_PID 2>/dev/null; then
        echo -e "${RED}Error: Pktriot tunnel stopped unexpectedly${NC}"
        cleanup
    fi
    
    sleep 5
done