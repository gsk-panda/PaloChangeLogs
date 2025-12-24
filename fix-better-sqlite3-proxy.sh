#!/bin/bash

# Fix better-sqlite3 installation by bypassing proxy for Node.js headers
# Usage: sudo bash fix-better-sqlite3-proxy.sh

set -e

INSTALL_DIR="/opt/palo-changelogs"
SERVICE_USER="palo-changelogs"

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

echo "Fixing better-sqlite3 installation with proxy workaround..."

cd "$INSTALL_DIR"

# Method 1: Try to use prebuilt binaries (bypasses build entirely)
echo ""
echo "Method 1: Attempting to use prebuilt binaries..."
sudo -u "$SERVICE_USER" bash << 'EOF'
cd "$INSTALL_DIR"
export npm_config_build_from_source=false
export npm_config_prefer_offline=false
npm install better-sqlite3 --build-from-source=false --prefer-offline=false
EOF

if [ -f "node_modules/better-sqlite3/lib/better_sqlite3.node" ] || \
   [ -f "node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
    echo "✓ Successfully installed better-sqlite3 using prebuilt binaries"
    exit 0
fi

# Method 2: Download Node.js headers manually and configure node-gyp
echo ""
echo "Method 2: Downloading Node.js headers manually..."

NODE_VERSION=$(node -v | sed 's/v//')
HEADERS_URL="https://nodejs.org/download/release/v${NODE_VERSION}/node-v${NODE_VERSION}-headers.tar.gz"
HEADERS_DIR="$HOME/.node-gyp/${NODE_VERSION}"

mkdir -p "$HEADERS_DIR"
cd "$HEADERS_DIR"

# Try to download headers directly (bypassing npm proxy)
echo "Downloading Node.js headers for version $NODE_VERSION..."
if command -v wget &> /dev/null; then
    wget --no-proxy "$HEADERS_URL" -O headers.tar.gz || \
    curl --noproxy "*" "$HEADERS_URL" -o headers.tar.gz
else
    curl --noproxy "*" "$HEADERS_URL" -o headers.tar.gz
fi

if [ -f "headers.tar.gz" ]; then
    tar -xzf headers.tar.gz --strip-components=1
    rm headers.tar.gz
    echo "✓ Node.js headers downloaded manually"
    
    # Now try building better-sqlite3
    echo ""
    echo "Building better-sqlite3..."
    cd "$INSTALL_DIR"
    sudo -u "$SERVICE_USER" bash << EOF
cd "$INSTALL_DIR"
export npm_config_build_from_source=true
npm rebuild better-sqlite3
EOF
else
    echo "✗ Failed to download Node.js headers"
    echo ""
    echo "Method 3: Try installing without better-sqlite3 first, then rebuild..."
    exit 1
fi

# Method 3: Install all other dependencies first, then rebuild better-sqlite3
if [ ! -f "node_modules/better-sqlite3/lib/better_sqlite3.node" ] && \
   [ ! -f "node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
    echo ""
    echo "Method 3: Installing dependencies without scripts, then rebuilding..."
    cd "$INSTALL_DIR"
    sudo -u "$SERVICE_USER" bash << EOF
cd "$INSTALL_DIR"
npm install --ignore-scripts
npm rebuild better-sqlite3 --build-from-source=true
EOF
fi

# Verify installation
echo ""
echo "Verifying installation..."
if [ -f "node_modules/better-sqlite3/lib/better_sqlite3.node" ] || \
   [ -f "node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
    echo "✓ better-sqlite3 installed successfully"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/node_modules"
else
    echo "✗ better-sqlite3 installation failed"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check if you can access nodejs.org directly"
    echo "2. Try configuring npm proxy: sudo bash configure-npm-proxy.sh [proxy-url]"
    echo "3. Check build tools: python3, make, gcc-c++"
    exit 1
fi

