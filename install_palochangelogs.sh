#!/bin/bash

##############################################################################
# PaloChangeLogs Installation Script for RHEL 9.7
# This script installs and configures the PaloChangeLogs application
# Repository: https://github.com/gsk-panda/PaloChangeLogs
##############################################################################

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration variables
APP_NAME="PaloChangeLogs"
INSTALL_DIR="/opt/palochangelogs"
SERVICE_USER="palochangelogs"
GIT_REPO="https://github.com/gsk-panda/PaloChangeLogs.git"
NODE_VERSION="20"  # LTS version
PORT="5173"  # Default Vite dev server port

##############################################################################
# Helper Functions
##############################################################################

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

##############################################################################
# Installation Steps
##############################################################################

install_prerequisites() {
    print_status "Installing prerequisites..."
    
    # Update system
    dnf update -y
    
    # Install required packages
    dnf install -y \
        git \
        curl \
        wget \
        tar \
        gcc-c++ \
        make \
        firewalld
    
    print_success "Prerequisites installed"
}

install_nodejs() {
    print_status "Installing Node.js ${NODE_VERSION}..."
    
    # Check if Node.js is already installed
    if command -v node &> /dev/null; then
        CURRENT_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ "$CURRENT_VERSION" -ge "$NODE_VERSION" ]]; then
            print_warning "Node.js v${CURRENT_VERSION} is already installed"
            return 0
        fi
    fi
    
    # Install Node.js from NodeSource repository
    curl -fsSL https://rpm.nodesource.com/setup_${NODE_VERSION}.x | bash -
    dnf install -y nodejs
    
    # Verify installation
    node --version
    npm --version
    
    print_success "Node.js installed successfully"
}

create_service_user() {
    print_status "Creating service user..."
    
    if id "$SERVICE_USER" &>/dev/null; then
        print_warning "User $SERVICE_USER already exists"
    else
        useradd -r -m -d /home/$SERVICE_USER -s /bin/bash $SERVICE_USER
        print_success "User $SERVICE_USER created"
    fi
}

clone_repository() {
    print_status "Cloning repository..."
    
    # Create installation directory
    mkdir -p $INSTALL_DIR
    
    # Clone the repository
    if [[ -d "$INSTALL_DIR/.git" ]]; then
        print_warning "Repository already exists, pulling latest changes..."
        cd $INSTALL_DIR
        git pull
    else
        git clone $GIT_REPO $INSTALL_DIR
    fi
    
    # Set ownership
    chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR
    
    print_success "Repository cloned to $INSTALL_DIR"
}

install_dependencies() {
    print_status "Installing Node.js dependencies..."
    
    cd $INSTALL_DIR
    
    # Install dependencies as service user
    sudo -u $SERVICE_USER npm install
    
    print_success "Dependencies installed"
}

configure_environment() {
    print_status "Configuring environment..."
    
    # Create .env.local file if it doesn't exist
    if [[ ! -f "$INSTALL_DIR/.env.local" ]]; then
        cat > $INSTALL_DIR/.env.local << 'EOF'
# Gemini API Key (Required for AI features)
GEMINI_API_KEY=your_gemini_api_key_here

# Palo Alto Panorama Configuration
VITE_PANORAMA_URL=https://panorama.example.com
VITE_PANORAMA_API_KEY=your_panorama_api_key_here

# Application Port (optional, default 5173)
PORT=5173
EOF
        chown $SERVICE_USER:$SERVICE_USER $INSTALL_DIR/.env.local
        chmod 600 $INSTALL_DIR/.env.local
        
        print_warning "Created .env.local template at $INSTALL_DIR/.env.local"
        print_warning "Please edit this file and add your API keys!"
    else
        print_warning ".env.local already exists"
    fi
}

create_systemd_service() {
    print_status "Creating systemd service..."
    
    cat > /etc/systemd/system/palochangelogs.service << EOF
[Unit]
Description=PaloChangeLogs - Palo Alto Networks Change Log Viewer
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
Environment="NODE_ENV=production"
Environment="PORT=$PORT"
ExecStart=/usr/bin/npm run dev -- --host 0.0.0.0 --port $PORT
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=palochangelogs

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload
    
    print_success "Systemd service created"
}

configure_firewall() {
    print_status "Configuring firewall..."
    
    # Enable firewalld if not running
    systemctl enable --now firewalld
    
    # Add rule for application port
    firewall-cmd --permanent --add-port=$PORT/tcp
    firewall-cmd --reload
    
    print_success "Firewall configured (port $PORT opened)"
}

build_production() {
    print_status "Building production version (optional)..."
    
    read -p "Do you want to build for production? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd $INSTALL_DIR
        sudo -u $SERVICE_USER npm run build
        print_success "Production build completed"
    else
        print_warning "Skipping production build (will run in development mode)"
    fi
}

##############################################################################
# Main Installation Flow
##############################################################################

main() {
    echo "================================================================"
    echo "    PaloChangeLogs Installation for RHEL 9.7"
    echo "================================================================"
    echo
    
    check_root
    
    print_status "Starting installation..."
    
    install_prerequisites
    install_nodejs
    create_service_user
    clone_repository
    install_dependencies
    configure_environment
    create_systemd_service
    configure_firewall
    build_production
    
    echo
    echo "================================================================"
    print_success "Installation completed successfully!"
    echo "================================================================"
    echo
    echo "Next steps:"
    echo "  1. Edit the environment file:"
    echo "     sudo nano $INSTALL_DIR/.env.local"
    echo
    echo "  2. Add your API keys:"
    echo "     - GEMINI_API_KEY (for AI features)"
    echo "     - VITE_PANORAMA_URL (your Panorama server URL)"
    echo "     - VITE_PANORAMA_API_KEY (your Panorama API key)"
    echo
    echo "  3. Start the service:"
    echo "     sudo systemctl start palochangelogs"
    echo
    echo "  4. Enable auto-start on boot:"
    echo "     sudo systemctl enable palochangelogs"
    echo
    echo "  5. Check service status:"
    echo "     sudo systemctl status palochangelogs"
    echo
    echo "  6. View logs:"
    echo "     sudo journalctl -u palochangelogs -f"
    echo
    echo "  7. Access the application:"
    echo "     http://$(hostname -I | awk '{print $1}'):$PORT"
    echo
    echo "================================================================"
}

# Run main installation
main
