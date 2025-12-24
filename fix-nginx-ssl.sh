#!/bin/bash

# Quick fix script for NGINX SSL certificate error
# Usage: sudo bash fix-nginx-ssl.sh [domain-name]

set -e

DOMAIN="${1:-localhost}"
SSL_DIR="/etc/nginx/ssl"
SSL_CERT="$SSL_DIR/certificate.crt"
SSL_KEY="$SSL_DIR/private.key"

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

echo "Creating SSL certificate for NGINX..."
echo "Domain: $DOMAIN"

# Create SSL directory
mkdir -p "$SSL_DIR"

# Check if certificates already exist
if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
    echo "SSL certificates already exist:"
    echo "  Certificate: $SSL_CERT"
    echo "  Private Key: $SSL_KEY"
    echo ""
    read -p "Overwrite existing certificates? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing certificates."
        exit 0
    fi
    echo "Backing up existing certificates..."
    cp "$SSL_CERT" "${SSL_CERT}.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
    cp "$SSL_KEY" "${SSL_KEY}.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
fi

# Generate self-signed certificate
echo "Generating self-signed certificate..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$SSL_KEY" \
    -out "$SSL_CERT" \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"

if [ $? -eq 0 ] && [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
    chmod 600 "$SSL_KEY"
    chmod 644 "$SSL_CERT"
    echo ""
    echo "✓ SSL certificate created successfully!"
    echo "  Certificate: $SSL_CERT"
    echo "  Private Key: $SSL_KEY"
    echo ""
    echo "NOTE: This is a self-signed certificate for testing."
    echo "Browsers will show a security warning."
    echo ""
    echo "For production, use Let's Encrypt:"
    echo "  sudo dnf install certbot python3-certbot-nginx"
    echo "  sudo certbot --nginx -d $DOMAIN"
    echo ""
    
    # Test NGINX configuration
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
            echo "Certificate created. Reload NGINX manually with: sudo systemctl reload nginx"
        fi
    else
        echo "⚠ NGINX configuration test failed"
        echo "Certificate created, but please fix NGINX configuration errors first"
        exit 1
    fi
else
    echo "✗ Failed to create SSL certificate"
    exit 1
fi

