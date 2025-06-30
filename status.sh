#!/bin/bash

# Audio Server Status Check
echo "📊 Audio Server Status"
echo "======================"

# Check Node.js server
if pgrep -f "node server.js" > /dev/null; then
    echo "✅ Node.js server: RUNNING"
    echo "   Local API: http://localhost:8000/api/status"
else
    echo "❌ Node.js server: STOPPED"
fi

# Check pktriot tunnel
if pgrep -f "pktriot" > /dev/null; then
    echo "✅ Pktriot tunnel: RUNNING"
    echo "   Public API: https://sleepy-thunder-45656.pktriot.net/api/status"
else
    echo "❌ Pktriot tunnel: STOPPED"
fi

# Test local server
echo ""
echo "🔍 Testing connections..."
if curl -s http://localhost:8000/api/status > /dev/null; then
    echo "✅ Local server responding"
else
    echo "❌ Local server not responding"
fi

# Test public tunnel
if curl -s https://sleepy-thunder-45656.pktriot.net/api/status > /dev/null; then
    echo "✅ Public tunnel responding"
else
    echo "❌ Public tunnel not responding"
fi

echo ""
echo "🌐 Your websites:"
echo "   GitHub Pages: https://shivin9.github.io/tunnel_test"
echo "   Admin Login:  Use password 'HareKrishna'"