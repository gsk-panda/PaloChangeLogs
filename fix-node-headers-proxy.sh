#!/bin/bash

set -e

INSTALL_DIR="${INSTALL_DIR:-/opt/palo-changelogs}"
SERVICE_USER="${SERVICE_USER:-palo-changelogs}"

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

echo "=========================================="
echo "Fix Node.js Headers Download Issue"
echo "=========================================="
echo ""

if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
HEADERS_URL="https://nodejs.org/download/release/v${NODE_VERSION}/node-v${NODE_VERSION}-headers.tar.gz"
HEADERS_DIR="/home/${SERVICE_USER}/.node-gyp/${NODE_VERSION}"

echo "Node.js version: ${NODE_VERSION}"
echo "Headers URL: ${HEADERS_URL}"
echo "Target directory: ${HEADERS_DIR}"
echo ""

# Create directory structure
mkdir -p "$HEADERS_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "/home/${SERVICE_USER}/.node-gyp"

# Check if headers already exist
if [ -f "$HEADERS_DIR/node_version.h" ]; then
    echo "✓ Node.js headers already exist at ${HEADERS_DIR}"
    echo "  Skipping download..."
    exit 0
fi

echo "Downloading Node.js headers..."
echo ""

# Method 1: Try direct download (may work if proxy allows)
if sudo -u "$SERVICE_USER" bash -c "cd '$HEADERS_DIR' && curl -fsSL '$HEADERS_URL' -o headers.tar.gz 2>&1" || \
   sudo -u "$SERVICE_USER" bash -c "cd '$HEADERS_DIR' && wget -q '$HEADERS_URL' -O headers.tar.gz 2>&1"; then
    if [ -f "$HEADERS_DIR/headers.tar.gz" ]; then
        echo "✓ Headers downloaded successfully"
        sudo -u "$SERVICE_USER" bash -c "cd '$HEADERS_DIR' && tar -xzf headers.tar.gz --strip-components=1 && rm headers.tar.gz"
        chown -R "$SERVICE_USER:$SERVICE_USER" "$HEADERS_DIR"
        echo "✓ Node.js headers extracted successfully"
        exit 0
    fi
fi

echo "⚠ Direct download failed (likely blocked by proxy)"
echo ""
echo "=========================================="
echo "Manual Download Required"
echo "=========================================="
echo ""
echo "Please download Node.js headers manually:"
echo ""
echo "1. On a machine with internet access, download:"
echo "   ${HEADERS_URL}"
echo ""
echo "2. Transfer to server:"
echo "   scp node-v${NODE_VERSION}-headers.tar.gz user@server:/tmp/"
echo ""
echo "3. Extract on server:"
echo "   sudo mkdir -p ${HEADERS_DIR}"
echo "   sudo tar -xzf /tmp/node-v${NODE_VERSION}-headers.tar.gz -C ${HEADERS_DIR} --strip-components=1"
echo "   sudo chown -R ${SERVICE_USER}:${SERVICE_USER} ${HEADERS_DIR}"
echo ""
echo "4. Then retry npm install:"
echo "   cd ${INSTALL_DIR}"
echo "   sudo -u ${SERVICE_USER} npm rebuild better-sqlite3"
echo ""
exit 1

