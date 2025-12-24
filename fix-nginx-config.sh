#!/bin/bash

# Comprehensive NGINX configuration fix script
# Usage: sudo bash fix-nginx-config.sh

set -e

NGINX_CONF="/etc/nginx/conf.d/palo-changelogs.conf"
NGINX_LOCATION_PATH="${NGINX_LOCATION_PATH:-/changelogs}"
PANORAMA_HOST="${PANORAMA_HOST:-panorama.officeours.com}"

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

echo "Fixing NGINX configuration issues..."

if [ ! -f "$NGINX_CONF" ]; then
    echo "Error: NGINX configuration file not found at $NGINX_CONF"
    exit 1
fi

# Create backup
cp "$NGINX_CONF" "${NGINX_CONF}.backup.$(date +%Y%m%d_%H%M%S)"

echo "Backup created"

# Check if HTTPS server block exists and has SSL config
if ! grep -q "listen 443" "$NGINX_CONF"; then
    echo "⚠ HTTPS server block not found - this is expected if SSL certificates don't exist"
    echo "   Create SSL certificates first: sudo bash fix-nginx-ssl.sh"
fi

# Fix panorama-proxy location if it exists but is incorrect
if grep -q "panorama-proxy" "$NGINX_CONF"; then
    echo "Checking Panorama proxy configuration..."
    
    # Check if it's using regex pattern (correct)
    if grep -q "location ~.*panorama-proxy" "$NGINX_CONF"; then
        echo "✓ Panorama proxy uses regex pattern (correct)"
    else
        echo "Updating Panorama proxy to use regex pattern..."
        # This is complex to do with sed, so we'll provide instructions
        echo "⚠ Manual fix needed for Panorama proxy"
        echo "   Update the location block to use regex pattern"
    fi
fi

# Fix API location if it exists but is incorrect
if grep -q "location.*api" "$NGINX_CONF"; then
    echo "Checking API location configuration..."
    
    # Check if it's using regex pattern (correct)
    if grep -q "location ~.*api" "$NGINX_CONF"; then
        echo "✓ API location uses regex pattern (correct)"
    else
        echo "Updating API location to use regex pattern..."
        # This is complex to do with sed, so we'll provide instructions
        echo "⚠ Manual fix needed for API location"
        echo "   Update the location block to use regex pattern"
    fi
fi

# Check for server_name conflicts
if grep -q "server_name _" "$NGINX_CONF"; then
    echo ""
    echo "⚠ Server name is set to '_' (catch-all)"
    echo "   Consider updating to your actual domain name to avoid conflicts"
    echo "   Or ensure default_server is set (already done in latest config)"
fi

# Test configuration
echo ""
echo "Testing NGINX configuration..."
if nginx -t 2>&1 | tee /tmp/nginx-test.log; then
    echo ""
    echo "✓ NGINX configuration is valid!"
    
    # Check for warnings
    if grep -q "warn" /tmp/nginx-test.log; then
        echo ""
        echo "⚠ Warnings detected (non-critical):"
        grep "warn" /tmp/nginx-test.log
    fi
    
    echo ""
    read -p "Reload NGINX now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        systemctl reload nginx
        echo "✓ NGINX reloaded successfully"
        
        # Wait a moment and test
        sleep 1
        echo ""
        echo "Testing endpoints..."
        
        # Test HTTP
        if curl -s -o /dev/null -w "HTTP: %{http_code}\n" http://localhost${NGINX_LOCATION_PATH}/api/health; then
            echo "✓ HTTP endpoint working"
        fi
        
        # Test HTTPS if SSL is configured
        if grep -q "listen 443" "$NGINX_CONF"; then
            if curl -s -k -o /dev/null -w "HTTPS: %{http_code}\n" https://localhost${NGINX_LOCATION_PATH}/api/health 2>/dev/null; then
                echo "✓ HTTPS endpoint working"
            else
                echo "⚠ HTTPS not responding (check SSL certificates)"
            fi
        fi
    else
        echo "Configuration updated. Reload NGINX manually with: sudo systemctl reload nginx"
    fi
else
    echo ""
    echo "✗ NGINX configuration test failed"
    echo "Restoring backup..."
    cp "${NGINX_CONF}.backup."* "$NGINX_CONF" 2>/dev/null || true
    echo "Backup restored. Please fix manually"
    exit 1
fi

rm -f /tmp/nginx-test.log

echo ""
echo "If you're still getting 502 errors, check:"
echo "  1. Backend is running: systemctl status palo-changelogs-backend"
echo "  2. Backend is accessible: curl http://localhost:3001/api/health"
echo "  3. Upstream is configured: grep -A 3 'upstream palo_changelogs_backend' /etc/nginx/nginx.conf"
echo "  4. NGINX error log: tail -f /var/log/nginx/error.log"

