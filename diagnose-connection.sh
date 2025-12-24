#!/bin/bash

# Diagnostic script for Palo ChangeLogs connection issues
# Usage: sudo bash diagnose-connection.sh

set -e

INSTALL_DIR="/opt/palo-changelogs"
BACKEND_PORT="${BACKEND_PORT:-3001}"
NGINX_LOCATION_PATH="${NGINX_LOCATION_PATH:-/changelogs}"

echo "=========================================="
echo "Palo ChangeLogs Connection Diagnostics"
echo "=========================================="
echo ""

# Check backend service
echo "1. Checking backend service status..."
if systemctl is-active --quiet palo-changelogs-backend; then
    echo "   ✓ Backend service is running"
else
    echo "   ✗ Backend service is NOT running"
    echo "   Check with: systemctl status palo-changelogs-backend"
fi

# Check backend port
echo ""
echo "2. Checking backend port $BACKEND_PORT..."
if command -v lsof &> /dev/null; then
    if lsof -ti:$BACKEND_PORT &>/dev/null; then
        echo "   ✓ Port $BACKEND_PORT is in use"
        lsof -i:$BACKEND_PORT | head -2
    else
        echo "   ✗ Port $BACKEND_PORT is NOT in use"
    fi
elif command -v ss &> /dev/null; then
    if ss -tlnp | grep ":$BACKEND_PORT " &>/dev/null; then
        echo "   ✓ Port $BACKEND_PORT is in use"
        ss -tlnp | grep ":$BACKEND_PORT "
    else
        echo "   ✗ Port $BACKEND_PORT is NOT in use"
    fi
fi

# Test backend directly
echo ""
echo "3. Testing backend API directly (localhost:$BACKEND_PORT)..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:$BACKEND_PORT/api/health | grep -q "200\|404"; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$BACKEND_PORT/api/health)
    echo "   ✓ Backend responds with HTTP $HTTP_CODE"
    if [ "$HTTP_CODE" = "200" ]; then
        echo "   Response: $(curl -s http://localhost:$BACKEND_PORT/api/health)"
    fi
else
    echo "   ✗ Backend is not responding"
    echo "   Check backend logs: journalctl -u palo-changelogs-backend -n 50"
fi

# Check NGINX
echo ""
echo "4. Checking NGINX status..."
if systemctl is-active --quiet nginx; then
    echo "   ✓ NGINX is running"
else
    echo "   ✗ NGINX is NOT running"
    echo "   Start with: systemctl start nginx"
fi

# Test NGINX configuration
echo ""
echo "5. Testing NGINX configuration..."
if nginx -t 2>&1 | grep -q "successful"; then
    echo "   ✓ NGINX configuration is valid"
else
    echo "   ✗ NGINX configuration has errors:"
    nginx -t 2>&1 | grep -v "^nginx:"
fi

# Check NGINX upstream
echo ""
echo "6. Checking NGINX upstream configuration..."
if grep -q "upstream palo_changelogs_backend" /etc/nginx/nginx.conf; then
    echo "   ✓ Upstream block found in nginx.conf"
    grep -A 3 "upstream palo_changelogs_backend" /etc/nginx/nginx.conf | head -4
else
    echo "   ✗ Upstream block NOT found in nginx.conf"
    echo "   Run: sudo bash fix-nginx-upstream.sh"
fi

# Check NGINX location blocks
echo ""
echo "7. Checking NGINX location blocks..."
NGINX_CONF="/etc/nginx/conf.d/palo-changelogs.conf"
if [ -f "$NGINX_CONF" ]; then
    echo "   ✓ Configuration file exists: $NGINX_CONF"
    
    if grep -q "location.*api" "$NGINX_CONF"; then
        echo "   ✓ API location block found"
    else
        echo "   ✗ API location block NOT found"
    fi
    
    if grep -q "panorama-proxy" "$NGINX_CONF"; then
        echo "   ✓ Panorama proxy location block found"
    else
        echo "   ✗ Panorama proxy location block NOT found"
        echo "   Run: sudo bash fix-panorama-proxy.sh"
    fi
else
    echo "   ✗ Configuration file NOT found: $NGINX_CONF"
fi

# Test NGINX proxy
echo ""
echo "8. Testing NGINX proxy (via localhost)..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost${NGINX_LOCATION_PATH}/api/health 2>/dev/null | grep -q "200\|404"; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost${NGINX_LOCATION_PATH}/api/health 2>/dev/null)
    echo "   ✓ NGINX proxy responds with HTTP $HTTP_CODE"
    if [ "$HTTP_CODE" = "200" ]; then
        echo "   Response: $(curl -s http://localhost${NGINX_LOCATION_PATH}/api/health 2>/dev/null)"
    fi
else
    echo "   ✗ NGINX proxy is not responding"
    echo "   Check NGINX error log: tail -f /var/log/nginx/error.log"
fi

# Check frontend environment
echo ""
echo "9. Checking frontend environment configuration..."
ENV_FILE="$INSTALL_DIR/.env.local"
if [ -f "$ENV_FILE" ]; then
    echo "   ✓ Environment file exists: $ENV_FILE"
    
    if grep -q "VITE_API_BASE" "$ENV_FILE"; then
        API_BASE=$(grep "VITE_API_BASE" "$ENV_FILE" | cut -d'=' -f2)
        echo "   VITE_API_BASE=$API_BASE"
    else
        echo "   ✗ VITE_API_BASE not set"
    fi
    
    if grep -q "VITE_PANORAMA_PROXY" "$ENV_FILE"; then
        PANORAMA_PROXY=$(grep "VITE_PANORAMA_PROXY" "$ENV_FILE" | cut -d'=' -f2)
        echo "   VITE_PANORAMA_PROXY=$PANORAMA_PROXY"
    else
        echo "   ✗ VITE_PANORAMA_PROXY not set"
        echo "   Add: VITE_PANORAMA_PROXY=${NGINX_LOCATION_PATH}/panorama-proxy"
    fi
else
    echo "   ✗ Environment file NOT found: $ENV_FILE"
fi

# Check frontend build
echo ""
echo "10. Checking frontend build..."
if [ -d "$INSTALL_DIR/dist" ]; then
    echo "   ✓ Frontend build directory exists"
    if [ -f "$INSTALL_DIR/dist/index.html" ]; then
        echo "   ✓ Frontend index.html exists"
        BUILD_TIME=$(stat -c %y "$INSTALL_DIR/dist/index.html" 2>/dev/null || stat -f "%Sm" "$INSTALL_DIR/dist/index.html" 2>/dev/null || echo "unknown")
        echo "   Build time: $BUILD_TIME"
    else
        echo "   ✗ Frontend index.html NOT found"
        echo "   Rebuild with: cd $INSTALL_DIR && sudo -u palo-changelogs npm run build"
    fi
else
    echo "   ✗ Frontend build directory NOT found"
    echo "   Build with: cd $INSTALL_DIR && sudo -u palo-changelogs npm run build"
fi

# Check database
echo ""
echo "11. Checking database..."
DB_PATH="$INSTALL_DIR/data/changelogs.db"
if [ -f "$DB_PATH" ]; then
    echo "   ✓ Database file exists: $DB_PATH"
    DB_SIZE=$(du -h "$DB_PATH" | cut -f1)
    echo "   Database size: $DB_SIZE"
else
    echo "   ⚠ Database file does not exist (will be created on first use)"
fi

# Summary
echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""
echo "If backend is running but frontend can't connect:"
echo "  1. Verify NGINX upstream is configured: sudo bash fix-nginx-upstream.sh"
echo "  2. Verify Panorama proxy is configured: sudo bash fix-panorama-proxy.sh"
echo "  3. Rebuild frontend: cd $INSTALL_DIR && sudo -u palo-changelogs npm run build"
echo "  4. Check browser console for errors"
echo ""
echo "Check logs:"
echo "  Backend: journalctl -u palo-changelogs-backend -f"
echo "  NGINX: tail -f /var/log/nginx/error.log"
echo ""

