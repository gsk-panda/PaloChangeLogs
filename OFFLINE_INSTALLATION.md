# Offline Installation Guide

This guide explains how to install Palo ChangeLogs on a server without direct internet access or behind a restrictive web proxy.

## Overview

The installation process requires downloading:
1. **Node.js setup script** - From rpm.nodesource.com
2. **Application repository** - From GitHub
3. **npm packages** - Various npm dependencies

## Step 1: Download Required Files

On a machine with internet access, run the download script:

```bash
bash download-for-offline-install.sh
```

This will create an `offline-install-files` directory containing:
- `node-setup-20.sh` - Node.js installation script
- `palo-changelogs-repo.tar.gz` - Application repository archive
- `TRANSFER_INSTRUCTIONS.txt` - Detailed transfer instructions

## Step 2: Transfer Files to Server

### Option A: SCP Transfer (Recommended)

```bash
# Transfer entire directory
scp -r offline-install-files/* user@server:/tmp/offline-install-files/

# Or transfer files individually
scp node-setup-20.sh user@server:/tmp/
scp palo-changelogs-repo.tar.gz user@server:/tmp/
```

### Option B: Manual Transfer

1. Download files to a USB drive or network share
2. Copy to server: `/tmp/offline-install-files/`

## Step 3: Extract Repository on Server

```bash
# SSH into server
ssh user@server

# Extract repository
cd /tmp/offline-install-files
tar -xzf palo-changelogs-repo.tar.gz
```

## Step 4: Run Installation in Offline Mode

```bash
cd /tmp/offline-install-files/PaloChangeLogs
sudo bash install_rhel_production.sh \
  --offline \
  --node-setup /tmp/offline-install-files/node-setup-20.sh \
  --repo-dir /tmp/offline-install-files/PaloChangeLogs
```

## Handling npm Packages

npm packages still need to be downloaded. You have several options:

### Option 1: Use Internal npm Registry/Mirror

If your organization has an internal npm registry:

```bash
# Configure npm to use internal registry
npm config set registry https://your-internal-registry.com/npm/

# Then run installation normally
sudo bash install_rhel_production.sh --offline --node-setup ... --repo-dir ...
```

### Option 2: Pre-download npm Packages

On a machine with internet access:

```bash
# Clone repository
git clone https://github.com/gsk-panda/PaloChangeLogs.git
cd PaloChangeLogs
git checkout feature/database-storage

# Install dependencies
npm install

# Create tarball of node_modules
tar -czf node_modules.tar.gz node_modules/

# Transfer to server
scp node_modules.tar.gz user@server:/tmp/
```

On the server:

```bash
# Extract node_modules before running installation
cd /tmp/offline-install-files/PaloChangeLogs
tar -xzf /tmp/node_modules.tar.gz

# Run installation (it will skip npm install if node_modules exists)
sudo bash install_rhel_production.sh --offline --node-setup ... --repo-dir ...
```

### Option 3: Use npm pack for Individual Packages

For better-sqlite3 specifically (if it's blocked):

```bash
# On machine with internet
npm pack better-sqlite3

# Transfer .tgz file to server
scp better-sqlite3-*.tgz user@server:/tmp/

# On server, install from local file
cd /opt/palo-changelogs
npm install /tmp/better-sqlite3-*.tgz
```

## Troubleshooting

### Node.js Setup Script Fails

If the Node.js setup script fails, you can manually install Node.js:

```bash
# Download Node.js RPM manually
# Visit: https://rpm.nodesource.com/pub_20.x/el/9/x86_64/
# Download: nodejs-20.x.x-1nodesource.x86_64.rpm

# Install manually
sudo dnf install -y /path/to/nodejs-*.rpm
```

### Repository Already Exists

If the installation directory already exists:

```bash
# Remove old installation
sudo rm -rf /opt/palo-changelogs

# Run installation again
sudo bash install_rhel_production.sh --offline ...
```

### npm Packages Still Blocked

If npm packages are still blocked by proxy:

1. Check npm proxy configuration:
   ```bash
   npm config get proxy
   npm config get https-proxy
   ```

2. Configure npm to use your proxy:
   ```bash
   npm config set proxy http://proxy.company.com:8080
   npm config set https-proxy http://proxy.company.com:8080
   ```

3. Or configure npm to bypass proxy for specific registries:
   ```bash
   npm config set registry https://registry.npmjs.org/
   npm config set strict-ssl false  # Only if using self-signed certificates
   ```

## Quick Reference

```bash
# Download files (on machine with internet)
bash download-for-offline-install.sh

# Transfer to server
scp -r offline-install-files/* user@server:/tmp/offline-install-files/

# On server: Extract and install
cd /tmp/offline-install-files
tar -xzf palo-changelogs-repo.tar.gz
cd PaloChangeLogs
sudo bash install_rhel_production.sh \
  --offline \
  --node-setup /tmp/offline-install-files/node-setup-20.sh \
  --repo-dir /tmp/offline-install-files/PaloChangeLogs
```

## Additional Notes

- The installation script will skip git operations in offline mode
- System packages (via dnf) still need to be available from your artifactory
- npm packages may require proxy configuration or internal registry
- For complete offline npm installation, consider using `npm pack` or `npm bundle`

