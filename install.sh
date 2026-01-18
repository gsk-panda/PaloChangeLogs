#!/bin/bash

set -e

GITHUB_REPO="https://github.com/your-org/PaloChangeLogs.git"
INSTALL_DIR="/opt/PaloChangeLogs"
OIDC_ENABLED="true"

while [[ $# -gt 0 ]]; do
    case $1 in
        --disable-oidc|--no-oidc)
            OIDC_ENABLED="false"
            shift
            ;;
        --enable-oidc)
            OIDC_ENABLED="true"
            shift
            ;;
        -h|--help)
            echo "PaloChangeLogs Installation Script"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --disable-oidc, --no-oidc    Disable OIDC authentication (allows anonymous access)"
            echo "  --enable-oidc                Enable OIDC authentication (default)"
            echo "  -h, --help                   Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  VITE_OIDC_ENABLED           Set to 'false' to disable OIDC (overrides --disable-oidc)"
            echo "  JFROG_REPO_URL              JFrog repository URL for Node.js installation"
            echo ""
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

if [ -n "$VITE_OIDC_ENABLED" ]; then
    OIDC_ENABLED="$VITE_OIDC_ENABLED"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/package.json" ] && [ -d "$SCRIPT_DIR/.git" ]; then
    PROJECT_DIR="$(cd "$SCRIPT_DIR" && pwd)"
    echo "Running from existing repository: $PROJECT_DIR"
else
    PROJECT_DIR="$INSTALL_DIR"
    echo "Standalone mode: Will clone repository from GitHub"
fi

APP_USER="palochangelogs"
APP_DIR="/var/www/palochangelogs"
APACHE_CONF="/etc/httpd/conf.d/palochangelogs.conf"

echo "=========================================="
echo "PaloChangeLogs Installation Script"
echo "=========================================="
echo ""

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root"
    exit 1
fi

echo "=========================================="
echo "Configuration"
echo "=========================================="
echo ""

read -p "Server URL or IP (e.g., example.com or 192.168.1.100): " SERVER_URL
SERVER_URL=${SERVER_URL:-example.com}

read -p "Panorama IP or URL (e.g., panorama.example.com or 192.168.1.10): " PANORAMA_URL
PANORAMA_URL=${PANORAMA_URL:-panorama.example.com}

if [[ ! "$PANORAMA_URL" =~ ^https?:// ]]; then
    PANORAMA_URL="https://$PANORAMA_URL"
fi

PANORAMA_HOST=$(echo "$PANORAMA_URL" | sed 's|https\?://||' | sed 's|/.*||')

read -p "Panorama API Key: " PANORAMA_API_KEY
if [ -z "$PANORAMA_API_KEY" ]; then
    echo "Warning: API Key is required for the application to function"
    read -p "Panorama API Key (required): " PANORAMA_API_KEY
    if [ -z "$PANORAMA_API_KEY" ]; then
        echo "Error: API Key cannot be empty"
        exit 1
    fi
fi

read -p "Gemini API Key (for AI analysis features, press Enter to skip): " GEMINI_API_KEY

AZURE_CLIENT_ID=""
AZURE_AUTHORITY=""
AZURE_REDIRECT_URI=""

if [ "$OIDC_ENABLED" != "false" ] && [ "$OIDC_ENABLED" != "0" ]; then
    echo ""
    echo "Azure OIDC Configuration (REQUIRED for this application):"
    echo ""
    read -p "Azure Client ID (VITE_AZURE_CLIENT_ID): " AZURE_CLIENT_ID
    read -p "Azure Authority (e.g., https://login.microsoftonline.com/tenant-id): " AZURE_AUTHORITY
    
    if [ -z "$AZURE_CLIENT_ID" ] || [ -z "$AZURE_AUTHORITY" ]; then
        echo ""
        echo "Error: Azure OIDC configuration is REQUIRED for this application."
        echo "Please provide both Azure Client ID and Authority."
        exit 1
    fi
    
    read -p "Azure Redirect URI (default: https://$SERVER_URL/changes): " AZURE_REDIRECT_URI
    AZURE_REDIRECT_URI=${AZURE_REDIRECT_URI:-https://$SERVER_URL/changes}
    echo ""
    echo "OIDC will be enabled with:"
    echo "  Client ID: ${AZURE_CLIENT_ID:0:20}... (hidden)"
    echo "  Authority: $AZURE_AUTHORITY"
    echo "  Redirect URI: $AZURE_REDIRECT_URI"
else
    echo ""
    echo "Warning: OIDC authentication is disabled - this application requires OIDC authentication"
    echo "Please use --enable-oidc or ensure VITE_OIDC_ENABLED is not set to 'false'"
fi

echo ""
echo "Node.js Installation Method:"
echo "  1) JFrog Repository (recommended if NodeSource is blocked)"
echo "  2) NodeSource (default, may be blocked by proxy)"
read -p "Choose method [1-2] (default: 1): " NODE_INSTALL_METHOD
NODE_INSTALL_METHOD=${NODE_INSTALL_METHOD:-1}

JFROG_REPO_URL=""
if [ "$NODE_INSTALL_METHOD" = "1" ]; then
    read -p "JFrog Repository URL (default: https://jfrog.example.com/artifactory/repo/rhel/rocky9.repo): " JFROG_REPO_URL
    JFROG_REPO_URL=${JFROG_REPO_URL:-https://jfrog.example.com/artifactory/repo/rhel/rocky9.repo}
fi

echo ""
echo "=========================================="
echo "Starting Installation"
echo "=========================================="
echo ""

NEXT_STEP=1

echo "Step $NEXT_STEP: Preparing system..."
NEXT_STEP=$((NEXT_STEP + 1))

if [ "$NODE_INSTALL_METHOD" = "1" ] && [ -n "$JFROG_REPO_URL" ]; then
    echo "Disabling NodeSource repositories to prevent proxy conflicts..."
    for repo_file in /etc/yum.repos.d/nodesource*.repo; do
        if [ -f "$repo_file" ]; then
            sed -i 's/^enabled=1/enabled=0/' "$repo_file" 2>/dev/null || true
            echo "Disabled: $repo_file"
        fi
    done
fi

echo "Cleaning DNF cache..."
dnf clean all >/dev/null 2>&1 || true

echo "Resolving OpenSSL FIPS provider conflict..."
if rpm -q openssl-fips-provider-so >/dev/null 2>&1; then
    echo "Detected OpenSSL FIPS provider conflict, attempting to resolve..."
    dnf clean all >/dev/null 2>&1 || true
    dnf makecache -y >/dev/null 2>&1 || true
    
    dnf upgrade -y openssl* --allowerasing --best >/dev/null 2>&1 || {
        echo "Attempting to upgrade systemd and OpenSSL together..."
        dnf upgrade -y systemd openssl* --allowerasing --best >/dev/null 2>&1 || {
            echo "Warning: OpenSSL conflict may persist, continuing..."
        }
    }
fi

echo "Updating system packages..."
if [ "$NODE_INSTALL_METHOD" = "1" ] && [ -n "$JFROG_REPO_URL" ]; then
    dnf update -y --disablerepo=nodesource* --allowerasing --best >/dev/null 2>&1 || {
        dnf update -y --disablerepo=nodesource* --allowerasing >/dev/null 2>&1 || {
            dnf update -y --disablerepo=nodesource* >/dev/null 2>&1 || dnf update -y
        }
    }
else
    dnf update -y --allowerasing --best >/dev/null 2>&1 || {
        dnf update -y --allowerasing >/dev/null 2>&1 || dnf update -y
    }
fi

if [ ! -f "$SCRIPT_DIR/package.json" ] || [ ! -d "$SCRIPT_DIR/.git" ]; then
    echo ""
    echo "Step $NEXT_STEP: Downloading repository from GitHub..."
    NEXT_STEP=$((NEXT_STEP + 1))
    
    if ! command -v git &> /dev/null; then
        echo "Installing Git..."
        dnf install -y git
    fi
    
    if [ -d "$INSTALL_DIR" ]; then
        echo "Directory $INSTALL_DIR already exists. Removing old installation..."
        rm -rf "$INSTALL_DIR"
    fi
    
    echo "Cloning repository from $GITHUB_REPO..."
    git clone "$GITHUB_REPO" "$INSTALL_DIR"
    
    if [ ! -d "$INSTALL_DIR" ] || [ ! -f "$INSTALL_DIR/package.json" ]; then
        echo "Error: Failed to clone repository or repository is invalid"
        exit 1
    fi
    
    echo "Repository cloned successfully to $INSTALL_DIR"
    PROJECT_DIR="$INSTALL_DIR"
else
    NEXT_STEP=$((NEXT_STEP + 1))
fi

echo ""
echo "Step $NEXT_STEP: Installing Node.js..."
NEXT_STEP=$((NEXT_STEP + 1))

if command -v node &> /dev/null; then
    CURRENT_NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    echo "Current Node.js version: $(node -v)"
    if [ "$CURRENT_NODE_VERSION" -lt "18" ]; then
        echo "Removing old Node.js version..."
        dnf remove -y nodejs npm 2>/dev/null || true
        rm -f /usr/bin/node /usr/bin/npm /usr/local/bin/node /usr/local/bin/npm 2>/dev/null || true
    else
        echo "Node.js 18+ already installed, skipping installation"
    fi
fi

if ! command -v node &> /dev/null || [ "$CURRENT_NODE_VERSION" -lt "18" ]; then
    if [ "$NODE_INSTALL_METHOD" = "1" ] && [ -n "$JFROG_REPO_URL" ]; then
        echo "Installing Node.js from JFrog repository..."
        echo "JFrog Repository URL: $JFROG_REPO_URL"
        
        REPO_FILE_NAME=$(basename "$JFROG_REPO_URL")
        REPO_FILE_PATH="/etc/yum.repos.d/${REPO_FILE_NAME}"
        
        echo "Downloading repository file from JFrog..."
        if curl -f -s -o "$REPO_FILE_PATH" "$JFROG_REPO_URL" 2>/dev/null; then
            if [ -f "$REPO_FILE_PATH" ] && [ -s "$REPO_FILE_PATH" ]; then
                echo "✓ Repository file downloaded: $REPO_FILE_PATH"
                
                echo "Refreshing DNF cache..."
                dnf makecache -y >/dev/null 2>&1 || true
                
                echo "Installing Node.js from JFrog repository..."
                dnf install -y nodejs npm || {
                    echo "Error: Failed to install Node.js from JFrog repository"
                    exit 1
                }
            else
                echo "Error: Downloaded repository file is empty or invalid"
                rm -f "$REPO_FILE_PATH"
                exit 1
            fi
        else
            echo "Error: Could not download repository file from JFrog"
            exit 1
        fi
    else
        echo "Installing Node.js from NodeSource..."
        if curl -fsSL https://rpm.nodesource.com/setup_lts.x | bash -; then
            echo "✓ NodeSource repository added"
            dnf install -y nodejs
        else
            echo "Error: Failed to add NodeSource repository"
            echo "This may be due to proxy/firewall restrictions"
            echo "Consider using JFrog repository method (option 1) instead"
            exit 1
        fi
    fi
fi

INSTALLED_NODE_VERSION=$(node -v)
INSTALLED_NODE_MAJOR=$(echo "$INSTALLED_NODE_VERSION" | cut -d'v' -f2 | cut -d'.' -f1)
echo "Installed Node.js version: $INSTALLED_NODE_VERSION"

if [ "$INSTALLED_NODE_MAJOR" -lt "18" ]; then
    echo "Error: Node.js 18+ is required for Vite 5. Current version: $INSTALLED_NODE_VERSION"
    exit 1
fi

echo ""
echo "Step $NEXT_STEP: Installing Apache..."
NEXT_STEP=$((NEXT_STEP + 1))

if ! command -v httpd &> /dev/null; then
    dnf install -y httpd mod_ssl
else
    echo "Apache already installed, ensuring latest version and mod_ssl..."
    dnf install -y httpd mod_ssl
fi

echo "✓ Apache installed (modules are included and will be enabled via configuration)"

APACHE_VERSION=$(httpd -v 2>&1 | head -1 | cut -d'/' -f2 | awk '{print $1}')
echo "Installed Apache version: $APACHE_VERSION"

echo ""
echo "Step $NEXT_STEP: Installing Firewalld..."
NEXT_STEP=$((NEXT_STEP + 1))

if ! systemctl is-active --quiet firewalld 2>/dev/null; then
    dnf install -y firewalld
    systemctl enable firewalld
    systemctl start firewalld
fi

echo ""
echo "Step $NEXT_STEP: Creating application user..."
NEXT_STEP=$((NEXT_STEP + 1))

if ! id "$APP_USER" &>/dev/null; then
    useradd -r -s /bin/false -d "$APP_DIR" "$APP_USER"
    echo "Created user: $APP_USER"
else
    echo "User $APP_USER already exists"
fi

echo ""
echo "Step $NEXT_STEP: Creating application directory..."
NEXT_STEP=$((NEXT_STEP + 1))

mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo ""
echo "Step $NEXT_STEP: Storing API keys securely..."
NEXT_STEP=$((NEXT_STEP + 1))

mkdir -p /etc/palochangelogs
printf '%s' "$PANORAMA_API_KEY" > /etc/palochangelogs/panorama-api-key
chmod 640 /etc/palochangelogs/panorama-api-key
chown root:palochangelogs /etc/palochangelogs/panorama-api-key
echo "✓ Panorama API key stored securely in /etc/palochangelogs/panorama-api-key"

if [ -n "$GEMINI_API_KEY" ]; then
    printf '%s' "$GEMINI_API_KEY" > /etc/palochangelogs/gemini-api-key
    chmod 640 /etc/palochangelogs/gemini-api-key
    chown root:palochangelogs /etc/palochangelogs/gemini-api-key
    echo "✓ Gemini API key stored securely in /etc/palochangelogs/gemini-api-key"
fi

echo "PANORAMA_URL=$PANORAMA_URL" > /etc/palochangelogs/panorama-config
chmod 644 /etc/palochangelogs/panorama-config
chown root:palochangelogs /etc/palochangelogs/panorama-config

echo ""
echo "Step $NEXT_STEP: Installing Node.js dependencies..."
NEXT_STEP=$((NEXT_STEP + 1))

cd "$PROJECT_DIR"
npm install --production=false

echo ""
echo "Step $NEXT_STEP: Building application..."
NEXT_STEP=$((NEXT_STEP + 1))

export NODE_OPTIONS="--openssl-legacy-provider"

cat > "$PROJECT_DIR/.env" <<EOF
VITE_PANORAMA_SERVER=$PANORAMA_URL
VITE_OIDC_ENABLED=$OIDC_ENABLED
EOF

if [ "$OIDC_ENABLED" != "false" ] && [ "$OIDC_ENABLED" != "0" ] && [ -n "$AZURE_CLIENT_ID" ]; then
    cat >> "$PROJECT_DIR/.env" <<EOF
VITE_AZURE_CLIENT_ID=$AZURE_CLIENT_ID
VITE_AZURE_AUTHORITY=$AZURE_AUTHORITY
VITE_AZURE_REDIRECT_URI=$AZURE_REDIRECT_URI
EOF
fi

if [ "$OIDC_ENABLED" = "false" ] || [ "$OIDC_ENABLED" = "0" ]; then
    echo "Building with OIDC disabled..."
    export VITE_OIDC_ENABLED=false
else
    echo "Building with OIDC enabled..."
    export VITE_OIDC_ENABLED=true
    if [ -n "$AZURE_CLIENT_ID" ]; then
        export VITE_AZURE_CLIENT_ID="$AZURE_CLIENT_ID"
        export VITE_AZURE_AUTHORITY="$AZURE_AUTHORITY"
        export VITE_AZURE_REDIRECT_URI="$AZURE_REDIRECT_URI"
    fi
fi

export VITE_PANORAMA_SERVER="$PANORAMA_URL"
npm run build -- --base=/changes/

if [ ! -d "$PROJECT_DIR/dist" ]; then
    echo "Error: Build failed - dist directory not found"
    exit 1
fi

echo "✓ Build completed successfully"

echo ""
echo "Step $NEXT_STEP: Deploying application files..."
NEXT_STEP=$((NEXT_STEP + 1))

rsync -av --delete "$PROJECT_DIR/dist/" "$APP_DIR/"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
echo "✓ Files deployed to $APP_DIR"

echo ""
echo "Step $NEXT_STEP: Configuring API proxy service..."
NEXT_STEP=$((NEXT_STEP + 1))

mkdir -p "$PROJECT_DIR/deploy"

cat > "$PROJECT_DIR/deploy/api-proxy.js" <<'PROXY_EOF'
import http from 'http';
import https from 'https';
import fs from 'fs';
import { parse as parseUrl } from 'url';
import sqlite3 from 'sqlite3';
import path from 'path';

const sqlite3Module = sqlite3.verbose();

let PANORAMA_API_KEY;
try {
    PANORAMA_API_KEY = fs.readFileSync('/etc/palochangelogs/panorama-api-key', 'utf8').trim();
    if (!PANORAMA_API_KEY) {
        console.error('ERROR: Panorama API key is empty!');
        process.exit(1);
    }
    const keyPreview = PANORAMA_API_KEY.length > 10 
        ? `${PANORAMA_API_KEY.substring(0, 10)}...${PANORAMA_API_KEY.substring(PANORAMA_API_KEY.length - 10)}`
        : '***';
    console.log(`Panorama API key loaded successfully (${PANORAMA_API_KEY.length} chars, preview: ${keyPreview})`);
} catch (err) {
    console.error('ERROR: Failed to read Panorama API key:', err.message);
    process.exit(1);
}

const PANORAMA_CONFIG = fs.readFileSync('/etc/palochangelogs/panorama-config', 'utf8');
const PANORAMA_URL = PANORAMA_CONFIG.split('=')[1].trim();
const PANORAMA_HOST = parseUrl(PANORAMA_URL).hostname;
const PANORAMA_PORT = parseUrl(PANORAMA_URL).port || (parseUrl(PANORAMA_URL).protocol === 'https:' ? 443 : 80);
const USE_HTTPS = parseUrl(PANORAMA_URL).protocol === 'https:';

const PORT = 3002;
const DB_PATH = path.join('__PROJECT_DIR__', 'data', 'palochangelogs.db');

let db = null;

const initDatabase = () => {
    if (db) return db;
    
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    
    const Database = sqlite3Module.Database;
    db = new Database(DB_PATH, (err) => {
        if (err) {
            console.error('Error opening database:', err);
            return;
        }
        
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS change_logs (
                seqno TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                admin TEXT,
                device_group TEXT,
                type TEXT,
                action TEXT,
                description TEXT,
                status TEXT,
                diff_before TEXT,
                diff_after TEXT,
                log_date TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`);
            
            db.run(`CREATE INDEX IF NOT EXISTS idx_log_date ON change_logs(log_date)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON change_logs(timestamp)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_description ON change_logs(description)`);
        });
    });
    
    return db;
};

const ensureDatabaseReady = (callback) => {
    if (!db) {
        initDatabase();
    }
    
    if (db) {
        db.get('SELECT 1', (err) => {
            if (err && err.message.includes('SQLITE_MISUSE')) {
                setTimeout(() => ensureDatabaseReady(callback), 100);
            } else {
                callback();
            }
        });
    } else {
        setTimeout(() => ensureDatabaseReady(callback), 100);
    }
};

const handleDatabaseSearch = (req, res, query) => {
    ensureDatabaseReady(() => {
        if (!db) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Database not initialized' }));
            return;
        }
        
        const startDate = query.startDate || null;
        const endDate = query.endDate || null;
        const searchTerm = query.query || '';
        
        console.log('[DB Search] Search request:', {
            searchTerm: searchTerm,
            startDate: startDate,
            endDate: endDate,
            searchTermLength: searchTerm.length
        });
        
        if (!searchTerm) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required parameter: query' }));
            return;
        }
        
        const escapedTerm = searchTerm.toLowerCase().replace(/[%_\\]/g, '\\$&');
        const term = `%${escapedTerm}%`;
        console.log('[DB Search] Original search term:', searchTerm);
        console.log('[DB Search] Escaped search term:', escapedTerm);
        console.log('[DB Search] Search pattern:', term);
        
        let sqlQuery = `SELECT * FROM change_logs 
         WHERE (
             LOWER(description) LIKE ? ESCAPE '\\' OR
             LOWER(admin) LIKE ? ESCAPE '\\' OR
             LOWER(action) LIKE ? ESCAPE '\\' OR
             LOWER(type) LIKE ? ESCAPE '\\' OR
             LOWER(seqno) LIKE ? ESCAPE '\\' OR
             LOWER(diff_before) LIKE ? ESCAPE '\\' OR
             LOWER(diff_after) LIKE ? ESCAPE '\\'
         )`;
        
        const params = [term, term, term, term, term, term, term];
        
        if (startDate) {
            sqlQuery += ` AND log_date >= ?`;
            params.push(startDate);
        }
        if (endDate) {
            sqlQuery += ` AND log_date <= ?`;
            params.push(endDate);
        }
        
        sqlQuery += ` ORDER BY timestamp DESC`;
        
        console.log('[DB Search] Executing SQL query:', sqlQuery.substring(0, 200) + '...');
        console.log('[DB Search] Query parameters:', params.map((p, i) => i < 7 ? (p.length > 50 ? p.substring(0, 50) + '...' : p) : p));
        
        db.all(sqlQuery, params,
        (err, rows) => {
            if (err) {
                console.error('[DB Search] Database search error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
            }
            
            console.log(`[DB Search] Query returned ${rows.length} rows`);
            if (rows.length > 0 && rows.length <= 5) {
                console.log('[DB Search] Sample rows:', rows.map(r => ({
                    seqno: r.seqno,
                    log_date: r.log_date,
                    description: r.description?.substring(0, 50),
                    diff_after_length: r.diff_after?.length || 0,
                    diff_before_length: r.diff_before?.length || 0,
                    diff_after_preview: r.diff_after ? r.diff_after.substring(0, 200) : null,
                    contains_search_term: r.diff_after?.toLowerCase().includes(searchTerm.toLowerCase()) || r.diff_before?.toLowerCase().includes(searchTerm.toLowerCase())
                })));
            } else if (rows.length === 0) {
                console.log('[DB Search] No rows found. Testing direct query...');
                db.get(`SELECT COUNT(*) as count FROM change_logs WHERE LOWER(diff_after) LIKE ? LIMIT 1`, [`%${searchTerm.toLowerCase()}%`], (err, row) => {
                    if (!err && row) {
                        console.log(`[DB Search] Direct diff_after search found ${row.count} rows`);
                    }
                });
                db.get(`SELECT COUNT(*) as count FROM change_logs WHERE LOWER(diff_before) LIKE ? LIMIT 1`, [`%${searchTerm.toLowerCase()}%`], (err, row) => {
                    if (!err && row) {
                        console.log(`[DB Search] Direct diff_before search found ${row.count} rows`);
                    }
                });
            }
            
            const logs = rows.map(row => ({
                id: `log-${row.seqno}-${Date.now()}`,
                seqno: row.seqno,
                timestamp: row.timestamp,
                admin: row.admin,
                deviceGroup: row.device_group || 'Global',
                type: row.type,
                action: row.action,
                description: row.description,
                status: row.status,
                diffBefore: row.diff_before || 'No previous configuration state.',
                diffAfter: row.diff_after || 'No new configuration state.',
            }));
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ logs }));
        }
    );
    });
};

const handleDatabaseLogs = (req, res, query) => {
    console.log('[DB Logs] Request received, query params:', JSON.stringify(query));
    ensureDatabaseReady(() => {
        if (!db) {
            console.error('[DB Logs] Database not initialized');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Database not initialized' }));
            return;
        }
        
        const startDate = query.startDate || '';
        const endDate = query.endDate || '';
        
        console.log(`[DB Logs] Parsed dates: startDate=${startDate}, endDate=${endDate}`);
        
        if (!startDate || !endDate) {
            console.error(`[DB Logs] Missing parameters: startDate=${startDate}, endDate=${endDate}`);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required parameters: startDate and endDate are required' }));
            return;
        }
        
        console.log(`[DB Logs] Querying database for date range: ${startDate} to ${endDate}`);
        
        db.all(
        `SELECT * FROM change_logs 
         WHERE log_date >= ? AND log_date <= ? 
         ORDER BY timestamp DESC`,
        [startDate, endDate],
        (err, rows) => {
            if (err) {
                console.error('[DB Logs] Database query error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
            }
            
            console.log(`[DB Logs] Found ${rows.length} rows in database for date range ${startDate} to ${endDate}`);
            if (rows.length > 0) {
                console.log(`[DB Logs] Sample log_date values: ${rows.slice(0, 3).map(r => r.log_date).join(', ')}`);
            }
            
            const logs = rows.map(row => ({
                id: `log-${row.seqno}-${Date.now()}`,
                seqno: row.seqno,
                timestamp: row.timestamp,
                admin: row.admin,
                deviceGroup: row.device_group || 'Global',
                type: row.type,
                action: row.action,
                description: row.description,
                status: row.status,
                diffBefore: row.diff_before || 'No previous configuration state.',
                diffAfter: row.diff_after || 'No new configuration state.',
            }));
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ logs }));
        }
    );
    });
};

const handleDatabaseStats = (req, res) => {
    ensureDatabaseReady(() => {
        if (!db) {
            console.error('[Stats] Database not initialized');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Database not initialized', totalRows: 0, dateRange: null }));
            return;
        }
        
        console.log('[Stats] Querying database for stats...');
        db.get('SELECT COUNT(*) as count, MIN(log_date) as min_date, MAX(log_date) as max_date FROM change_logs', (err, row) => {
            if (err) {
                console.error('[Stats] Database query error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message, totalRows: 0, dateRange: null }));
                return;
            }
            
            const totalRows = row ? (row.count || 0) : 0;
            const dateRange = row && row.min_date && row.max_date ? {
                min: row.min_date,
                max: row.max_date
            } : null;
            
            console.log(`[Stats] Found ${totalRows} rows in database, date range: ${dateRange ? `${dateRange.min} to ${dateRange.max}` : 'N/A'}`);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                totalRows: totalRows,
                dateRange: dateRange
            }));
        });
    });
};

const server = http.createServer((req, res) => {
    const parsedUrl = parseUrl(req.url, true);
    const pathname = parsedUrl.pathname || '';
    
    console.log(`[Proxy] Incoming request: ${req.method} ${pathname}${parsedUrl.search || ''}`);
    
    if (pathname === '/panorama-proxy/api/db/search' || pathname.endsWith('/api/db/search')) {
        console.log('[Proxy] Routing to database search handler');
        handleDatabaseSearch(req, res, parsedUrl.query);
        return;
    }
    
    if (pathname === '/panorama-proxy/api/db/logs' || pathname.endsWith('/api/db/logs')) {
        console.log('[Proxy] Routing to database logs handler');
        handleDatabaseLogs(req, res, parsedUrl.query);
        return;
    }
    
    if (pathname === '/panorama-proxy/api/db/stats' || pathname.endsWith('/api/db/stats')) {
        console.log('[Proxy] Routing to database stats handler');
        handleDatabaseStats(req, res);
        return;
    }
    
    if (pathname.startsWith('/panorama-proxy') || pathname.startsWith('/api/')) {
        console.log('[Proxy] Routing to Panorama API');
        let panoramaPath = pathname.replace('/panorama-proxy', '');
        
        if (!panoramaPath.startsWith('/api/')) {
            panoramaPath = '/api/' + panoramaPath.replace(/^\//, '');
        }
        
        let queryString = parsedUrl.search || '';
        if (!queryString) {
            queryString = '?';
        } else if (!queryString.startsWith('?')) {
            queryString = '?' + queryString;
        }
        
        const queryWithoutKey = queryString.replace(/[?&]key=[^&]*/g, '').replace(/^(\?|&)/, '?');
        const separator = queryWithoutKey === '?' ? '' : '&';
        queryString = queryWithoutKey + separator + 'key=' + encodeURIComponent(PANORAMA_API_KEY);
        
        panoramaPath = panoramaPath + queryString;
        
        console.log(`[Proxy] Forwarding to Panorama: ${panoramaPath.substring(0, 150)}...`);
        console.log(`[Proxy] API key present: ${queryString.includes('key=')}`);
        
        const options = {
            hostname: PANORAMA_HOST,
            port: PANORAMA_PORT,
            path: panoramaPath,
            method: req.method,
            headers: {
                ...req.headers,
                'host': PANORAMA_HOST,
            },
            rejectUnauthorized: false
        };

        const client = USE_HTTPS ? https : http;
        
        const proxyReq = client.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('Proxy error:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Proxy error: ' + err.message);
        });

        req.pipe(proxyReq);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`Panorama API proxy server running on port ${PORT}`);
    initDatabase();
});

process.on('SIGTERM', () => {
    if (db) {
        db.close();
    }
    server.close(() => {
        process.exit(0);
    });
});
PROXY_EOF

sed -i "s|__PROJECT_DIR__|$PROJECT_DIR|g" "$PROJECT_DIR/deploy/api-proxy.js"

chmod 644 "$PROJECT_DIR/deploy/api-proxy.js"
chown palochangelogs:palochangelogs "$PROJECT_DIR/deploy/api-proxy.js"
chown -R palochangelogs:palochangelogs "$PROJECT_DIR/deploy"

if command -v getenforce &>/dev/null && [ "$(getenforce)" != "Disabled" ]; then
    chcon -t bin_t "$PROJECT_DIR/deploy/api-proxy.js" 2>/dev/null || true
fi

cat > "$PROJECT_DIR/deploy/api-proxy.service" <<EOF
[Unit]
Description=PaloChangeLogs Panorama API Proxy Service
After=network.target

[Service]
Type=simple
User=palochangelogs
WorkingDirectory=$PROJECT_DIR/deploy
ExecStart=/usr/bin/node $PROJECT_DIR/deploy/api-proxy.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

cp "$PROJECT_DIR/deploy/api-proxy.service" /etc/systemd/system/palochangelogs-api-proxy.service

systemctl daemon-reload
systemctl enable palochangelogs-api-proxy
systemctl start palochangelogs-api-proxy

sleep 2
if systemctl is-active --quiet palochangelogs-api-proxy; then
    echo "✓ API proxy service is running"
else
    echo "⚠ Warning: API proxy service failed to start. Check logs: journalctl -u palochangelogs-api-proxy"
fi

echo ""
echo "Step $NEXT_STEP: Configuring daily log sync service..."
NEXT_STEP=$((NEXT_STEP + 1))

mkdir -p "$PROJECT_DIR/data"
chown -R palochangelogs:palochangelogs "$PROJECT_DIR/data"

chmod +x "$PROJECT_DIR/deploy/sync-daily-logs.js"
chown palochangelogs:palochangelogs "$PROJECT_DIR/deploy/sync-daily-logs.js"

if [ -f "$PROJECT_DIR/deploy/prepopulate-database.js" ]; then
    chmod +x "$PROJECT_DIR/deploy/prepopulate-database.js"
    chmod 644 "$PROJECT_DIR/deploy/prepopulate-database.js"
    chown palochangelogs:palochangelogs "$PROJECT_DIR/deploy/prepopulate-database.js"
    echo "✓ Prepopulation script permissions configured"
fi

cp "$PROJECT_DIR/deploy/sync-daily-logs.service" /etc/systemd/system/palochangelogs-sync.service
cp "$PROJECT_DIR/deploy/sync-daily-logs.timer" /etc/systemd/system/palochangelogs-sync.timer

systemctl daemon-reload
systemctl enable palochangelogs-sync.service
systemctl enable palochangelogs-sync.timer
systemctl start palochangelogs-sync.timer

sleep 2
if systemctl is-active --quiet palochangelogs-sync.timer; then
    echo "✓ Daily log sync timer is enabled and running"
    echo "  Next sync: $(systemctl list-timers palochangelogs-sync.timer --no-pager 2>/dev/null | grep palochangelogs-sync | awk '{print $1, $2, $3, $4}' || echo 'N/A')"
else
    echo "⚠ Warning: Daily log sync timer failed to start. Check logs: journalctl -u palochangelogs-sync.timer"
    echo "  Service status: systemctl status palochangelogs-sync.service"
fi

echo ""
echo "Step $NEXT_STEP: Configuring Apache..."
NEXT_STEP=$((NEXT_STEP + 1))

systemctl stop httpd 2>/dev/null || true
pkill -9 httpd 2>/dev/null || true
sleep 2

APACHE_CONF_DIR="/etc/httpd/conf.d"
APACHE_BACKUP_DIR="/etc/httpd/conf.d/backups"
mkdir -p "$APACHE_BACKUP_DIR"

if [ -f "$APACHE_CONF" ]; then
    BACKUP_FILE="${APACHE_BACKUP_DIR}/palochangelogs.conf.backup.$(date +%Y%m%d_%H%M%S)"
    cp "$APACHE_CONF" "$BACKUP_FILE"
    echo "✓ Backed up old configuration to: $BACKUP_FILE"
    rm -f "$APACHE_CONF"
    echo "✓ Removed old configuration: $APACHE_CONF"
fi

for old_conf in "$APACHE_CONF_DIR"/palochangelogs*.conf "$APACHE_CONF_DIR"/*palochangelogs*.conf; do
    if [ -f "$old_conf" ] && [ "$old_conf" != "$APACHE_CONF" ]; then
        BACKUP_FILE="${APACHE_BACKUP_DIR}/$(basename "$old_conf").backup.$(date +%Y%m%d_%H%M%S)"
        cp "$old_conf" "$BACKUP_FILE"
        echo "✓ Backed up old configuration to: $BACKUP_FILE"
        rm -f "$old_conf"
        echo "✓ Removed old configuration: $old_conf"
    fi
done

cat > "$APACHE_CONF" <<EOF
<VirtualHost *:80>
    ServerName $SERVER_URL
    Redirect permanent /changes https://$SERVER_URL/changes
</VirtualHost>

<VirtualHost *:443>
    ServerName $SERVER_URL
    DocumentRoot /var/www/html

    SSLEngine on
    SSLCertificateFile /etc/ssl/palochangelogs/palochangelogs-selfsigned.crt
    SSLCertificateKeyFile /etc/ssl/palochangelogs/palochangelogs-selfsigned.key

    LoadModule rewrite_module modules/mod_rewrite.so
    LoadModule proxy_module modules/mod_proxy.so
    LoadModule proxy_http_module modules/mod_proxy_http.so
    LoadModule deflate_module modules/mod_deflate.so
    LoadModule headers_module modules/mod_headers.so

    Alias /changes $APP_DIR
    <Directory "$APP_DIR">
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
        
        RewriteEngine On
        RewriteBase /changes
        
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /changes/index.html [L]
    </Directory>

                        <Location /panorama-proxy>
                            ProxyPass http://localhost:3002/panorama-proxy
                            ProxyPassReverse http://localhost:3002/panorama-proxy
        ProxyPreserveHost On
        
        Header set Access-Control-Allow-Origin "*"
        Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
        Header set Access-Control-Allow-Headers "Content-Type, Authorization"
    </Location>

                        <Location /changes/panorama-proxy>
                            ProxyPass http://localhost:3002/panorama-proxy
                            ProxyPassReverse http://localhost:3002/panorama-proxy
        ProxyPreserveHost On
        
        Header set Access-Control-Allow-Origin "*"
        Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
        Header set Access-Control-Allow-Headers "Content-Type, Authorization"
    </Location>

    ErrorLog /var/log/httpd/palochangelogs-error.log
    CustomLog /var/log/httpd/palochangelogs-access.log combined

    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json
    </IfModule>
</VirtualHost>
EOF

echo "✓ Apache configuration created at $APACHE_CONF"

MAIN_CONF="/etc/httpd/conf/httpd.conf"
if [ -f "$MAIN_CONF" ]; then
    if grep -q "^#LoadModule rewrite_module" "$MAIN_CONF"; then
        echo "Enabling required modules in main Apache config..."
        sed -i 's/^#LoadModule rewrite_module/LoadModule rewrite_module/' "$MAIN_CONF"
        sed -i 's/^#LoadModule proxy_module/LoadModule proxy_module/' "$MAIN_CONF"
        sed -i 's/^#LoadModule proxy_http_module/LoadModule proxy_http_module/' "$MAIN_CONF"
        sed -i 's/^#LoadModule deflate_module/LoadModule deflate_module/' "$MAIN_CONF"
        sed -i 's/^#LoadModule headers_module/LoadModule headers_module/' "$MAIN_CONF"
        echo "✓ Modules enabled in main config"
    else
        echo "✓ Modules already enabled or configured"
    fi
fi

echo "Creating SSL certificates..."
SSL_DIR="/etc/ssl/palochangelogs"
mkdir -p "$SSL_DIR"

if [ ! -f "$SSL_DIR/palochangelogs-selfsigned.crt" ] || [ ! -f "$SSL_DIR/palochangelogs-selfsigned.key" ]; then
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_DIR/palochangelogs-selfsigned.key" \
        -out "$SSL_DIR/palochangelogs-selfsigned.crt" \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=$SERVER_URL" 2>/dev/null
    
    chmod 600 "$SSL_DIR/palochangelogs-selfsigned.key"
    chmod 644 "$SSL_DIR/palochangelogs-selfsigned.crt"
    echo "✓ SSL certificates created"
else
    echo "✓ SSL certificates already exist"
fi

mkdir -p /var/log/httpd
touch /var/log/httpd/palochangelogs-access.log
touch /var/log/httpd/palochangelogs-error.log
chown apache:apache /var/log/httpd/palochangelogs-*.log 2>/dev/null || chown www-data:www-data /var/log/httpd/palochangelogs-*.log 2>/dev/null || true

echo "Testing Apache configuration..."
if httpd -t 2>&1; then
    echo "✓ Apache configuration is valid"
else
    echo "✗ Apache configuration test failed"
    httpd -t
    exit 1
fi

echo ""
echo "Step $NEXT_STEP: Configuring firewall..."
NEXT_STEP=$((NEXT_STEP + 1))

if systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
    echo "✓ Firewall rules configured"
else
    echo "Firewalld is not running, skipping firewall configuration"
fi

echo ""
echo "Step $NEXT_STEP: Starting services..."
NEXT_STEP=$((NEXT_STEP + 1))

systemctl enable httpd
systemctl start httpd

sleep 3

if systemctl is-active --quiet httpd; then
    echo "✓ Apache is running"
    
    if ss -tlnp | grep httpd | grep ":80"; then
        echo "✓ Port 80 is listening"
    else
        echo "⚠ Port 80 is NOT listening"
    fi
    
    if ss -tlnp | grep httpd | grep ":443"; then
        echo "✓ Port 443 is listening"
    else
        echo "⚠ Port 443 is NOT listening"
        echo "Check error log: tail -f /var/log/httpd/palochangelogs-error.log"
    fi
else
    echo "✗ Apache failed to start"
    systemctl status httpd --no-pager -l | head -20
    exit 1
fi

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Application deployed to: $APP_DIR"
echo "Apache config: $APACHE_CONF"
echo "Project directory: $PROJECT_DIR"
echo "Server URL: $SERVER_URL"
echo "Panorama URL: $PANORAMA_URL"
if [ "$OIDC_ENABLED" = "false" ] || [ "$OIDC_ENABLED" = "0" ]; then
    echo "OIDC Authentication: DISABLED (anonymous access)"
else
    echo "OIDC Authentication: ENABLED"
    if [ -n "$AZURE_CLIENT_ID" ]; then
        echo "Azure Client ID: ${AZURE_CLIENT_ID:0:20}... (hidden)"
        echo "Azure Authority: $AZURE_AUTHORITY"
        echo "Azure Redirect URI: $AZURE_REDIRECT_URI"
    fi
fi
echo ""
echo "Next steps:"
echo "1. Configure DNS to point $SERVER_URL to this server"
echo "2. Access: https://$SERVER_URL/changes (browser will warn about self-signed cert)"
echo ""
echo "To check service status:"
echo "  systemctl status httpd"
echo "  systemctl status palochangelogs-api-proxy"
echo ""
echo "To view logs:"
echo "  tail -f /var/log/httpd/palochangelogs-access.log"
echo "  tail -f /var/log/httpd/palochangelogs-error.log"
echo "  journalctl -u palochangelogs-api-proxy -f"
echo ""
