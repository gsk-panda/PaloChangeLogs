#!/bin/bash

set -e

REPO_URL="https://github.com/gsk-panda/PaloChangeLogs.git"
INSTALL_DIR="/opt/palo-changelogs"
SERVICE_USER="palo-changelogs"
NODE_VERSION="18"

echo "=========================================="
echo "Palo ChangeLogs Installation Script"
echo "RHEL 9.7 Installation"
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
dnf install -y git curl wget tar gzip

echo ""
echo "Step 3: Installing Node.js ${NODE_VERSION}.x..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
    dnf install -y nodejs
else
    INSTALLED_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$INSTALLED_VERSION" -lt "$NODE_VERSION" ]; then
        echo "Node.js version $INSTALLED_VERSION detected. Upgrading to ${NODE_VERSION}.x..."
        curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
        dnf install -y nodejs
    else
        echo "Node.js $(node -v) is already installed"
    fi
fi

echo ""
echo "Step 4: Verifying Node.js and npm installation..."
node -v
npm -v

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
chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

echo ""
echo "Step 7: Cloning repository..."
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "Repository already exists. Updating..."
    sudo -u "$SERVICE_USER" bash -c "cd $INSTALL_DIR && git pull"
else
    sudo -u "$SERVICE_USER" git clone "$REPO_URL" "$INSTALL_DIR"
fi

echo ""
echo "Step 8: Installing npm dependencies..."
cd "$INSTALL_DIR"
sudo -u "$SERVICE_USER" npm install

echo ""
echo "Step 9: Configuring Panorama and API keys..."
ENV_FILE="$INSTALL_DIR/.env.local"

if [ ! -f "$ENV_FILE" ]; then
    echo ""
    echo "Please provide the following configuration:"
    echo ""
    
    read -p "Enter Panorama IP or hostname (e.g., panorama.example.com or 192.168.1.1): " PANORAMA_HOST
    while [ -z "$PANORAMA_HOST" ]; do
        echo "Panorama host cannot be empty."
        read -p "Enter Panorama IP or hostname: " PANORAMA_HOST
    done
    
    read -p "Enter Panorama API key: " PANORAMA_API_KEY
    while [ -z "$PANORAMA_API_KEY" ]; do
        echo "Panorama API key cannot be empty."
        read -p "Enter Panorama API key: " PANORAMA_API_KEY
    done
    
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
    echo "Skipping configuration prompts. Edit the file manually if needed."
fi

echo ""
echo "Step 10: Building application..."
sudo -u "$SERVICE_USER" bash -c "cd $INSTALL_DIR && npm run build"

echo ""
echo "Step 11: Creating systemd service..."
WRAPPER_SCRIPT="$INSTALL_DIR/start-service.sh"
cat > "$WRAPPER_SCRIPT" << 'WRAPPER_EOF'
#!/bin/bash
cd /opt/palo-changelogs
source .env.local
export PANORAMA_HOST
export PANORAMA_API_KEY
export API_KEY
npm run preview
WRAPPER_EOF
chmod +x "$WRAPPER_SCRIPT"
chown "$SERVICE_USER:$SERVICE_USER" "$WRAPPER_SCRIPT"

SERVICE_FILE="/etc/systemd/system/palo-changelogs.service"
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Palo ChangeLogs Application
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
Environment="NODE_ENV=production"
ExecStart=$WRAPPER_SCRIPT
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Installation directory: $INSTALL_DIR"
echo "Service user: $SERVICE_USER"
echo ""
echo "Next steps:"
if [ ! -f "$ENV_FILE" ]; then
    echo "1. Edit $ENV_FILE and configure:"
    echo "   - PANORAMA_HOST=your_panorama_host"
    echo "   - PANORAMA_API_KEY=your_panorama_api_key"
    echo "   - API_KEY=your_gemini_api_key"
    echo ""
fi
echo "2. Start the service:"
echo "   systemctl start palo-changelogs"
echo ""
echo "3. Enable the service to start on boot:"
echo "   systemctl enable palo-changelogs"
echo ""
echo "4. Check service status:"
echo "   systemctl status palo-changelogs"
echo ""
echo "5. View logs:"
echo "   journalctl -u palo-changelogs -f"
echo ""
echo "6. For development mode, run as $SERVICE_USER:"
echo "   sudo -u $SERVICE_USER bash -c 'cd $INSTALL_DIR && npm run dev'"
echo ""
echo "The application will be available at:"
echo "  - Production: http://localhost:4173 (or your server IP)"
echo "  - Development: http://localhost:5173 (or your server IP)"
echo ""

