#!/bin/bash

# Comprehensive fix for all NGINX issues
# Usage: sudo bash fix-all-nginx-issues.sh

set -e

NGINX_CONF="/etc/nginx/conf.d/palo-changelogs.conf"
NGINX_LOCATION_PATH="${NGINX_LOCATION_PATH:-/changelogs}"
PANORAMA_HOST="${PANORAMA_HOST:-panorama.officeours.com}"

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

echo "=========================================="
echo "Comprehensive NGINX Fix"
echo "=========================================="
echo ""

if [ ! -f "$NGINX_CONF" ]; then
    echo "Error: NGINX configuration file not found at $NGINX_CONF"
    exit 1
fi

# Create backup
cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
echo "Backup created"

# Fix 1: Ensure Panorama proxy location exists and is correct
echo ""
echo "1. Fixing Panorama proxy location..."
if grep -q "panorama-proxy" "$NGINX_CONF"; then
    # Check if it's correct
    if grep -q "location.*panorama-proxy.*{" "$NGINX_CONF" && grep -q "proxy_pass.*$PANORAMA_HOST" "$NGINX_CONF"; then
        echo "   ✓ Panorama proxy location exists"
    else
        echo "   Updating Panorama proxy location..."
        # This is complex, so we'll note it
        echo "   ⚠ Manual update may be needed - see instructions"
    fi
else
    echo "   ✗ Panorama proxy location NOT found"
    echo "   Run: sudo bash fix-panorama-proxy.sh"
fi

# Fix 2: Ensure API location uses correct rewrite
echo ""
echo "2. Fixing API location rewrite..."
if grep -q "location.*api" "$NGINX_CONF"; then
    # Check if rewrite exists
    if grep -A 5 "location.*api" "$NGINX_CONF" | grep -q "rewrite.*break"; then
        echo "   ✓ API location has rewrite rule"
    else
        echo "   Adding rewrite rule to API location..."
        # Use sed to add rewrite before proxy_pass
        sed -i "/location.*api/,/proxy_pass http:\/\/palo_changelogs_backend/ {
            /proxy_pass http:\/\/palo_changelogs_backend/i\\
        rewrite ^${NGINX_LOCATION_PATH}/api/(.*) /api/\\\$1 break;
        }" "$NGINX_CONF"
        echo "   ✓ Rewrite rule added"
    fi
else
    echo "   ✗ API location NOT found"
fi

# Fix 3: Check HTTPS configuration
echo ""
echo "3. Checking HTTPS configuration..."
if grep -q "listen 443" "$NGINX_CONF"; then
    echo "   ✓ HTTPS server block exists"
    
    # Check SSL certificates
    SSL_CERT=$(grep "ssl_certificate " "$NGINX_CONF" | head -1 | awk '{print $2}' | tr -d ';')
    SSL_KEY=$(grep "ssl_certificate_key " "$NGINX_CONF" | head -1 | awk '{print $2}' | tr -d ';')
    
    if [ -n "$SSL_CERT" ] && [ -n "$SSL_KEY" ]; then
        if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
            echo "   ✓ SSL certificates exist: $SSL_CERT"
        else
            echo "   ✗ SSL certificates NOT found: $SSL_CERT"
            echo "   Creating SSL certificates..."
            sudo bash fix-nginx-ssl.sh
        fi
    fi
else
    echo "   ⚠ HTTPS server block NOT found"
    echo "   This is expected if SSL certificates don't exist"
fi

# Fix 4: Check for server_name conflicts
echo ""
echo "4. Checking server_name configuration..."
if grep -q "server_name _" "$NGINX_CONF"; then
    if grep -q "default_server" "$NGINX_CONF"; then
        echo "   ✓ default_server is set (should avoid conflicts)"
    else
        echo "   ⚠ Server name is '_' without default_server"
        echo "   Consider updating to your domain name"
    fi
fi

# Test configuration
echo ""
echo "5. Testing NGINX configuration..."
if nginx -t 2>&1 | tee /tmp/nginx-test.log; then
    echo ""
    echo "✓ NGINX configuration is valid!"
    
    # Check for warnings
    if grep -q "warn" /tmp/nginx-test.log; then
        echo ""
        echo "⚠ Warnings (usually non-critical):"
        grep "warn" /tmp/nginx-test.log
    fi
    
    echo ""
    read -p "Reload NGINX now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        systemctl reload nginx
        echo "✓ NGINX reloaded"
        
        # Wait and test
        sleep 2
        echo ""
        echo "6. Testing endpoints..."
        
        # Test HTTP
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost${NGINX_LOCATION_PATH}/api/health 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" = "200" ]; then
            echo "   ✓ HTTP API endpoint working"
        else
            echo "   ⚠ HTTP API returned $HTTP_CODE"
        fi
        
        # Test HTTPS if configured
        if grep -q "listen 443" "$NGINX_CONF"; then
            HTTPS_CODE=$(curl -s -k -o /dev/null -w "%{http_code}" https://localhost${NGINX_LOCATION_PATH}/api/health 2>/dev/null || echo "000")
            if [ "$HTTPS_CODE" = "200" ]; then
                echo "   ✓ HTTPS API endpoint working"
            elif [ "$HTTPS_CODE" = "000" ]; then
                echo "   ⚠ HTTPS connection refused (check SSL certificates)"
            else
                echo "   ⚠ HTTPS returned $HTTPS_CODE"
            fi
        fi
    fi
else
    echo ""
    echo "✗ NGINX configuration test failed"
    echo "Restoring backup..."
    cp "${NGINX_CONF}.backup."* "$NGINX_CONF" 2>/dev/null || true
    exit 1
fi

rm -f /tmp/nginx-test.log

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""
echo "If you're accessing via HTTPS but getting connection refused:"
echo "  1. Create SSL certificates: sudo bash fix-nginx-ssl.sh"
echo "  2. Or access via HTTP: http://your-domain/changelogs"
echo ""
echo "If you're getting 502 errors:"
echo "  1. Check backend: systemctl status palo-changelogs-backend"
echo "  2. Test backend directly: curl http://localhost:3001/api/health"
echo "  3. Check NGINX error log: tail -f /var/log/nginx/error.log"
echo ""

