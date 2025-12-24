#!/bin/bash

set -e

# Configuration
REPO_URL="https://github.com/gsk-panda/PaloChangeLogs.git"
INSTALL_DIR="/opt/palo-changelogs"
SERVICE_USER="palo-changelogs"
NODE_VERSION="20"
PANORAMA_HOST="${PANORAMA_HOST:-panorama.officeours.com}"
PANORAMA_API_KEY="${PANORAMA_API_KEY:-}"

# NGINX Configuration (for use with existing server blocks)
NGINX_LOCATION_PATH="${NGINX_LOCATION_PATH:-/changelogs}"  # Base path for the app
BACKEND_PORT="${BACKEND_PORT:-3001}"  # Backend API port

echo "=========================================="
echo "Palo ChangeLogs Production Installation"
echo "RHEL 9.7 with NGINX"
echo "=========================================="
echo ""
echo "Configuration:"
echo "  Installation directory: $INSTALL_DIR"
echo "  Service user: $SERVICE_USER"
echo "  NGINX location path: $NGINX_LOCATION_PATH"
echo "  Backend port: $BACKEND_PORT"
echo "  Panorama host: $PANORAMA_HOST"
echo ""

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

echo "Step 1: Updating system packages..."
dnf update -y

echo ""
echo "Step 2: Installing prerequisites..."
dnf install -y git curl wget tar gzip python3 make gcc-c++ sqlite-devel nginx openssl

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
echo "Step 8: Setting ownership of installation directory..."
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

echo ""
echo "Step 9: Installing npm dependencies..."
cd "$INSTALL_DIR"
if [ -d "node_modules" ] && [ -f "package.json" ]; then
    echo "node_modules directory exists. Checking if dependencies need updating..."
    if [ "package.json" -nt "node_modules" ] || [ ! -f "package-lock.json" ]; then
        echo "package.json is newer than node_modules or package-lock.json missing. Installing dependencies..."
        sudo -u "$SERVICE_USER" npm install
    else
        echo "Dependencies appear to be up to date. Skipping npm install."
    fi
else
    echo "node_modules not found. Installing dependencies..."
    sudo -u "$SERVICE_USER" npm install
fi

echo ""
echo "Step 10: Configuring environment variables..."
ENV_FILE="$INSTALL_DIR/.env.local"
BACKEND_ENV_FILE="$INSTALL_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo ""
    echo "Configuring frontend environment..."
    if [ -z "$PANORAMA_API_KEY" ]; then
        read -p "Enter Panorama API key: " PANORAMA_API_KEY
    fi
    
    read -p "Enter Gemini API key (press Enter to skip and configure later): " GEMINI_API_KEY
    
    cat > "$ENV_FILE" << EOF
VITE_API_BASE=$NGINX_LOCATION_PATH
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
    if [ -z "$PANORAMA_API_KEY" ]; then
        read -p "Enter Panorama API key: " PANORAMA_API_KEY
    fi
    
    cat > "$BACKEND_ENV_FILE" << EOF
PANORAMA_HOST=$PANORAMA_HOST
PANORAMA_API_KEY=$PANORAMA_API_KEY
PORT=$BACKEND_PORT
NODE_ENV=production
EOF
    chown "$SERVICE_USER:$SERVICE_USER" "$BACKEND_ENV_FILE"
    chmod 600 "$BACKEND_ENV_FILE"
    echo "Created $BACKEND_ENV_FILE for backend server"
else
    echo "Backend environment file already exists at $BACKEND_ENV_FILE"
fi

echo ""
echo "Step 11: Building frontend application..."
cd "$INSTALL_DIR"

# Configure base path in vite.config.ts if needed
if [ "$NGINX_LOCATION_PATH" != "/" ]; then
    echo "Configuring Vite base path: $NGINX_LOCATION_PATH"
    # Backup original vite.config.ts
    cp vite.config.ts vite.config.ts.backup
    
    # Use Node.js to modify vite.config.ts (more reliable than sed)
    sudo -u "$SERVICE_USER" node << NODE_EOF
const fs = require('fs');
const path = require('path');

const configPath = 'vite.config.ts';
let content = fs.readFileSync(configPath, 'utf8');

// Check if base is already configured
if (!content.includes('base:')) {
    // Add base after defineConfig({
    content = content.replace(
        /(export default defineConfig\(\{)/,
        \`\$1\n  base: '$NGINX_LOCATION_PATH',\`
    );
    fs.writeFileSync(configPath, content, 'utf8');
    console.log('Added base path to vite.config.ts');
} else {
    console.log('Base path already configured in vite.config.ts');
}
NODE_EOF
fi

export NODE_OPTIONS="--openssl-legacy-provider"
sudo -u "$SERVICE_USER" npm run build

# Restore vite.config.ts backup if it exists (only if build succeeded)
if [ -f vite.config.ts.backup ] && [ -d dist ]; then
    mv vite.config.ts.backup vite.config.ts
    echo "Restored original vite.config.ts"
fi

# Verify build output
if [ ! -d "$INSTALL_DIR/dist" ]; then
    echo "ERROR: Frontend build failed - dist directory not found"
    exit 1
fi

echo "Frontend build completed successfully"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

echo ""
echo "Step 12: Creating data directory for database..."
mkdir -p "$INSTALL_DIR/data"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/data"
chmod 755 "$INSTALL_DIR/data"
echo "Database directory created at $INSTALL_DIR/data"

echo ""
echo "Step 13: Creating systemd service for backend..."
BACKEND_SERVICE_FILE="/etc/systemd/system/palo-changelogs-backend.service"
cat > "$BACKEND_SERVICE_FILE" << EOF
[Unit]
Description=Palo ChangeLogs Backend API
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
Environment="NODE_ENV=production"
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=/usr/bin/npm run server:prod
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=palo-changelogs-backend

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR/data

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "Backend service file created at $BACKEND_SERVICE_FILE"

echo ""
echo "Step 14: Creating NGINX configuration files..."

# Create upstream configuration (can be included at http level)
NGINX_UPSTREAM_CONF="/etc/nginx/conf.d/palo-changelogs-upstream.conf"
cat > "$NGINX_UPSTREAM_CONF" << UPSTREAM_EOF
# Palo ChangeLogs Backend Upstream
# Include this in the http block: include /etc/nginx/conf.d/palo-changelogs-upstream.conf;

upstream palo_changelogs_backend {
    server 127.0.0.1:$BACKEND_PORT;
    keepalive 32;
}
UPSTREAM_EOF

# Create location configuration (must be included in server block)
NGINX_LOCATIONS_CONF="/etc/nginx/conf.d/palo-changelogs-locations.conf"
cat > "$NGINX_LOCATIONS_CONF" << LOCATIONS_EOF
# Palo ChangeLogs Application Locations
# Include this file INSIDE your server block: include /etc/nginx/conf.d/palo-changelogs-locations.conf;

# Backend API location
location $NGINX_LOCATION_PATH/api {
    proxy_pass http://palo_changelogs_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Prefix $NGINX_LOCATION_PATH;
    proxy_cache_bypass \$http_upgrade;
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
    
    # CORS headers (if needed)
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range' always;
}

# Frontend static files
location $NGINX_LOCATION_PATH {
    alias $INSTALL_DIR/dist;
    try_files \$uri \$uri/ $NGINX_LOCATION_PATH/index.html;
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}

# Health check endpoint
location $NGINX_LOCATION_PATH/api/health {
    proxy_pass http://palo_changelogs_backend/api/health;
    access_log off;
}
LOCATIONS_EOF

echo "NGINX configuration files created:"
echo "  Upstream config: $NGINX_UPSTREAM_CONF"
echo "  Locations config: $NGINX_LOCATIONS_CONF"
echo ""
echo "To use these configurations:"
echo ""
echo "1. Add upstream to your http block in /etc/nginx/nginx.conf:"
echo "   http {"
echo "       # ... other directives ..."
echo "       include /etc/nginx/conf.d/palo-changelogs-upstream.conf;"
echo "       # ... rest of http block ..."
echo "   }"
echo ""
echo "2. Add locations to your server block:"
echo "   server {"
echo "       listen 443 ssl http2;"
echo "       server_name your-domain.com;"
echo "       # ... SSL configuration ..."
echo "       include /etc/nginx/conf.d/palo-changelogs-locations.conf;"
echo "       # ... other locations ..."
echo "   }"

echo ""
echo "Step 15: Testing NGINX configuration..."
if nginx -t 2>/dev/null; then
    echo "NGINX configuration test passed"
else
    echo "WARNING: NGINX configuration test failed."
    echo "This is expected if you haven't included the snippet in your server block yet."
    echo "After adding the include directive, run: nginx -t"
fi

echo ""
echo "Step 16: Configuring firewall (if firewall-cmd is available)..."
if command -v firewall-cmd &> /dev/null; then
    if firewall-cmd --state &>/dev/null; then
        firewall-cmd --permanent --add-service=http 2>/dev/null || true
        firewall-cmd --permanent --add-service=https 2>/dev/null || true
        firewall-cmd --reload 2>/dev/null || true
        echo "Firewall configured for HTTP and HTTPS"
    else
        echo "Firewall is not running, skipping configuration"
    fi
else
    echo "firewall-cmd not found. Please configure firewall manually if needed."
fi

echo ""
echo "Step 17: Enabling and starting backend service..."
systemctl daemon-reload
systemctl enable palo-changelogs-backend
systemctl start palo-changelogs-backend

# Wait a moment for service to start
sleep 2

if systemctl is-active --quiet palo-changelogs-backend; then
    echo "Backend service started successfully"
else
    echo "WARNING: Backend service may not have started correctly"
    echo "Check status with: systemctl status palo-changelogs-backend"
fi

echo ""
echo "Step 18: Creating update script..."
UPDATE_SCRIPT="$INSTALL_DIR/update.sh"
cat > "$UPDATE_SCRIPT" << 'UPDATE_EOF'
#!/bin/bash
set -e

INSTALL_DIR="/opt/palo-changelogs"
SERVICE_USER="palo-changelogs"

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

echo "Updating Palo ChangeLogs application..."
cd "$INSTALL_DIR"

echo "Pulling latest changes from repository..."
sudo -u "$SERVICE_USER" git fetch origin
sudo -u "$SERVICE_USER" git checkout feature/database-storage
sudo -u "$SERVICE_USER" git pull origin feature/database-storage

echo "Checking if dependencies need updating..."
if [ -d "node_modules" ] && [ -f "package.json" ]; then
    if [ "package.json" -nt "node_modules" ] || [ ! -f "package-lock.json" ]; then
        echo "package.json is newer than node_modules or package-lock.json missing. Installing dependencies..."
        sudo -u "$SERVICE_USER" npm install
    else
        echo "Dependencies appear to be up to date. Skipping npm install."
    fi
else
    echo "node_modules not found. Installing dependencies..."
    sudo -u "$SERVICE_USER" npm install
fi

echo "Building frontend application..."
export NODE_OPTIONS="--openssl-legacy-provider"
sudo -u "$SERVICE_USER" npm run build

echo "Update complete! Restarting backend service..."
systemctl restart palo-changelogs-backend

echo "Services restarted. Check status with:"
echo "  systemctl status palo-changelogs-backend"
UPDATE_EOF
chmod +x "$UPDATE_SCRIPT"
chown "$SERVICE_USER:$SERVICE_USER" "$UPDATE_SCRIPT"
echo "Update script created at $UPDATE_SCRIPT"

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Installation Summary:"
echo "  Installation directory: $INSTALL_DIR"
echo "  Service user: $SERVICE_USER"
echo "  Database directory: $INSTALL_DIR/data"
echo "  Frontend build: $INSTALL_DIR/dist"
echo "  Backend service: palo-changelogs-backend"
echo "  Backend port: $BACKEND_PORT"
echo "  NGINX location path: $NGINX_LOCATION_PATH"
echo ""
echo "Next Steps:"
echo ""
echo "1. Add NGINX configuration:"
echo "   a) Add upstream to your http block in /etc/nginx/nginx.conf:"
echo "      include /etc/nginx/conf.d/palo-changelogs-upstream.conf;"
echo ""
echo "   b) Add locations to your server block:"
echo "      include /etc/nginx/conf.d/palo-changelogs-locations.conf;"
echo "      (This MUST be inside a server block, not at http level)"
echo ""
echo "2. Test and reload NGINX:"
echo "   nginx -t"
echo "   systemctl reload nginx"
echo ""
echo "3. Verify backend service is running:"
echo "   systemctl status palo-changelogs-backend"
echo ""
echo "4. Check service logs:"
echo "   journalctl -u palo-changelogs-backend -f"
echo ""
echo "5. Access the application:"
echo "   https://your-domain.com$NGINX_LOCATION_PATH"
echo "   Backend API: https://your-domain.com$NGINX_LOCATION_PATH/api"
echo ""
echo "6. To update the application in the future:"
echo "   sudo $UPDATE_SCRIPT"
echo ""
echo "7. Database population (optional):"
echo "   sudo -u $SERVICE_USER bash -c 'cd $INSTALL_DIR && npm run populate:history'"
echo ""
echo "Note: The scheduled job runs daily at 01:00 MST to archive previous day's logs."
echo ""
echo "Environment Files:"
echo "  Frontend: $ENV_FILE"
echo "  Backend: $BACKEND_ENV_FILE"
echo "  Edit these files to update configuration."
echo ""

