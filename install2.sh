#!/bin/bash

###############################################################################
# PaloChangeLogs Installation Script for RHEL 9.7
# Installs and configures PaloChangeLogs with NGINX reverse proxy
###############################################################################

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration variables
APP_NAME="PaloChangeLogs"
APP_DIR="/var/www/palochangelogs"
APP_USER="palochangelogs"
APP_PORT=5173
NGINX_DOMAIN="example.com"
NGINX_PATH="/changes"
PANORAMA_URL="panorama.example.com"
REPO_URL="https://github.com/your-org/PaloChangeLogs.git"
REPO_BRANCH="main"
NODE_VERSION="20"

###############################################################################
# Helper Functions
###############################################################################

print_status() {
    echo -e "${GREEN}[*]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root"
        exit 1
    fi
}

###############################################################################
# System Update and Prerequisites
###############################################################################

update_system() {
    print_status "Updating system packages..."
    dnf update -y
    dnf install -y epel-release
    dnf install -y git curl wget vim firewalld policycoreutils-python-utils
}

###############################################################################
# Node.js Installation
###############################################################################

install_nodejs() {
    print_status "Installing Node.js ${NODE_VERSION}..."
    
    # Install Node.js from NodeSource repository
    curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
    dnf install -y nodejs
    
    # Verify installation
    node --version
    npm --version
    
    # Install yarn globally
    npm install -g yarn
    yarn --version
}

###############################################################################
# NGINX Installation and Configuration
###############################################################################

install_nginx() {
    print_status "Installing NGINX..."
    dnf install -y nginx
    
    systemctl enable nginx
}

configure_nginx() {
    print_status "Configuring NGINX..."
    
    # Backup original config
    if [ -f /etc/nginx/nginx.conf ]; then
        cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup
    fi
    
    # Create NGINX configuration for the app
    cat > /etc/nginx/conf.d/palochangelogs.conf <<EOF
# PaloChangeLogs NGINX Configuration
upstream palochangelogs_backend {
    server 127.0.0.1:${APP_PORT};
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${NGINX_DOMAIN};

    # Redirect to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${NGINX_DOMAIN};

    # SSL Configuration - Update these paths with your actual certificates
    ssl_certificate /etc/pki/tls/certs/${NGINX_DOMAIN}.crt;
    ssl_certificate_key /etc/pki/tls/private/${NGINX_DOMAIN}.key;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Logs
    access_log /var/log/nginx/palochangelogs_access.log;
    error_log /var/log/nginx/palochangelogs_error.log;

    # Application location
    location ${NGINX_PATH} {
        proxy_pass http://palochangelogs_backend;
        proxy_http_version 1.1;
        
        # Proxy headers
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Rewrite path for the app
        rewrite ^${NGINX_PATH}(/.*)$ \$1 break;
    }

    # Static assets
    location ${NGINX_PATH}/assets/ {
        proxy_pass http://palochangelogs_backend/assets/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

    print_status "NGINX configuration created at /etc/nginx/conf.d/palochangelogs.conf"
}

###############################################################################
# Application User Setup
###############################################################################

create_app_user() {
    print_status "Creating application user ${APP_USER}..."
    
    if id "${APP_USER}" &>/dev/null; then
        print_warning "User ${APP_USER} already exists"
    else
        useradd -r -m -d /home/${APP_USER} -s /bin/bash ${APP_USER}
        print_status "User ${APP_USER} created"
    fi
}

###############################################################################
# Application Installation
###############################################################################

###############################################################################
# Check Mount Options
###############################################################################

check_mount_options() {
    print_status "Checking mount options..."
    
    # Get mount point for APP_DIR
    local mount_point=$(df "${APP_DIR}" 2>/dev/null | tail -1 | awk '{print $6}')
    
    if [ -z "$mount_point" ]; then
        mount_point=$(df /var 2>/dev/null | tail -1 | awk '{print $6}')
    fi
    
    # Check if noexec is set
    if mount | grep -E "^[^ ]+ on ${mount_point} " | grep -q noexec; then
        print_error "The filesystem ${mount_point} is mounted with 'noexec' option"
        print_error "This prevents execution of binaries in ${APP_DIR}"
        echo ""
        echo "To fix this, you need to:"
        echo "1. Edit /etc/fstab and remove 'noexec' from the mount options"
        echo "2. Remount the filesystem: mount -o remount ${mount_point}"
        echo ""
        read -p "Would you like to attempt to remount without noexec? (y/n): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            mount -o remount,exec ${mount_point}
            print_status "Filesystem remounted with exec permission"
        else
            print_error "Cannot continue without exec permission"
            exit 1
        fi
    fi
}

###############################################################################
# Application Installation
###############################################################################

install_application() {
    print_status "Installing ${APP_NAME}..."
    print_status "Installation directory: ${APP_DIR}"
    
    # Create application directory
    mkdir -p ${APP_DIR}
    
    # Clone repository
    print_status "Cloning repository from ${REPO_URL}..."
    if [ -d "${APP_DIR}/.git" ]; then
        print_warning "Repository already exists. Pulling latest changes..."
        cd ${APP_DIR}
        git pull origin ${REPO_BRANCH}
    else
        git clone -b ${REPO_BRANCH} ${REPO_URL} ${APP_DIR}
    fi
    
    cd ${APP_DIR}
    
    # Set ownership
    chown -R ${APP_USER}:${APP_USER} ${APP_DIR}
    
    # Install dependencies as app user with proper permissions
    print_status "Installing application dependencies..."
    
    # Step 1: Install packages without running install scripts to avoid permission issues
    print_status "Downloading npm packages (skipping install scripts)..."
    sudo -u ${APP_USER} npm install --ignore-scripts
    
    # Step 2: Set execute permissions on all binaries BEFORE running install scripts
    print_status "Setting executable permissions for node binaries..."
    find ${APP_DIR}/node_modules/.bin -type f -exec chmod +x {} \; 2>/dev/null || true
    find ${APP_DIR}/node_modules -name "*.node" -exec chmod +x {} \; 2>/dev/null || true
    
    # Critical: Set execute permission on esbuild binary before its install script runs
    if [ -f "${APP_DIR}/node_modules/esbuild/bin/esbuild" ]; then
        chmod +x ${APP_DIR}/node_modules/esbuild/bin/esbuild
        chown ${APP_USER}:${APP_USER} ${APP_DIR}/node_modules/esbuild/bin/esbuild
        print_status "esbuild binary permissions set"
    fi
    
    # Set permissions on all bin directories and binaries
    find ${APP_DIR}/node_modules -type d -name bin -exec chmod +x {} \; 2>/dev/null || true
    find ${APP_DIR}/node_modules -type f -path "*/bin/*" -exec chmod +x {} \; 2>/dev/null || true
    
    # Ensure ownership is correct
    chown -R ${APP_USER}:${APP_USER} ${APP_DIR}/node_modules
    
    # Step 3: Manually run esbuild install script now that binary has execute permission
    print_status "Running esbuild install script..."
    if [ -f "${APP_DIR}/node_modules/esbuild/install.js" ]; then
        sudo -u ${APP_USER} node ${APP_DIR}/node_modules/esbuild/install.js || true
    fi
    
    # Step 4: Rebuild native modules that need compilation
    print_status "Rebuilding native modules..."
    sudo -u ${APP_USER} npm rebuild || true
    
    # Final permission check and ownership
    print_status "Final permission verification..."
    find ${APP_DIR}/node_modules/esbuild/bin/esbuild -exec chmod +x {} \; 2>/dev/null || true
    find ${APP_DIR}/node_modules/.bin -type f -exec chmod +x {} \; 2>/dev/null || true
    chown -R ${APP_USER}:${APP_USER} ${APP_DIR}/node_modules
    
    print_status "Application installed successfully"
}

###############################################################################
# Environment Configuration
###############################################################################

configure_environment() {
    print_status "Configuring environment variables..."
    
    # Prompt for API key
    echo ""
    echo "================================================================================"
    echo "Panorama API Configuration"
    echo "================================================================================"
    echo ""
    read -p "Enter your Panorama API Key: " -s API_KEY
    echo ""
    
    if [ -z "$API_KEY" ]; then
        print_error "API Key cannot be empty"
        exit 1
    fi
    
    # Create .env.local file
    cat > ${APP_DIR}/.env.local <<EOF
# Panorama Configuration
VITE_PANORAMA_URL=https://${PANORAMA_URL}
VITE_API_KEY=${API_KEY}

# Application Configuration
VITE_BASE_PATH=${NGINX_PATH}
EOF

    # Set proper permissions
    chown ${APP_USER}:${APP_USER} ${APP_DIR}/.env.local
    chmod 600 ${APP_DIR}/.env.local
    
    print_status "Environment configuration completed"
}

###############################################################################
# Update Vite Configuration for Base Path
###############################################################################

update_vite_config() {
    print_status "Updating Vite configuration for base path..."
    
    # Check if vite.config.ts exists and update it
    if [ -f "${APP_DIR}/vite.config.ts" ]; then
        # Backup original
        cp ${APP_DIR}/vite.config.ts ${APP_DIR}/vite.config.ts.backup
        
        # Add base path configuration
        cat > ${APP_DIR}/vite.config.ts <<'EOF'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  preview: {
    host: '0.0.0.0',
    port: 5173
  }
})
EOF
        
        chown ${APP_USER}:${APP_USER} ${APP_DIR}/vite.config.ts
    fi
}

###############################################################################
# Build Application
###############################################################################

build_application() {
    print_status "Building application..."
    
    cd ${APP_DIR}
    sudo -u ${APP_USER} npm run build
    
    print_status "Application built successfully"
}

###############################################################################
# Systemd Service Configuration
###############################################################################

create_systemd_service() {
    print_status "Creating systemd service..."
    
    cat > /etc/systemd/system/palochangelogs.service <<EOF
[Unit]
Description=PaloChangeLogs Application
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment="NODE_ENV=production"
EnvironmentFile=${APP_DIR}/.env.local
ExecStart=/usr/bin/npm run preview -- --host 0.0.0.0 --port ${APP_PORT}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=palochangelogs

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload
    
    # Enable service
    systemctl enable palochangelogs.service
    
    print_status "Systemd service created and enabled"
}

###############################################################################
# Firewall Configuration
###############################################################################

configure_firewall() {
    print_status "Configuring firewall..."
    
    # Start and enable firewalld
    systemctl enable firewalld
    systemctl start firewalld
    
    # Allow HTTP and HTTPS
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    
    # Reload firewall
    firewall-cmd --reload
    
    print_status "Firewall configured successfully"
}

###############################################################################
# SELinux Configuration
###############################################################################

configure_selinux() {
    print_status "Configuring SELinux..."
    
    # Check if SELinux is enforcing
    if [ "$(getenforce)" = "Enforcing" ]; then
        # Allow NGINX to connect to network
        setsebool -P httpd_can_network_connect 1
        
        # Set proper contexts for the application directory
        print_status "Setting SELinux contexts for application files..."
        
        # Allow execution of node modules binaries
        semanage fcontext -a -t bin_t "${APP_DIR}/node_modules/.bin(/.*)?"
        semanage fcontext -a -t bin_t "${APP_DIR}/node_modules/esbuild/bin(/.*)?"
        semanage fcontext -a -t bin_t "${APP_DIR}/node_modules/*/bin(/.*)?"
        
        # Set httpd context for web-accessible content
        semanage fcontext -a -t httpd_sys_content_t "${APP_DIR}/dist(/.*)?"
        semanage fcontext -a -t httpd_sys_rw_content_t "${APP_DIR}(/.*)?"
        
        # Restore contexts
        restorecon -Rv ${APP_DIR}
        
        print_status "SELinux configured for NGINX and Node.js"
    else
        print_warning "SELinux is not enforcing. Skipping SELinux configuration."
    fi
}

###############################################################################
# SSL Certificate Setup (Self-signed for testing)
###############################################################################

setup_ssl_certificate() {
    print_status "Setting up SSL certificate..."
    
    echo ""
    read -p "Do you have SSL certificates ready? (y/n): " has_ssl
    
    if [[ "$has_ssl" =~ ^[Yy]$ ]]; then
        echo ""
        echo "Please place your SSL certificates in the following locations:"
        echo "  Certificate: /etc/pki/tls/certs/${NGINX_DOMAIN}.crt"
        echo "  Private Key: /etc/pki/tls/private/${NGINX_DOMAIN}.key"
        echo ""
        read -p "Press Enter after placing the certificates..."
    else
        print_warning "Creating self-signed certificate for testing..."
        
        mkdir -p /etc/pki/tls/certs /etc/pki/tls/private
        
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout /etc/pki/tls/private/${NGINX_DOMAIN}.key \
            -out /etc/pki/tls/certs/${NGINX_DOMAIN}.crt \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=${NGINX_DOMAIN}"
        
        chmod 600 /etc/pki/tls/private/${NGINX_DOMAIN}.key
        
        print_warning "Self-signed certificate created. Replace with proper certificate for production!"
    fi
}

###############################################################################
# Start Services
###############################################################################

start_services() {
    print_status "Starting services..."
    
    # Start application
    systemctl start palochangelogs.service
    
    # Wait a moment for the app to start
    sleep 3
    
    # Check application status
    if systemctl is-active --quiet palochangelogs.service; then
        print_status "Application service started successfully"
    else
        print_error "Application service failed to start"
        systemctl status palochangelogs.service
        exit 1
    fi
    
    # Start NGINX
    systemctl restart nginx
    
    if systemctl is-active --quiet nginx; then
        print_status "NGINX started successfully"
    else
        print_error "NGINX failed to start"
        systemctl status nginx
        exit 1
    fi
}

###############################################################################
# Health Check
###############################################################################

health_check() {
    print_status "Performing health check..."
    
    # Check if application is responding
    sleep 2
    if curl -f http://localhost:${APP_PORT} > /dev/null 2>&1; then
        print_status "Application is responding on port ${APP_PORT}"
    else
        print_warning "Application may not be responding yet. Check logs with: journalctl -u palochangelogs -f"
    fi
}

###############################################################################
# Display Summary
###############################################################################

display_summary() {
    echo ""
    echo "================================================================================"
    echo -e "${GREEN}Installation Complete!${NC}"
    echo "================================================================================"
    echo ""
    echo "Application Details:"
    echo "  - Application URL: https://${NGINX_DOMAIN}${NGINX_PATH}"
    echo "  - Application Directory: ${APP_DIR}"
    echo "  - Application User: ${APP_USER}"
    echo "  - Application Port: ${APP_PORT}"
    echo "  - Panorama URL: ${PANORAMA_URL}"
    echo ""
    echo "Useful Commands:"
    echo "  - Start application:   systemctl start palochangelogs"
    echo "  - Stop application:    systemctl stop palochangelogs"
    echo "  - Restart application: systemctl restart palochangelogs"
    echo "  - View logs:           journalctl -u palochangelogs -f"
    echo "  - Application status:  systemctl status palochangelogs"
    echo "  - NGINX status:        systemctl status nginx"
    echo ""
    echo "Configuration Files:"
    echo "  - Environment:         ${APP_DIR}/.env.local"
    echo "  - NGINX config:        /etc/nginx/conf.d/palochangelogs.conf"
    echo "  - Systemd service:     /etc/systemd/system/palochangelogs.service"
    echo ""
    echo "Next Steps:"
    echo "  1. Verify application is running: curl -k https://${NGINX_DOMAIN}${NGINX_PATH}"
    echo "  2. Check logs if there are issues: journalctl -u palochangelogs -f"
    echo "  3. Replace self-signed certificate with proper SSL certificate"
    echo "  4. Update firewall rules if needed for your network"
    echo ""
    echo "================================================================================"
}

###############################################################################
# Main Installation Flow
###############################################################################

main() {
    echo ""
    echo "================================================================================"
    echo "PaloChangeLogs Installation Script for RHEL 9.7"
    echo "================================================================================"
    echo ""
    
    # Check if running as root
    check_root
    
    # Confirm installation
    echo "This script will install:"
    echo "  - Node.js ${NODE_VERSION}"
    echo "  - NGINX web server"
    echo "  - PaloChangeLogs application"
    echo ""
    echo "Configuration:"
    echo "  - Panorama URL: ${PANORAMA_URL}"
    echo "  - Application URL: https://${NGINX_DOMAIN}${NGINX_PATH}"
    echo ""
    read -p "Do you want to continue? (y/n): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Installation cancelled"
        exit 0
    fi
    
    # Run installation steps
    update_system
    install_nodejs
    install_nginx
    create_app_user
    check_mount_options
    install_application
    configure_environment
    update_vite_config
    build_application
    configure_nginx
    setup_ssl_certificate
    create_systemd_service
    configure_firewall
    configure_selinux
    start_services
    health_check
    display_summary
    
    print_status "Installation completed successfully!"
}

# Run main function
main "$@"
