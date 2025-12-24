#!/bin/bash

# Quick fix script for NGINX upstream configuration error
# Usage: sudo bash fix-nginx-upstream.sh [PORT]

set -e

BACKEND_PORT="${1:-3001}"
NGINX_CONF="/etc/nginx/nginx.conf"

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

if [ ! -f "$NGINX_CONF" ]; then
    echo "Error: $NGINX_CONF not found"
    exit 1
fi

echo "Fixing NGINX upstream configuration..."
echo "Backend port: $BACKEND_PORT"

# Create backup
BACKUP_FILE="${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
cp "$NGINX_CONF" "$BACKUP_FILE"
echo "Backup created: $BACKUP_FILE"

# Check if upstream already exists
if grep -q "upstream palo_changelogs_backend" "$NGINX_CONF"; then
    echo "Upstream block already exists. Checking configuration..."
    if nginx -t 2>/dev/null; then
        echo "✓ NGINX configuration is valid"
        exit 0
    else
        echo "⚠ Upstream exists but configuration test failed. Please check manually."
        exit 1
    fi
fi

# Try to add upstream block
UPSTREAM_BLOCK="    upstream palo_changelogs_backend {
        server 127.0.0.1:${BACKEND_PORT};
        keepalive 32;
    }"

# Add upstream after http { line
if sed -i "/^http {/a\\$UPSTREAM_BLOCK" "$NGINX_CONF" 2>/dev/null || \
   sed -i "/^http{/a\\$UPSTREAM_BLOCK" "$NGINX_CONF" 2>/dev/null; then
    echo "✓ Upstream block added to $NGINX_CONF"
else
    echo "✗ Failed to automatically add upstream block"
    echo ""
    echo "Please manually add this to your http {} block in $NGINX_CONF:"
    echo ""
    echo "$UPSTREAM_BLOCK"
    exit 1
fi

# Ensure conf.d include exists
if ! grep -q "include.*conf.d.*\*\.conf" "$NGINX_CONF"; then
    echo "Adding include directive for conf.d files..."
    if sed -i "/^http {/a\\    include /etc/nginx/conf.d/*.conf;" "$NGINX_CONF" 2>/dev/null || \
       sed -i "/^http{/a\\    include /etc/nginx/conf.d/*.conf;" "$NGINX_CONF" 2>/dev/null; then
        echo "✓ Added include directive for conf.d files"
    fi
fi

# Test configuration
echo ""
echo "Testing NGINX configuration..."
if nginx -t; then
    echo ""
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
    echo ""
    echo "✗ NGINX configuration test failed"
    echo "Restoring backup..."
    cp "$BACKUP_FILE" "$NGINX_CONF"
    echo "Backup restored. Please fix manually."
    exit 1
fi

