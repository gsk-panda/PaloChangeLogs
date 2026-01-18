#!/bin/bash

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root"
    exit 1
fi

echo "=========================================="
echo "Update Panorama API Key"
echo "=========================================="
echo ""

read -p "Enter new Panorama API Key: " NEW_API_KEY
if [ -z "$NEW_API_KEY" ]; then
    echo "Error: API Key cannot be empty"
    exit 1
fi

API_KEY_FILE="/etc/palochangelogs/panorama-api-key"

if [ ! -f "$API_KEY_FILE" ]; then
    echo "Error: API key file not found at $API_KEY_FILE"
    echo "Please run the full installation script first."
    exit 1
fi

printf '%s' "$NEW_API_KEY" > "$API_KEY_FILE"
chmod 640 "$API_KEY_FILE"
chown root:palochangelogs "$API_KEY_FILE"

echo "✓ API key updated successfully"
echo ""
echo "Restarting API proxy service..."
systemctl restart palochangelogs-api-proxy.service

if systemctl is-active --quiet palochangelogs-api-proxy.service; then
    echo "✓ API proxy service restarted successfully"
else
    echo "⚠ Warning: API proxy service may not have restarted properly"
    echo "Check status with: systemctl status palochangelogs-api-proxy.service"
fi

echo ""
echo "Done!"
