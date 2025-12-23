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
echo "Step 7a: Setting ownership of installation directory..."
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

echo ""
echo "Step 8: Installing npm dependencies..."
cd "$INSTALL_DIR"
if [ -d "node_modules" ] && [ -f "package.json" ]; then
    echo "node_modules directory exists. Checking if dependencies need updating..."
    if [ "package.json" -nt "node_modules" ] || [ ! -f "package-lock.json" ]; then
        echo "package.json is newer than node_modules or package-lock.json missing. Installing dependencies..."
        npm install
    else
        echo "Dependencies appear to be up to date. Skipping npm install."
    fi
else
    echo "node_modules not found. Installing dependencies..."
    npm install
fi
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
After=network.target palo-changelogs-backend.service nginx.service
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
echo "Step 12: Creating update script..."
UPDATE_SCRIPT="$INSTALL_DIR/update.sh"
cat > "$UPDATE_SCRIPT" << 'UPDATE_EOF'
#!/bin/bash
set -e

INSTALL_DIR="/opt/palo-changelogs"
SERVICE_USER="palo-changelogs"

if [ "$EUID" -eq 0 ]; then
    echo "Running update as root, switching to $SERVICE_USER..."
    su - $SERVICE_USER -c "cd $INSTALL_DIR && $0"
    exit $?
fi

cd "$INSTALL_DIR"

echo "Pulling latest changes..."
git fetch origin
git checkout feature/database-storage
git pull origin feature/database-storage

echo "Checking if dependencies need updating..."
if [ -d "node_modules" ] && [ -f "package.json" ]; then
    if [ "package.json" -nt "node_modules" ] || [ ! -f "package-lock.json" ]; then
        echo "package.json is newer than node_modules or package-lock.json missing. Installing dependencies..."
        npm install
    else
        echo "Dependencies appear to be up to date. Skipping npm install."
    fi
else
    echo "node_modules not found. Installing dependencies..."
    npm install
fi

echo "Building application..."
export NODE_OPTIONS="--openssl-legacy-provider"
npm run build

echo "Update complete! Restarting services..."
sudo systemctl restart palo-changelogs-backend
sudo systemctl restart palo-changelogs-frontend

echo "Services restarted. Check status with:"
echo "  systemctl status palo-changelogs-backend"
echo "  systemctl status palo-changelogs-frontend"
UPDATE_EOF
chmod +x "$UPDATE_SCRIPT"
chown "$SERVICE_USER:$SERVICE_USER" "$UPDATE_SCRIPT"
echo "Update script created at $UPDATE_SCRIPT"

echo ""
echo "Step 13: Creating data directory for database..."
mkdir -p "$INSTALL_DIR/data"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/data"
chmod 755 "$INSTALL_DIR/data"
echo "Database directory created at $INSTALL_DIR/data"

echo ""
echo "Step 14: Configuring SSL certificate..."
SSL_DIR="/etc/nginx/ssl"
mkdir -p "$SSL_DIR"
SSL_CERT="$SSL_DIR/panovision.officeours.com.crt"
SSL_KEY="$SSL_DIR/panovision.officeours.com.key"

if [ ! -f "$SSL_CERT" ] || [ ! -f "$SSL_KEY" ]; then
    echo "Generating self-signed SSL certificate for panovision.officeours.com..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_KEY" \
        -out "$SSL_CERT" \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=panovision.officeours.com" \
        2>/dev/null
    chmod 600 "$SSL_KEY"
    chmod 644 "$SSL_CERT"
    echo "SSL certificate created at $SSL_CERT"
else
    echo "SSL certificate already exists at $SSL_CERT"
fi

echo ""
echo "Step 15: Configuring NGINX reverse proxy..."
NGINX_CONF="/etc/nginx/conf.d/palo-changelogs.conf"
cat > "$NGINX_CONF" << 'NGINX_EOF'
upstream backend_api {
    server localhost:3001;
    keepalive 32;
}

upstream frontend_app {
    server localhost:4173;
    keepalive 32;
}

server {
    listen 80;
    server_name panovision.officeours.com;
    
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name panovision.officeours.com;

    ssl_certificate /etc/nginx/ssl/panovision.officeours.com.crt;
    ssl_certificate_key /etc/nginx/ssl/panovision.officeours.com.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    client_max_body_size 10M;
    
    access_log /var/log/nginx/palo-changelogs-access.log;
    error_log /var/log/nginx/palo-changelogs-error.log;

    location /api {
        proxy_pass http://backend_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    location /panorama-proxy/ {
        proxy_pass https://panorama.officeours.com/;
        proxy_ssl_verify off;
        proxy_ssl_server_name on;
        proxy_http_version 1.1;
        proxy_set_header Host panorama.officeours.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    location / {
        proxy_pass http://frontend_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
NGINX_EOF

echo "NGINX configuration created at $NGINX_CONF"

echo ""
echo "Step 16: Testing NGINX configuration..."
nginx -t
if [ $? -eq 0 ]; then
    echo "NGINX configuration is valid"
else
    echo "WARNING: NGINX configuration test failed. Please review the configuration."
fi

echo ""
echo "Step 17: Configuring firewall..."
if command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
    echo "Firewall configured for HTTP and HTTPS"
else
    echo "firewall-cmd not found. Please configure firewall manually to allow ports 80 and 443."
fi

echo ""
echo "Step 18: Enabling and starting NGINX..."
systemctl enable nginx
systemctl restart nginx
echo "NGINX enabled and started"

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
echo "   systemctl status nginx"
echo ""
echo "5. View logs:"
echo "   journalctl -u palo-changelogs-backend -f"
echo "   journalctl -u palo-changelogs-frontend -f"
echo "   tail -f /var/log/nginx/palo-changelogs-access.log"
echo "   tail -f /var/log/nginx/palo-changelogs-error.log"
echo ""
echo "6. For development mode, run as $SERVICE_USER:"
echo "   sudo -u $SERVICE_USER bash -c 'cd $INSTALL_DIR && npm run dev:full'"
echo ""
echo "The application will be available at:"
echo "  - Production (HTTPS): https://panovision.officeours.com"
echo "  - HTTP redirects to HTTPS automatically"
echo "  - Backend API: https://panovision.officeours.com/api"
echo ""
echo "Note: The scheduled job runs daily at 01:00 MST to archive previous day's logs."
echo ""
echo "SSL Certificate Information:"
echo "  - Certificate: /etc/nginx/ssl/panovision.officeours.com.crt"
echo "  - Private Key: /etc/nginx/ssl/panovision.officeours.com.key"
echo "  - Self-signed certificate (browser will show security warning)"
echo "  - To replace with a trusted certificate, update the paths in:"
echo "    /etc/nginx/conf.d/palo-changelogs.conf"
echo ""
echo "NGINX Configuration:"
echo "  - Config file: /etc/nginx/conf.d/palo-changelogs.conf"
echo "  - Test config: nginx -t"
echo "  - Reload config: systemctl reload nginx"
echo ""

