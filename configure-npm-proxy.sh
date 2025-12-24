#!/bin/bash

# Configure npm to work with corporate proxy
# Usage: sudo bash configure-npm-proxy.sh [proxy-url]

set -e

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

INSTALL_DIR="/opt/palo-changelogs"
SERVICE_USER="palo-changelogs"

# Get proxy from argument or environment
PROXY_URL="${1:-${HTTP_PROXY:-${HTTPS_PROXY}}}"

if [ -z "$PROXY_URL" ]; then
    echo "No proxy URL provided."
    echo "Usage: sudo bash configure-npm-proxy.sh [proxy-url]"
    echo "   Or set HTTP_PROXY or HTTPS_PROXY environment variable"
    echo ""
    echo "Example:"
    echo "  sudo HTTP_PROXY=http://proxy.example.com:8080 bash configure-npm-proxy.sh"
    exit 1
fi

echo "Configuring npm proxy: $PROXY_URL"

# Configure npm for the service user
sudo -u "$SERVICE_USER" bash << EOF
cd "$INSTALL_DIR"
npm config set proxy "$PROXY_URL"
npm config set https-proxy "$PROXY_URL"
npm config set strict-ssl false
npm config get proxy
npm config get https-proxy
EOF

echo ""
echo "✓ npm proxy configured"
echo ""
echo "Now try installing dependencies:"
echo "  sudo -u $SERVICE_USER bash -c 'cd $INSTALL_DIR && npm install'"

