#!/bin/bash

# Fix script for npm install issues with better-sqlite3
# Usage: sudo bash fix-npm-install.sh

set -e

INSTALL_DIR="/opt/palo-changelogs"
SERVICE_USER="palo-changelogs"

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

echo "Fixing npm installation issues..."

cd "$INSTALL_DIR"

# Check if we're behind a proxy
if [ -n "$HTTP_PROXY" ] || [ -n "$HTTPS_PROXY" ]; then
    echo "Proxy detected. Configuring npm..."
    [ -n "$HTTP_PROXY" ] && npm config set proxy "$HTTP_PROXY" || true
    [ -n "$HTTPS_PROXY" ] && npm config set https-proxy "$HTTPS_PROXY" || true
    npm config set strict-ssl false || true
fi

# Set npm configuration for better-sqlite3
export npm_config_build_from_source=false
export npm_config_prefer_offline=false

# Ensure build tools are installed
echo ""
echo "Checking build tools..."
if ! command -v python3 &> /dev/null; then
    echo "Installing Python 3..."
    dnf install -y python3
fi

if ! command -v make &> /dev/null; then
    echo "Installing make..."
    dnf install -y make
fi

if ! command -v g++ &> /dev/null; then
    echo "Installing gcc-c++..."
    dnf install -y gcc-c++
fi

# Ensure proper permissions
echo ""
echo "Setting permissions..."
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/node_modules"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/node_modules"

# Try to install better-sqlite3 specifically
echo ""
echo "Installing better-sqlite3..."
echo "This may take a few minutes..."

# Method 1: Try with prebuilt binaries
echo "Attempting to install with prebuilt binaries..."
sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR' && npm install better-sqlite3 --build-from-source=false" || {
    echo "Prebuilt binaries not available, trying to build from source..."
    
    # Method 2: Build from source with proper permissions
    sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR' && npm install better-sqlite3 --build-from-source=true" || {
        echo "Build failed, trying alternative approach..."
        
        # Method 3: Install all dependencies except better-sqlite3, then rebuild
        sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR' && npm install --ignore-scripts" || true
        sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR' && npm rebuild better-sqlite3" || {
            echo "⚠ better-sqlite3 build failed"
            echo ""
            echo "Troubleshooting steps:"
            echo "1. Check internet connectivity and proxy settings"
            echo "2. Verify build tools: python3, make, gcc-c++"
            echo "3. Check permissions on $INSTALL_DIR"
            echo "4. Try manual build:"
            echo "   cd $INSTALL_DIR"
            echo "   sudo -u $SERVICE_USER npm install better-sqlite3 --build-from-source=true"
            exit 1
        }
    }
}

# Install remaining dependencies
echo ""
echo "Installing remaining dependencies..."
sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR' && npm install"

# Verify installation
echo ""
echo "Verifying installation..."
if [ -d "node_modules/better-sqlite3" ]; then
    if [ -f "node_modules/better-sqlite3/build/Release/better_sqlite3.node" ] || \
       [ -f "node_modules/better-sqlite3/lib/better_sqlite3.node" ]; then
        echo "✓ better-sqlite3 installed and compiled successfully"
    else
        echo "⚠ better-sqlite3 directory exists but binary not found"
        echo "   Trying to rebuild..."
        sudo -u "$SERVICE_USER" bash -c "cd '$INSTALL_DIR' && npm rebuild better-sqlite3"
    fi
else
    echo "✗ better-sqlite3 not installed"
    exit 1
fi

# Set proper ownership
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/node_modules"

echo ""
echo "✓ npm installation completed successfully"

