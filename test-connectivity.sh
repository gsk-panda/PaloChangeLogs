#!/bin/bash

# Quick connectivity test script
# Usage: sudo bash test-connectivity.sh

set -e

NGINX_LOCATION_PATH="${NGINX_LOCATION_PATH:-/changelogs}"
BACKEND_PORT="${BACKEND_PORT:-3001}"

echo "=========================================="
echo "Connectivity Test"
echo "=========================================="
echo ""

# 1. Check NGINX status
echo "1. NGINX Service Status:"
if systemctl is-active --quiet nginx; then
    echo "   ✓ NGINX is running"
else
    echo "   ✗ NGINX is NOT running"
    echo "   Start with: sudo systemctl start nginx"
    exit 1
fi

# 2. Check what ports NGINX is listening on
echo ""
echo "2. NGINX Listening Ports:"
if command -v ss &> /dev/null; then
    ss -tlnp | grep nginx || echo "   No NGINX processes found listening"
elif command -v netstat &> /dev/null; then
    netstat -tlnp | grep nginx || echo "   No NGINX processes found listening"
else
    echo "   Cannot check (ss/netstat not available)"
fi

# 3. Test backend directly
echo ""
echo "3. Testing Backend Directly (localhost:$BACKEND_PORT):"
if curl -s -o /dev/null -w "   HTTP Status: %{http_code}\n" http://localhost:$BACKEND_PORT/api/health 2>/dev/null; then
    echo "   ✓ Backend is accessible directly"
    curl -s http://localhost:$BACKEND_PORT/api/health | head -1
else
    echo "   ✗ Cannot connect to backend directly"
    echo "   Check: sudo journalctl -u palo-changelogs-backend -n 20"
fi

# 4. Test through NGINX (HTTP)
echo ""
echo "4. Testing Through NGINX (HTTP - localhost$NGINX_LOCATION_PATH/api/health):"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost${NGINX_LOCATION_PATH}/api/health 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    echo "   ✓ NGINX proxy working (HTTP $HTTP_CODE)"
    if [ "$HTTP_CODE" = "200" ]; then
        curl -s http://localhost${NGINX_LOCATION_PATH}/api/health | head -1
    fi
else
    echo "   ✗ NGINX proxy not working (HTTP $HTTP_CODE)"
    echo "   Check NGINX error log: sudo tail -20 /var/log/nginx/error.log"
fi

# 5. Test through NGINX (HTTPS)
echo ""
echo "5. Testing Through NGINX (HTTPS - localhost$NGINX_LOCATION_PATH/api/health):"
HTTPS_CODE=$(curl -s -k -o /dev/null -w "%{http_code}" https://localhost${NGINX_LOCATION_PATH}/api/health 2>/dev/null || echo "000")
if [ "$HTTPS_CODE" = "200" ]; then
    echo "   ✓ NGINX HTTPS proxy working"
    curl -s -k https://localhost${NGINX_LOCATION_PATH}/api/health | head -1
elif [ "$HTTPS_CODE" = "000" ]; then
    echo "   ⚠ HTTPS not responding (connection refused or SSL error)"
    echo "   This is normal if SSL certificates are not configured"
else
    echo "   HTTP Status: $HTTPS_CODE"
fi

# 6. Check NGINX access logs
echo ""
echo "6. Recent NGINX Access Log Entries:"
if [ -f "/var/log/nginx/palo-changelogs-access.log" ]; then
    echo "   Last 5 entries:"
    tail -5 /var/log/nginx/palo-changelogs-access.log 2>/dev/null || echo "   (log file empty or not readable)"
else
    echo "   Access log not found"
fi

# 7. Check NGINX error logs
echo ""
echo "7. Recent NGINX Error Log Entries:"
if [ -f "/var/log/nginx/palo-changelogs-error.log" ]; then
    ERROR_COUNT=$(tail -20 /var/log/nginx/palo-changelogs-error.log 2>/dev/null | wc -l)
    if [ "$ERROR_COUNT" -gt 0 ]; then
        echo "   Last 5 error entries:"
        tail -5 /var/log/nginx/palo-changelogs-error.log 2>/dev/null
    else
        echo "   ✓ No recent errors"
    fi
else
    echo "   Error log not found"
fi

# 8. Check firewall
echo ""
echo "8. Firewall Status:"
if command -v firewall-cmd &> /dev/null && firewall-cmd --state &>/dev/null; then
    if firewall-cmd --query-service=http &>/dev/null && firewall-cmd --query-service=https &>/dev/null; then
        echo "   ✓ HTTP and HTTPS services allowed"
    else
        echo "   ⚠ HTTP/HTTPS may be blocked"
        echo "   Allow with: sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload"
    fi
else
    echo "   Firewall not active or firewall-cmd not available"
fi

# 9. Check server_name conflict
echo ""
echo "9. NGINX Configuration Warnings:"
if nginx -t 2>&1 | grep -q "conflicting server name"; then
    echo "   ⚠ Server name conflict detected"
    echo "   Multiple server blocks using '_' as server_name"
    echo "   Fix: Update server_name in /etc/nginx/conf.d/palo-changelogs.conf"
    echo "   Change 'server_name _;' to your actual domain name"
fi

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""
echo "If backend works directly but not through NGINX:"
echo "  1. Check NGINX is listening: sudo ss -tlnp | grep nginx"
echo "  2. Check NGINX error log: sudo tail -f /var/log/nginx/error.log"
echo "  3. Verify upstream is configured: sudo grep -A 3 'upstream palo_changelogs_backend' /etc/nginx/nginx.conf"
echo "  4. Test API routing: sudo bash fix-nginx-api-routing.sh"
echo ""
echo "If connection is refused from browser:"
echo "  1. Check firewall: sudo firewall-cmd --list-all"
echo "  2. Verify NGINX is listening on ports 80/443"
echo "  3. Check if accessing via correct URL (HTTPS vs HTTP)"
echo ""

