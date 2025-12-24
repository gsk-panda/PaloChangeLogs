#!/bin/bash

# Fix script for 502 Bad Gateway errors
# Usage: sudo bash fix-nginx-502-errors.sh

set -e

NGINX_CONF="/etc/nginx/conf.d/palo-changelogs.conf"
NGINX_LOCATION_PATH="${NGINX_LOCATION_PATH:-/changelogs}"

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

echo "Fixing 502 Bad Gateway errors..."

if [ ! -f "$NGINX_CONF" ]; then
    echo "Error: NGINX configuration file not found at $NGINX_CONF"
    exit 1
fi

# Create backup
cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"

# Check if backend is reachable
echo "1. Testing backend connectivity..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health | grep -q "200"; then
    echo "   ✓ Backend is reachable on port 3001"
else
    echo "   ✗ Backend is NOT reachable on port 3001"
    echo "   Check: systemctl status palo-changelogs-backend"
    exit 1
fi

# Check upstream configuration
echo ""
echo "2. Checking upstream configuration..."
if grep -q "upstream palo_changelogs_backend" /etc/nginx/nginx.conf; then
    echo "   ✓ Upstream block found"
    grep -A 3 "upstream palo_changelogs_backend" /etc/nginx/nginx.conf | head -4
else
    echo "   ✗ Upstream block NOT found"
    echo "   Run: sudo bash fix-nginx-upstream.sh"
    exit 1
fi

# Fix API location block
echo ""
echo "3. Fixing API location block..."

# Check current API location block
if grep -q "location.*api" "$NGINX_CONF"; then
    echo "   Found API location block"
    
    # Check if it uses regex pattern
    if grep -q "location ~.*api" "$NGINX_CONF"; then
        echo "   ✓ Already using regex pattern"
    else
        echo "   Updating to use regex pattern with proper rewrite..."
        
        # Create a Python script to do the replacement (more reliable than sed)
        python3 << PYTHON_EOF
import re

with open('$NGINX_CONF', 'r') as f:
    content = f.read()

# Pattern to match the API location block
pattern = r'location\s+$NGINX_LOCATION_PATH/api/\s*\{[^}]*proxy_pass\s+http://palo_changelogs_backend[^}]*\}'

# Replacement with regex pattern
replacement = '''    # Backend API location
    # Use regex pattern for reliable matching
    location ~ ^$NGINX_LOCATION_PATH/api/(.*)$ {
        # Rewrite to remove the location path prefix before proxying
        set \\$api_path \\$1;
        proxy_pass http://palo_changelogs_backend/api/\\$api_path;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
        proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\$scheme;
        proxy_set_header X-Forwarded-Host \\$host;
        proxy_set_header X-Forwarded-Prefix $NGINX_LOCATION_PATH;
        proxy_cache_bypass \\$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        
        # CORS headers (if needed)
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range' always;
    }'''

# Try to replace
if re.search(pattern, content, re.DOTALL):
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    with open('$NGINX_CONF', 'w') as f:
        f.write(content)
    print("   ✓ API location block updated")
else:
    print("   ⚠ Could not automatically update API location block")
    print("   Manual update required - see instructions below")
PYTHON_EOF
    fi
else
    echo "   ✗ API location block NOT found"
    exit 1
fi

# Test configuration
echo ""
echo "4. Testing NGINX configuration..."
if nginx -t; then
    echo "   ✓ NGINX configuration is valid"
    
    echo ""
    read -p "Reload NGINX now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        systemctl reload nginx
        echo "   ✓ NGINX reloaded"
        
        # Test the endpoint
        sleep 1
        echo ""
        echo "5. Testing API endpoint..."
        if curl -s -o /dev/null -w "   HTTP Status: %{http_code}\n" http://localhost${NGINX_LOCATION_PATH}/api/changelogs/count | grep -q "200"; then
            echo "   ✓ API endpoint is working!"
            curl -s http://localhost${NGINX_LOCATION_PATH}/api/changelogs/count
            echo ""
        else
            HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost${NGINX_LOCATION_PATH}/api/changelogs/count)
            echo "   ⚠ API endpoint returned HTTP $HTTP_CODE"
            echo "   Check NGINX error log: tail -20 /var/log/nginx/error.log"
        fi
    fi
else
    echo "   ✗ NGINX configuration test failed"
    echo "   Restoring backup..."
    cp "${NGINX_CONF}.backup."* "$NGINX_CONF" 2>/dev/null || true
    exit 1
fi

echo ""
echo "If 502 errors persist, check:"
echo "  1. Backend logs: journalctl -u palo-changelogs-backend -n 50"
echo "  2. NGINX error log: tail -f /var/log/nginx/error.log"
echo "  3. Test backend directly: curl http://localhost:3001/api/changelogs/count"

