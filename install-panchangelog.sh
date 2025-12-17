#!/bin/bash

################################################################################
# PaloChangeLogs Installation Script for Ubuntu
# This script will install all dependencies and set up the application
################################################################################

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if running on Ubuntu
if [ ! -f /etc/lsb-release ]; then
    print_error "This script is designed for Ubuntu. Exiting."
    exit 1
fi

print_status "Starting PaloChangeLogs installation on Ubuntu..."

# Update package list
print_status "Updating package list..."
sudo apt-get update

# Install required system packages
print_status "Installing required system packages..."
sudo apt-get install -y curl git build-essential

# Install Node.js and npm if not already installed
if ! command_exists node; then
    print_status "Node.js not found. Installing Node.js LTS..."
    
    # Install Node.js using NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    print_status "Node.js $(node --version) installed successfully"
    print_status "npm $(npm --version) installed successfully"
else
    print_status "Node.js $(node --version) is already installed"
    print_status "npm $(npm --version) is already installed"
fi

# Verify Node.js version (should be >= 18 for Vite)
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_warning "Node.js version is less than 18. Vite recommends Node.js 18 or higher."
    print_warning "Consider upgrading Node.js for best compatibility."
fi

# Clone the repository
REPO_DIR="PaloChangeLogs"
if [ -d "$REPO_DIR" ]; then
    print_warning "Directory '$REPO_DIR' already exists."
    read -p "Do you want to remove it and clone fresh? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Removing existing directory..."
        rm -rf "$REPO_DIR"
    else
        print_status "Using existing directory..."
        cd "$REPO_DIR"
        git pull origin main
    fi
fi

if [ ! -d "$REPO_DIR" ]; then
    print_status "Cloning repository from GitHub..."
    git clone https://github.com/gsk-panda/PaloChangeLogs.git
    cd "$REPO_DIR"
else
    cd "$REPO_DIR"
fi

# Install npm dependencies
print_status "Installing npm dependencies (this may take a few minutes)..."
npm install

# Set up environment variables
if [ ! -f .env.local ]; then
    print_status "Creating .env.local file..."
    cat > .env.local << EOF
GEMINI_API_KEY=your_gemini_api_key_here
EOF
    print_warning "Please edit .env.local and add your Gemini API key"
    print_warning "You can get an API key from: https://ai.google.dev/"
else
    print_status ".env.local already exists"
fi

# Create a systemd service file (optional, for production)
print_status "Would you like to create a systemd service to run the app as a service?"
read -p "Create systemd service? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    SERVICE_NAME="palochangelogs"
    SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
    
    print_status "Creating systemd service file..."
    sudo tee "$SERVICE_FILE" > /dev/null << EOF
[Unit]
Description=PaloChangeLogs Application
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=$(which npm) run dev
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    print_status "Systemd service created. You can manage it with:"
    print_status "  sudo systemctl start $SERVICE_NAME"
    print_status "  sudo systemctl stop $SERVICE_NAME"
    print_status "  sudo systemctl enable $SERVICE_NAME  # Auto-start on boot"
fi

# Create a helper script to run the app
print_status "Creating run script..."
cat > run.sh << 'EOF'
#!/bin/bash
npm run dev
EOF
chmod +x run.sh

# Print completion message
echo ""
echo "=========================================="
print_status "Installation completed successfully!"
echo "=========================================="
echo ""
print_status "Next steps:"
echo "  1. Edit .env.local and add your Gemini API key:"
echo "     cd $(pwd)"
echo "     nano .env.local"
echo ""
echo "  2. Start the development server:"
echo "     npm run dev"
echo "     OR"
echo "     ./run.sh"
echo ""
echo "  3. Open your browser and navigate to:"
echo "     http://localhost:5173"
echo ""
print_status "For production deployment, you can build the app with:"
echo "     npm run build"
echo ""
print_warning "Don't forget to set your GEMINI_API_KEY in .env.local before running!"
echo ""
