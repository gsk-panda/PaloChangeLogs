#!/bin/bash

# Quick fix script for Panorama API proxy 404 error
# Usage: sudo bash fix-panorama-proxy.sh

set -e

NGINX_CONF="/etc/nginx/conf.d/palo-changelogs.conf"
INSTALL_DIR="/opt/palo-changelogs"
NGINX_LOCATION_PATH="${NGINX_LOCATION_PATH:-/changelogs}"
PANORAMA_HOST="${PANORAMA_HOST:-panorama.officeours.com}"

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

echo "Fixing Panorama API proxy configuration..."

# Check if NGINX config exists
if [ ! -f "$NGINX_CONF" ]; then
    echo "Error: NGINX configuration file not found at $NGINX_CONF"
    exit 1
fi

# Check if panorama-proxy location already exists
if grep -q "panorama-proxy" "$NGINX_CONF"; then
    echo "Panorama proxy location already exists in $NGINX_CONF"
    echo "Checking configuration..."
else
    echo "Adding Panorama proxy location to NGINX configuration..."
    
    # Create backup
    cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Find the line with "Backend API location" and add panorama-proxy before it
    PANORAMA_BLOCK="    # Panorama API proxy location
    location ${NGINX_LOCATION_PATH}/panorama-proxy/ {
        proxy_pass https://${PANORAMA_HOST}/;
        proxy_ssl_verify off;
        proxy_ssl_server_name on;
        proxy_http_version 1.1;
        proxy_set_header Host ${PANORAMA_HOST};
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        
        # CORS headers
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range' always;
    }
    
    "
    
    # Insert before "Backend API location"
    sed -i "/# Backend API location/i\\$PANORAMA_BLOCK" "$NGINX_CONF"
    
    echo "✓ Panorama proxy location added"
fi

# Update environment file if needed
ENV_FILE="$INSTALL_DIR/.env.local"
if [ -f "$ENV_FILE" ]; then
    if ! grep -q "VITE_PANORAMA_PROXY" "$ENV_FILE"; then
        echo "Adding VITE_PANORAMA_PROXY to environment file..."
        echo "VITE_PANORAMA_PROXY=${NGINX_LOCATION_PATH}/panorama-proxy" >> "$ENV_FILE"
        echo "✓ Environment variable added"
        echo ""
        echo "NOTE: You may need to rebuild the frontend for this to take effect:"
        echo "  cd $INSTALL_DIR"
        echo "  sudo -u palo-changelogs npm run build"
    fi
fi

# Test NGINX configuration
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
echo "If the frontend was already built, you may need to rebuild it:"
echo "  cd $INSTALL_DIR"
echo "  sudo -u palo-changelogs npm run build"

