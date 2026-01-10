#!/bin/bash

set -e

NODE_VERSION="20"
REPO_URL="https://github.com/gsk-panda/PaloChangeLogs.git"
BRANCH="feature/database-storage"
DOWNLOAD_DIR="./offline-install-files"

echo "=========================================="
echo "Download Files for Offline Installation"
echo "=========================================="
echo ""
echo "This script downloads files needed for offline installation"
echo "Download directory: $DOWNLOAD_DIR"
echo ""

mkdir -p "$DOWNLOAD_DIR"
cd "$DOWNLOAD_DIR"

echo "Step 1: Downloading Node.js setup script..."
NODE_SETUP_URL="https://rpm.nodesource.com/setup_${NODE_VERSION}.x"
if command -v curl &> /dev/null; then
    curl -fsSL "$NODE_SETUP_URL" -o "node-setup-${NODE_VERSION}.sh"
    echo "✓ Downloaded: node-setup-${NODE_VERSION}.sh"
elif command -v wget &> /dev/null; then
    wget "$NODE_SETUP_URL" -O "node-setup-${NODE_VERSION}.sh"
    echo "✓ Downloaded: node-setup-${NODE_VERSION}.sh"
else
    echo "⚠ Error: curl or wget required to download files"
    exit 1
fi

echo ""
echo "Step 2: Downloading Node.js headers (for building native modules)..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//')
    HEADERS_URL="https://nodejs.org/download/release/v${NODE_VERSION}/node-v${NODE_VERSION}-headers.tar.gz"
    echo "Node.js version detected: ${NODE_VERSION}"
    echo "Downloading headers from: ${HEADERS_URL}"
    
    if command -v curl &> /dev/null; then
        curl -fsSL "$HEADERS_URL" -o "node-v${NODE_VERSION}-headers.tar.gz" && \
        echo "✓ Downloaded: node-v${NODE_VERSION}-headers.tar.gz" || \
        echo "⚠ Warning: Could not download Node.js headers (may be blocked by proxy)"
    elif command -v wget &> /dev/null; then
        wget "$HEADERS_URL" -O "node-v${NODE_VERSION}-headers.tar.gz" && \
        echo "✓ Downloaded: node-v${NODE_VERSION}-headers.tar.gz" || \
        echo "⚠ Warning: Could not download Node.js headers (may be blocked by proxy)"
    else
        echo "⚠ Warning: curl or wget not found, skipping headers download"
    fi
else
    echo "⚠ Warning: Node.js not found, cannot determine version for headers"
    echo "   You can manually download headers for your Node.js version from:"
    echo "   https://nodejs.org/download/release/"
fi

echo ""
echo "Step 3: Downloading repository as archive..."
if command -v git &> /dev/null; then
    if [ -d "PaloChangeLogs" ]; then
        echo "Repository directory exists, updating..."
        cd PaloChangeLogs
        git fetch origin
        git checkout "$BRANCH"
        git pull origin "$BRANCH"
        cd ..
    else
        echo "Cloning repository..."
        git clone --branch "$BRANCH" --single-branch "$REPO_URL" PaloChangeLogs
    fi
    
    echo "Creating repository archive..."
    tar -czf palo-changelogs-repo.tar.gz PaloChangeLogs/
    echo "✓ Created: palo-changelogs-repo.tar.gz"
    
    echo "Creating zip archive (alternative)..."
    if command -v zip &> /dev/null; then
        zip -r palo-changelogs-repo.zip PaloChangeLogs/
        echo "✓ Created: palo-changelogs-repo.zip"
    fi
else
    echo "⚠ Warning: git not found. Cannot download repository."
    echo "   You can manually download the repository from:"
    echo "   $REPO_URL (branch: $BRANCH)"
    echo "   Or download as ZIP from GitHub web interface"
fi

echo ""
echo "Step 4: Creating transfer instructions..."
cat > TRANSFER_INSTRUCTIONS.txt << EOF
==========================================
Offline Installation Transfer Instructions
==========================================

Files downloaded:
1. node-setup-${NODE_VERSION}.sh - Node.js installation script
2. palo-changelogs-repo.tar.gz - Application repository archive
3. node-v*.tar.gz - Node.js headers (if downloaded, for building native modules)

To transfer to server:
1. From your local machine (with internet access), run:
   scp -r $DOWNLOAD_DIR/* user@server:/tmp/offline-install-files/

2. Or transfer files individually:
   scp node-setup-${NODE_VERSION}.sh user@server:/tmp/
   scp palo-changelogs-repo.tar.gz user@server:/tmp/
   scp node-v*-headers.tar.gz user@server:/tmp/  # If downloaded

3. On the server, extract repository and headers:
   cd /tmp/offline-install-files
   tar -xzf palo-changelogs-repo.tar.gz
   
   # Extract Node.js headers (if downloaded)
   if [ -f node-v*-headers.tar.gz ]; then
       NODE_VERSION=\$(node -v | sed 's/v//')
       mkdir -p /home/palo-changelogs/.node-gyp/\${NODE_VERSION}
       tar -xzf node-v*-headers.tar.gz -C /home/palo-changelogs/.node-gyp/\${NODE_VERSION} --strip-components=1
       chown -R palo-changelogs:palo-changelogs /home/palo-changelogs/.node-gyp
   fi
   
   # Run installation
   cd PaloChangeLogs
   sudo bash install_rhel_production.sh --offline --node-setup /tmp/offline-install-files/node-setup-${NODE_VERSION}.sh --repo-dir /tmp/offline-install-files/PaloChangeLogs

Alternative: If you have the repository already on the server, you can:
1. Copy node-setup-${NODE_VERSION}.sh to the server
2. Run: sudo bash install_rhel_production.sh --offline --node-setup /path/to/node-setup-${NODE_VERSION}.sh

Note: npm packages will still need to be downloaded, but you can:
- Use an internal npm registry/mirror
- Download node_modules from a machine with internet access
- Use npm pack to create tarballs of dependencies
EOF

echo "✓ Created: TRANSFER_INSTRUCTIONS.txt"
echo ""
echo "=========================================="
echo "Download Complete!"
echo "=========================================="
echo ""
echo "Files are in: $DOWNLOAD_DIR"
echo ""
echo "Next steps:"
echo "1. Review TRANSFER_INSTRUCTIONS.txt"
echo "2. SCP files to your server"
echo "3. Run installation script with --offline flag"
echo ""

