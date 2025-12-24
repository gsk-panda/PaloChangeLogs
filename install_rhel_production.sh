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
echo "Step 14: Creating NGINX configuration file..."

# Create single comprehensive NGINX configuration file
NGINX_CONF="/etc/nginx/conf.d/palo-changelogs.conf"
cat > "$NGINX_CONF" << NGINX_EOF
# Palo ChangeLogs Complete NGINX Configuration
# 
# This file contains a complete server block configuration.
# 
# SETUP INSTRUCTIONS:
# 1. Add the upstream block below to your http {} block in /etc/nginx/nginx.conf
# 2. This server block will be automatically loaded if you have:
#    include /etc/nginx/conf.d/*.conf; in your http block
# 3. Customize the server_name and SSL certificate paths below

# ============================================================================
# STEP 1: Copy this upstream block to your http {} block in /etc/nginx/nginx.conf
# ============================================================================
# upstream palo_changelogs_backend {
#     server 127.0.0.1:$BACKEND_PORT;
#     keepalive 32;
# }

# ============================================================================
# SERVER BLOCK CONFIGURATION
# This server block is automatically included from /etc/nginx/conf.d/
# ============================================================================

# HTTP Server - Redirect all HTTP traffic to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name _;  # TODO: Change to your domain name (e.g., example.com)
    
    # Redirect all HTTP requests to HTTPS
    return 301 https://\$server_name\$request_uri;
}

# HTTPS Server - Main application server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name _;  # TODO: Change to your domain name (e.g., example.com)
    
    # SSL Certificate Configuration - TODO: Update these paths to your certificate files
    ssl_certificate /etc/nginx/ssl/certificate.crt;
    ssl_certificate_key /etc/nginx/ssl/private.key;
    
    # SSL Protocol Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    
    # SSL Session Configuration
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;
    
    # SSL Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # OCSP Stapling (uncomment if using Let's Encrypt or certificates with OCSP)
    # ssl_stapling on;
    # ssl_stapling_verify on;
    # ssl_trusted_certificate /etc/nginx/ssl/chain.pem;
    
    # Logging
    access_log /var/log/nginx/palo-changelogs-access.log;
    error_log /var/log/nginx/palo-changelogs-error.log;
    
    # Client settings
    client_max_body_size 10M;
    client_body_timeout 60s;
    client_header_timeout 60s;
    
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
        
        # Additional security headers for static files
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
    }
    
    # Health check endpoint
    location $NGINX_LOCATION_PATH/api/health {
        proxy_pass http://palo_changelogs_backend/api/health;
        access_log off;
    }
}
NGINX_EOF

echo "NGINX configuration file created at $NGINX_CONF"
echo ""
echo "Setup Instructions:"
echo ""
echo "1. Add the upstream block to your http {} block in /etc/nginx/nginx.conf:"
echo "   Edit /etc/nginx/nginx.conf and add this inside the http {} block:"
echo ""
echo "   http {"
echo "       # ... other directives ..."
echo "       "
echo "       upstream palo_changelogs_backend {"
echo "           server 127.0.0.1:$BACKEND_PORT;"
echo "           keepalive 32;"
echo "       }"
echo "       "
echo "       # Make sure this line exists to include conf.d files:"
echo "       include /etc/nginx/conf.d/*.conf;"
echo "       "
echo "       # ... rest of http block ..."
echo "   }"
echo ""
echo "2. Customize the server block in $NGINX_CONF:"
echo "   - Change 'server_name _;' to your actual domain name (required for HTTPS)"
echo "   - Update SSL certificate paths (ssl_certificate and ssl_certificate_key) - REQUIRED"
echo "   - If using Let's Encrypt, uncomment OCSP stapling lines and set ssl_trusted_certificate"
echo "   - Adjust logging paths if needed"
echo ""
echo "3. IMPORTANT - SSL Certificate Setup:"
echo "   The application REQUIRES HTTPS. You must provide valid SSL certificates."
echo "   Options:"
echo "   a) Let's Encrypt (recommended):"
echo "      sudo dnf install certbot python3-certbot-nginx"
echo "      sudo certbot --nginx -d your-domain.com"
echo ""
echo "   b) Self-signed (testing only):"
echo "      sudo mkdir -p /etc/nginx/ssl"
echo "      sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\"
echo "          -keyout /etc/nginx/ssl/private.key \\"
echo "          -out /etc/nginx/ssl/certificate.crt"
echo ""
echo "   c) Commercial certificate:"
echo "      Place your certificate and key files in /etc/nginx/ssl/"
echo "      Update paths in $NGINX_CONF"
echo ""
echo "4. Test and reload NGINX:"
echo "   sudo nginx -t"
echo "   sudo systemctl reload nginx"
echo ""
echo "5. Verify HTTPS is working:"
echo "   curl -I https://your-domain.com$NGINX_LOCATION_PATH"
echo "   (Should return 200 OK with Strict-Transport-Security header)"
echo ""
echo "The server block will be automatically loaded from /etc/nginx/conf.d/"
echo "All HTTP traffic will be automatically redirected to HTTPS."

echo ""
echo "Step 15: Creating example server block configuration..."
EXAMPLE_SERVER_BLOCK="$INSTALL_DIR/nginx-server-block-example.conf"
cat > "$EXAMPLE_SERVER_BLOCK" << EXAMPLE_EOF
# Example NGINX Server Block Configuration for Palo ChangeLogs
# 
# This is an example of how to configure a complete server block.
# Copy this to /etc/nginx/conf.d/your-domain.conf and customize as needed.

# First, make sure the upstream is included in your http block in /etc/nginx/nginx.conf:
# http {
#     include /etc/nginx/conf.d/palo-changelogs-upstream.conf;
#     ...
# }

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL Configuration
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    
    # Include Palo ChangeLogs locations (MUST be inside server block)
    include /etc/nginx/conf.d/palo-changelogs-locations.conf;
    
    # Other application locations can go here...
}
EXAMPLE_EOF
chown "$SERVICE_USER:$SERVICE_USER" "$EXAMPLE_SERVER_BLOCK"
echo "Example server block created at $EXAMPLE_SERVER_BLOCK"

echo ""
echo "Step 16: Testing NGINX configuration..."
if nginx -t 2>/dev/null; then
    echo "NGINX configuration test passed"
else
    echo "WARNING: NGINX configuration test failed."
    echo ""
    echo "Common causes:"
    echo "  1. Locations file included at http level (WRONG)"
    echo "  2. Locations file included outside any block (WRONG)"
    echo "  3. No server block exists yet"
    echo ""
    echo "Solution:"
    echo "  - The locations file MUST be included INSIDE a server block"
    echo "  - See example at: $EXAMPLE_SERVER_BLOCK"
    echo "  - After adding the include directive correctly, run: nginx -t"
    echo ""
    echo "To check where the file is being included, run:"
    echo "  grep -r 'palo-changelogs-locations.conf' /etc/nginx/"
fi

echo ""
echo "Step 17: Configuring firewall (if firewall-cmd is available)..."
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
echo "Step 18: Enabling and starting backend service..."
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
echo "Step 19: Creating update script..."
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

