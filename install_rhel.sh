#!/bin/bash

set -e

REPO_URL="https://github.com/gsk-panda/PaloChangeLogs.git"
INSTALL_DIR="/opt/palo-changelogs"
SERVICE_USER="palo-changelogs"
NODE_VERSION="20"
PANORAMA_HOST="panorama.officeours.com"
PANORAMA_API_KEY="LUFRPT1UcFFML3JPQ21CRVFLU2w2ZHc1dzU4aVRGN1E9dzczNHg3T0VsRS9yYmFMcEpWdXBWdHkzS2dEa1FqU3dPN0xoejZDMWVpQVVNZlZUeGFIZ0xVMm5vZEtCYVcxdA=="

echo "=========================================="
echo "Palo ChangeLogs Installation Script"
echo "RHEL 9.7 Installation"
echo "Database Storage Branch"
echo "=========================================="

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

echo ""
echo "Step 1: Updating system packages..."
dnf update -y

echo ""
echo "Step 2: Installing prerequisites..."
dnf install -y git curl wget tar gzip python3 make gcc-c++ sqlite-devel

echo ""
echo "Step 3: Installing Node.js ${NODE_VERSION}.x..."
INSTALLED_VERSION=""
if command -v node &> /dev/null; then
    INSTALLED_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    echo "Current Node.js version: $(node -v)"
fi

if [ -z "$INSTALLED_VERSION" ] || [ "$INSTALLED_VERSION" -lt "$NODE_VERSION" ]; then
    if [ -n "$INSTALLED_VERSION" ]; then
        echo "Node.js version $INSTALLED_VERSION detected. Upgrading to ${NODE_VERSION}.x..."
    else
        echo "Node.js not found. Installing Node.js ${NODE_VERSION}.x..."
    fi
    curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
    dnf install -y nodejs --allowerasing
    hash -r
else
    echo "Node.js $(node -v) is already installed (meets requirement of ${NODE_VERSION}.x+)"
fi

echo ""
echo "Step 4: Verifying Node.js and npm installation..."
node -v
npm -v
ACTUAL_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$ACTUAL_VERSION" -lt "$NODE_VERSION" ]; then
    echo "WARNING: Node.js version is still below ${NODE_VERSION}.x. Current version: $(node -v)"
    echo "You may need to restart the shell or check your PATH."
fi

echo ""
echo "Step 5: Creating service user..."
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd -r -s /bin/bash -d "$INSTALL_DIR" -m "$SERVICE_USER"
    echo "User $SERVICE_USER created"
else
    echo "User $SERVICE_USER already exists"
fi

echo ""
echo "Step 6: Creating installation directory..."
mkdir -p "$INSTALL_DIR"

echo ""
echo "Step 7: Cloning repository..."
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "Repository already exists. Updating..."
    cd "$INSTALL_DIR"
    git fetch origin
    git checkout feature/database-storage
    git pull origin feature/database-storage
else
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    git checkout feature/database-storage
fi

echo ""
echo "Step 7a: Setting ownership of installation directory..."
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

echo ""
echo "Step 8: Installing npm dependencies..."
cd "$INSTALL_DIR"
npm install
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

echo ""
echo "Step 9: Configuring Panorama and API keys..."
ENV_FILE="$INSTALL_DIR/.env.local"
BACKEND_ENV_FILE="$INSTALL_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo ""
    echo "Using default Panorama configuration..."
    echo "  PANORAMA_HOST=$PANORAMA_HOST"
    echo ""
    
    read -p "Enter Gemini API key (press Enter to skip and configure later): " GEMINI_API_KEY
    
    cat > "$ENV_FILE" << EOF
PANORAMA_HOST=$PANORAMA_HOST
PANORAMA_API_KEY=$PANORAMA_API_KEY
API_KEY=${GEMINI_API_KEY:-your_gemini_api_key_here}
EOF
    chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "Created $ENV_FILE with configuration"
else
    echo "Environment file already exists at $ENV_FILE"
    echo "Skipping configuration. Edit the file manually if needed."
fi

if [ ! -f "$BACKEND_ENV_FILE" ]; then
    echo ""
    echo "Creating backend environment file..."
    cat > "$BACKEND_ENV_FILE" << EOF
PANORAMA_HOST=$PANORAMA_HOST
PANORAMA_API_KEY=$PANORAMA_API_KEY
PORT=3001
NODE_ENV=production
EOF
    chown "$SERVICE_USER:$SERVICE_USER" "$BACKEND_ENV_FILE"
    chmod 600 "$BACKEND_ENV_FILE"
    echo "Created $BACKEND_ENV_FILE for backend server"
else
    echo "Backend environment file already exists at $BACKEND_ENV_FILE"
fi

echo ""
echo "Step 10: Building application..."
cd "$INSTALL_DIR"
export NODE_OPTIONS="--openssl-legacy-provider"
npm run build
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

echo ""
echo "Step 11: Creating systemd services..."

BACKEND_WRAPPER_SCRIPT="$INSTALL_DIR/start-backend.sh"
cat > "$BACKEND_WRAPPER_SCRIPT" << 'BACKEND_EOF'
#!/bin/bash
cd /opt/palo-changelogs
source .env
export PANORAMA_HOST
export PANORAMA_API_KEY
export PORT
export NODE_ENV
npm run server:prod
BACKEND_EOF
chmod +x "$BACKEND_WRAPPER_SCRIPT"
chown "$SERVICE_USER:$SERVICE_USER" "$BACKEND_WRAPPER_SCRIPT"

FRONTEND_WRAPPER_SCRIPT="$INSTALL_DIR/start-frontend.sh"
cat > "$FRONTEND_WRAPPER_SCRIPT" << 'FRONTEND_EOF'
#!/bin/bash
cd /opt/palo-changelogs
source .env.local
export PANORAMA_HOST
export PANORAMA_API_KEY
export API_KEY
npm run preview
FRONTEND_EOF
chmod +x "$FRONTEND_WRAPPER_SCRIPT"
chown "$SERVICE_USER:$SERVICE_USER" "$FRONTEND_WRAPPER_SCRIPT"

BACKEND_SERVICE_FILE="/etc/systemd/system/palo-changelogs-backend.service"
cat > "$BACKEND_SERVICE_FILE" << EOF
[Unit]
Description=Palo ChangeLogs Backend API Server
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$BACKEND_WRAPPER_SCRIPT
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

FRONTEND_SERVICE_FILE="/etc/systemd/system/palo-changelogs-frontend.service"
cat > "$FRONTEND_SERVICE_FILE" << EOF
[Unit]
Description=Palo ChangeLogs Frontend Application
After=network.target palo-changelogs-backend.service
Requires=palo-changelogs-backend.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env.local
ExecStart=$FRONTEND_WRAPPER_SCRIPT
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

echo ""
echo "Step 12: Creating data directory for database..."
mkdir -p "$INSTALL_DIR/data"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/data"
chmod 755 "$INSTALL_DIR/data"
echo "Database directory created at $INSTALL_DIR/data"

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Installation directory: $INSTALL_DIR"
echo "Service user: $SERVICE_USER"
echo "Database directory: $INSTALL_DIR/data"
echo ""
echo "Next steps:"
if [ ! -f "$ENV_FILE" ] || [ ! -f "$BACKEND_ENV_FILE" ]; then
    echo "1. Configure environment files:"
    echo "   - Frontend: $ENV_FILE"
    echo "     - PANORAMA_HOST=your_panorama_host"
    echo "     - PANORAMA_API_KEY=your_panorama_api_key"
    echo "     - API_KEY=your_gemini_api_key"
    echo "   - Backend: $BACKEND_ENV_FILE"
    echo "     - PANORAMA_HOST=your_panorama_host"
    echo "     - PANORAMA_API_KEY=your_panorama_api_key"
    echo "     - PORT=3001 (default)"
    echo ""
fi
echo "2. Start the services:"
echo "   systemctl start palo-changelogs-backend"
echo "   systemctl start palo-changelogs-frontend"
echo ""
echo "3. Enable services to start on boot:"
echo "   systemctl enable palo-changelogs-backend"
echo "   systemctl enable palo-changelogs-frontend"
echo ""
echo "4. Check service status:"
echo "   systemctl status palo-changelogs-backend"
echo "   systemctl status palo-changelogs-frontend"
echo ""
echo "5. View logs:"
echo "   journalctl -u palo-changelogs-backend -f"
echo "   journalctl -u palo-changelogs-frontend -f"
echo ""
echo "6. For development mode, run as $SERVICE_USER:"
echo "   sudo -u $SERVICE_USER bash -c 'cd $INSTALL_DIR && npm run dev:full'"
echo ""
echo "The application will be available at:"
echo "  - Frontend: http://localhost:4173 (or your server IP)"
echo "  - Backend API: http://localhost:3001"
echo "  - Development: http://localhost:5173 (frontend) + http://localhost:3001 (backend)"
echo ""
echo "Note: The scheduled job runs daily at 01:00 MST to archive previous day's logs."
echo ""

