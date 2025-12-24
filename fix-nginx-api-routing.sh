#!/bin/bash

# Fix script for NGINX API routing issues
# Usage: sudo bash fix-nginx-api-routing.sh

set -e

NGINX_CONF="/etc/nginx/conf.d/palo-changelogs.conf"
NGINX_LOCATION_PATH="${NGINX_LOCATION_PATH:-/changelogs}"

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

echo "Fixing NGINX API routing configuration..."

if [ ! -f "$NGINX_CONF" ]; then
    echo "Error: NGINX configuration file not found at $NGINX_CONF"
    exit 1
fi

# Create backup
cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"

# Check current configuration
if grep -q "location.*api" "$NGINX_CONF"; then
    echo "Found API location block. Checking configuration..."
    
    # Check if rewrite rule exists
    if grep -q "rewrite.*api" "$NGINX_CONF"; then
        echo "✓ Rewrite rule already exists"
    else
        echo "Adding rewrite rule to fix API routing..."
        
        # Use sed to add rewrite before proxy_pass in the API location block
        sed -i "/location.*api/,/proxy_pass http:\/\/palo_changelogs_backend/ {
            /proxy_pass http:\/\/palo_changelogs_backend/i\\
        # Rewrite to remove the location path prefix before proxying\\
        rewrite ^${NGINX_LOCATION_PATH}/api/(.*) /api/\\\$1 break;
        }" "$NGINX_CONF"
        
        echo "✓ Rewrite rule added"
    fi
    
    # Ensure location has trailing slash for proper matching
    if grep -q "location $NGINX_LOCATION_PATH/api[^/]" "$NGINX_CONF"; then
        echo "Fixing location block to include trailing slash..."
        sed -i "s|location $NGINX_LOCATION_PATH/api {|location $NGINX_LOCATION_PATH/api/ {|" "$NGINX_CONF"
        echo "✓ Location block updated"
    fi
else
    echo "✗ API location block not found in $NGINX_CONF"
    exit 1
fi

# Test configuration
echo ""
echo "Testing NGINX configuration..."
if nginx -t; then
    echo "✓ NGINX configuration is valid!"
    echo ""
    read -p "Reload NGINX now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        systemctl reload nginx
        echo "✓ NGINX reloaded successfully"
    else
        echo "Configuration updated. Reload NGINX manually with: sudo systemctl reload nginx"
    fi
else
    echo "✗ NGINX configuration test failed"
    echo "Restoring backup..."
    cp "${NGINX_CONF}.backup."* "$NGINX_CONF" 2>/dev/null || true
    echo "Please fix manually"
    exit 1
fi

echo ""
echo "Test the API endpoint:"
echo "  curl http://localhost${NGINX_LOCATION_PATH}/api/health"

