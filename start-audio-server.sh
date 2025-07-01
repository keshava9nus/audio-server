#!/bin/bash

# Audio Server Startup Script
# This script starts both the Node.js audio server and the pktriot tunnel
# Updated to use bundled binaries like the Electron app

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
SERVER_SCRIPT="$SCRIPT_DIR/server.js"

# Detect platform
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
case "$PLATFORM" in
    darwin) 
        NODE_BINARY="$SCRIPT_DIR/resources/bin/node"
        PKTRIOT_BINARY="$SCRIPT_DIR/resources/bin/pktriot"
        ;;
    linux)
        NODE_BINARY="$SCRIPT_DIR/resources/bin/node"
        PKTRIOT_BINARY="$SCRIPT_DIR/resources/bin/pktriot"
        ;;
    mingw*|cygwin*|msys*)
        NODE_BINARY="$SCRIPT_DIR/resources/bin/node.exe"
        PKTRIOT_BINARY="$SCRIPT_DIR/resources/bin/pktriot.exe"
        ;;
    *)
        echo -e "${RED}Error: Unsupported platform: $PLATFORM${NC}"
        exit 1
        ;;
esac

echo -e "${BLUE}🎵 Audio Server Startup Script${NC}"
echo "=================================="
echo "Platform: $PLATFORM"
echo "Node binary: $NODE_BINARY"
echo "Pktriot binary: $PKTRIOT_BINARY"
echo ""

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

# Check if bundled Node.js binary exists, fallback to system node
if [ -f "$NODE_BINARY" ]; then
    # Set execute permissions for bundled binary
    chmod +x "$NODE_BINARY" 2>/dev/null || true
    echo "Using bundled Node.js binary"
else
    if command -v node &> /dev/null; then
        NODE_BINARY="node"
        echo "Using system Node.js"
    else
        echo -e "${RED}Error: Neither bundled nor system Node.js found${NC}"
        exit 1
    fi
fi

# Check if server.js exists
if [ ! -f "$SERVER_SCRIPT" ]; then
    echo -e "${RED}Error: server.js not found at $SERVER_SCRIPT${NC}"
    exit 1
fi

# Check if bundled pktriot binary exists
if [ -f "$PKTRIOT_BINARY" ]; then
    # Set execute permissions for bundled binary
    chmod +x "$PKTRIOT_BINARY" 2>/dev/null || true
    echo "Using bundled pktriot binary"
else
    if command -v pktriot &> /dev/null; then
        PKTRIOT_BINARY="pktriot"
        echo "Using system pktriot"
    else
        echo -e "${YELLOW}Warning: Pktriot binary not found. Tunnel will not be available.${NC}"
        PKTRIOT_BINARY=""
    fi
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
"$NODE_BINARY" server.js &
NODE_PID=$!

# Wait a moment for the server to start
sleep 3

# Check if Node.js server started successfully
if ! kill -0 $NODE_PID 2>/dev/null; then
    echo -e "${RED}Error: Failed to start Node.js server${NC}"
    exit 1
fi

# Test local server
echo "Testing local server..."
if curl -s http://localhost:$NODE_PORT/api/status > /dev/null; then
    echo -e "${GREEN}✓ Node.js server is running successfully${NC}"
else
    echo -e "${RED}Error: Node.js server is not responding${NC}"
    kill $NODE_PID 2>/dev/null || true
    exit 1
fi

# Start pktriot tunnel if available
if [ ! -z "$PKTRIOT_BINARY" ]; then
    echo "Starting pktriot tunnel..."
    "$PKTRIOT_BINARY" http $NODE_PORT &
    PKTRIOT_PID=$!
    
    # Wait a moment for the tunnel to start
    sleep 3
    
    # Check if pktriot started successfully
    if ! kill -0 $PKTRIOT_PID 2>/dev/null; then
        echo -e "${YELLOW}Warning: Failed to start pktriot tunnel (continuing without tunnel)${NC}"
        PKTRIOT_PID=""
    else
        echo -e "${GREEN}✓ Pktriot tunnel is running${NC}"
    fi
else
    PKTRIOT_PID=""
fi

# Display status
echo ""
echo -e "${GREEN}🚀 Services are running successfully!${NC}"
echo "=================================="
echo -e "Local server:     ${BLUE}http://localhost:$NODE_PORT${NC}"
echo -e "Admin Panel:      ${BLUE}http://localhost:$NODE_PORT/admin-login.html${NC}"
echo -e "Student Login:    ${BLUE}http://localhost:$NODE_PORT/login.html${NC}"
echo -e "Super-Admin:      ${BLUE}Use /super-admin/authenticate endpoint${NC}"
if [ ! -z "$PKTRIOT_PID" ]; then
    echo -e "Public URL:       ${BLUE}https://sleepy-thunder-45656.pktriot.net${NC}"
fi
echo ""
echo -e "Node.js PID:      ${YELLOW}$NODE_PID${NC}"
if [ ! -z "$PKTRIOT_PID" ]; then
    echo -e "Pktriot PID:      ${YELLOW}$PKTRIOT_PID${NC}"
fi
echo ""
echo -e "${GREEN}Multi-Admin System Features:${NC}"
echo "• Super-admin access with system-wide management"
echo "• Multiple administrators with isolated data"
echo "• Invite code system for controlled access"
echo "• Role-based authentication (super-admin/admin/student)"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"

# Keep script running and wait for signals
while true; do
    # Check if processes are still running
    if ! kill -0 $NODE_PID 2>/dev/null; then
        echo -e "${RED}Error: Node.js server stopped unexpectedly${NC}"
        cleanup
    fi
    
    if [ ! -z "$PKTRIOT_PID" ] && ! kill -0 $PKTRIOT_PID 2>/dev/null; then
        echo -e "${YELLOW}Warning: Pktriot tunnel stopped unexpectedly (continuing with local server only)${NC}"
        PKTRIOT_PID=""
    fi
    
    sleep 5
done