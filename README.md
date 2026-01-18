# PaloChangeLogs

A comprehensive web application for viewing, searching, and analyzing Palo Alto Networks Panorama configuration change logs. This application provides an intuitive interface for tracking configuration changes, searching historical data, and visualizing change patterns.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Database Management](#database-management)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## Features

### Core Functionality

- **Change Log Viewing**: Browse configuration changes from Palo Alto Networks Panorama with detailed before/after comparisons
- **Advanced Search**: Search across all historical change logs by keywords (e.g., CHG, RITM, Tech) in the "After-change-detail" field
- **Date-Based Navigation**: Select specific dates to view changes for that day, with automatic loading of today's data and the previous 6 days
- **Interactive Dashboard**: Visual statistics showing change counts, trends, and administrator activity
- **Diff Viewer**: Side-by-side comparison of configuration changes with syntax highlighting
- **Admin Statistics**: Track which administrators made changes and their activity patterns

### Performance & Caching

- **Local Database Caching**: SQLite database stores historical change logs for fast retrieval
- **Daily Sync**: Automated daily synchronization of previous day's changes from Panorama
- **Smart Data Loading**: Today's data fetched from Panorama API; historical data served from local database
- **Database Prepopulation**: One-time script to populate database with up to 2 years of historical data (720 days)

### Security

- **OIDC Authentication**: Optional Azure AD/Entra ID integration for secure access
- **API Key Protection**: Panorama API keys stored securely on the server, never exposed to the browser
- **API Proxy**: Backend proxy service handles all Panorama API requests with proper authentication

### User Interface

- **Modern React UI**: Built with React 19, TypeScript, and Tailwind CSS
- **Responsive Design**: Works on desktop and tablet devices
- **Real-time Updates**: Live statistics and change counts
- **Activity Timeline**: Visual timeline showing changes over the past week

## Architecture

### Components

```
┌─────────────────┐
│   Web Browser   │
│  (React App)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│  Apache/NGINX   │─────▶│  API Proxy       │
│  (Static Files) │      │  (Port 3002)     │
└─────────────────┘      └────────┬─────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
            ┌───────────┐  ┌──────────┐  ┌──────────┐
            │ Panorama  │  │ SQLite   │  │  Azure   │
            │   API     │  │ Database │  │    AD     │
            └───────────┘  └──────────┘  └──────────┘
```

### Key Services

1. **Frontend Application**: React-based SPA served by Apache/NGINX
2. **API Proxy Service**: Node.js service running on port 3002 that:
   - Proxies requests to Panorama API
   - Manages API key authentication
   - Handles database queries
   - Provides RESTful endpoints for the frontend
3. **Database Sync Service**: Daily systemd timer that syncs previous day's changes
4. **Database Prepopulation Script**: One-time script to import historical data

### Data Flow

1. **Today's Data**: Frontend → API Proxy → Panorama API → Response
2. **Historical Data**: Frontend → API Proxy → SQLite Database → Response
3. **Search Queries**: Frontend → API Proxy → SQLite Database (with LIKE queries) → Response
4. **Daily Sync**: Systemd Timer → Sync Script → Panorama API → SQLite Database

## Prerequisites

### System Requirements

- **Operating System**: RHEL 9.x, CentOS 9.x, or compatible Linux distribution
- **Node.js**: Version 18.8.20 or higher
- **Web Server**: Apache HTTP Server 2.4+ or NGINX 1.18+
- **Database**: SQLite3 (included with Node.js)
- **Memory**: Minimum 2GB RAM (4GB recommended)
- **Disk Space**: 500MB for application + space for database (depends on historical data)

### Required Access

- **Panorama Access**: Network access to Palo Alto Networks Panorama instance
- **Panorama API Key**: Valid API key with read permissions for configuration logs
- **Azure AD/Entra ID** (Optional): App Registration for OIDC authentication
- **Root/Sudo Access**: Required for installation and service configuration

## Installation

### Quick Start

The easiest way to install PaloChangeLogs is using the provided installation script:

```bash
git clone https://github.com/gsk-panda/PaloChangeLogs.git
cd PaloChangeLogs
sudo ./install.sh
```

The installation script will:
1. Install Node.js (if not present)
2. Clone the repository (if running standalone)
3. Install npm dependencies
4. Configure Panorama connection
5. Set up OIDC authentication (optional)
6. Build the application
7. Configure Apache/NGINX
8. Create systemd services
9. Start all services

### Installation Options

#### Option 1: Main Installation Script (Recommended)

```bash
sudo ./install.sh
```

This script:
- Uses Apache HTTP Server
- Configures OIDC authentication by default
- Sets up API proxy service
- Configures daily database sync

**Options:**
```bash
# Disable OIDC authentication
sudo ./install.sh --disable-oidc

# Enable OIDC authentication (default)
sudo ./install.sh --enable-oidc
```

#### Option 2: RHEL Installation Script

```bash
sudo ./install_rhel.sh
```

Alternative installation script for RHEL systems with different defaults.

#### Option 3: NGINX Installation Script

```bash
sudo ./install2.sh
```

For environments using NGINX instead of Apache.

### Manual Installation

If you prefer manual installation, see [INSTALLATION.md](docs/INSTALLATION.md) for detailed steps.

## Configuration

### Panorama Configuration

During installation, you'll be prompted for:

1. **Panorama URL/IP**: The address of your Panorama instance
   - Example: `panorama.example.com` or `192.168.1.10`
   - Can include protocol: `https://panorama.example.com`

2. **Panorama API Key**: Your Panorama API key
   - Generated from Panorama web interface
   - Stored securely in `/etc/palochangelogs/panorama-api-key`
   - Can be updated later using `update-api-key.sh`

### OIDC Authentication (Optional)

If OIDC is enabled, configure Azure AD/Entra ID:

1. **Azure App Registration**:
   - Create an app registration in Azure AD
   - Add redirect URI: `https://your-domain.com/changes`
   - Note the Client ID and Tenant ID

2. **Installation Configuration**:
   - Client ID: Your Azure App Registration Client ID
   - Authority: `https://login.microsoftonline.com/{tenant-id}`
   - Redirect URI: `https://your-domain.com/changes`

### Web Server Configuration

#### Apache

The installation script automatically configures Apache. For manual configuration, see [apache-config-changes.md](apache-config-changes.md).

#### NGINX

If using NGINX, the `install2.sh` script handles configuration automatically.

### Environment Variables

Key environment variables (set during installation):

- `VITE_PANORAMA_SERVER`: Panorama server URL
- `VITE_OIDC_ENABLED`: Enable/disable OIDC (`true`/`false`)
- `VITE_AZURE_CLIENT_ID`: Azure AD Client ID
- `VITE_AZURE_AUTHORITY`: Azure AD Authority URL
- `VITE_AZURE_REDIRECT_URI`: OIDC redirect URI

## Usage

### Accessing the Application

Once installed, access the application at:
```
https://your-domain.com/changes
```

### Viewing Change Logs

1. **Select a Date**: Use the date picker to view changes for a specific date
2. **View Today's Changes**: The application automatically loads today's changes on startup
3. **Browse Timeline**: The activity timeline shows changes for the past 7 days

### Searching Change Logs

1. **Enter Search Term**: Type keywords in the search box (e.g., "CHG0036404", "RITM", "Tech")
2. **Click Search**: Click the "Go" button or press Enter
3. **Review Results**: Search results show all matching records across all historical data

**Search Behavior:**
- Searches the "After-change-detail" field
- Searches across all available historical data (not limited to date ranges)
- Case-insensitive matching
- Supports partial matches

### Viewing Change Details

1. **Expand Row**: Click on any change log entry to expand it
2. **View Diff**: See side-by-side comparison of before/after configuration
3. **Copy Configuration**: Use the copy buttons to copy configuration snippets

### Dashboard Statistics

The dashboard displays:
- **Change Count**: Total changes for the selected date
- **Activity Timeline**: Changes over the past 7 days
- **Admin Statistics**: Breakdown of changes by administrator
- **Database Stats**: Total rows in the local database

## Database Management

### Daily Synchronization

The application automatically syncs the previous day's changes every day at 2:00 AM (system time).

**Service Management:**
```bash
# Check sync service status
systemctl status palochangelogs-sync.service

# Check sync timer status
systemctl status palochangelogs-sync.timer

# View sync logs
journalctl -u palochangelogs-sync.service -f

# Manually trigger sync
systemctl start palochangelogs-sync.service
```

### Prepopulating Historical Data

To populate the database with historical data (up to 2 years):

```bash
cd /opt/PaloChangeLogs
sudo node deploy/prepopulate-database.js
```

This script:
- Processes data in 30-day batches
- Fetches full change details for each entry
- Stores data in SQLite database
- Shows progress for each batch

**Note**: This process can take several hours depending on the amount of historical data.

### Database Location

- **Path**: `/opt/PaloChangeLogs/data/palochangelogs.db`
- **Backup**: Regularly backup this file to preserve historical data
- **Size**: Grows with historical data (typically 10-100MB per year)

### Database Schema

The database stores:
- `receive_time`: Timestamp of the change
- `seqno`: Unique sequence number from Panorama
- `path`: Configuration path that was changed
- `cmd`: Command type (set, edit, delete, add, clone, multi-clone)
- `admin`: Administrator who made the change
- `before_change_detail`: Configuration before the change
- `after_change_detail`: Configuration after the change
- `log_date`: Date in YYYY-MM-DD format for efficient querying

### Updating API Key

To update the Panorama API key without reinstalling:

```bash
sudo ./update-api-key.sh
```

This script:
- Prompts for new API key
- Updates `/etc/palochangelogs/panorama-api-key`
- Restarts the API proxy service

## Development

### Prerequisites

- Node.js 18.8.20+
- npm or yarn
- Git

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/gsk-panda/PaloChangeLogs.git
cd PaloChangeLogs

# Install dependencies
npm install

# Create .env.local file
cat > .env.local << EOF
VITE_PANORAMA_SERVER=https://panorama.example.com
VITE_OIDC_ENABLED=false
EOF

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Project Structure

```
PaloChangeLogs/
├── components/          # React components
│   ├── ChangeLogTable.tsx
│   ├── DiffViewer.tsx
│   ├── Sidebar.tsx
│   └── StatsChart.tsx
├── services/            # API services
│   ├── databaseService.ts
│   ├── geminiService.ts
│   └── panoramaService.ts
├── utils/               # Utility functions
│   └── dateUtils.ts
├── deploy/              # Deployment scripts
│   ├── prepopulate-database.js
│   ├── sync-daily-logs.js
│   ├── sync-daily-logs.service
│   └── sync-daily-logs.timer
├── App.tsx             # Main application component
├── index.tsx           # Application entry point
├── authConfig.ts       # OIDC configuration
├── constants.ts         # Application constants
├── types.ts            # TypeScript type definitions
└── vite.config.ts      # Vite configuration
```

### Building for Production

```bash
# Build application
npm run build

# Output will be in dist/ directory
```

### Code Style

- **Language**: TypeScript
- **Framework**: React 19 with functional components and hooks
- **Styling**: Tailwind CSS
- **Linting**: TypeScript compiler for type checking

### Testing

Currently, manual testing is recommended. Automated tests can be added using:
- Jest for unit tests
- React Testing Library for component tests
- Playwright for E2E tests

## Troubleshooting

### Application Not Loading

1. **Check Apache/NGINX Status**:
   ```bash
   systemctl status httpd  # Apache
   systemctl status nginx  # NGINX
   ```

2. **Check Application Files**:
   ```bash
   ls -la /var/www/palochangelogs
   ```

3. **Check Apache/NGINX Logs**:
   ```bash
   tail -f /var/log/httpd/error_log  # Apache
   tail -f /var/log/nginx/error.log  # NGINX
   ```

### API Proxy Not Working

1. **Check Service Status**:
   ```bash
   systemctl status palochangelogs-api-proxy.service
   ```

2. **Check Service Logs**:
   ```bash
   journalctl -u palochangelogs-api-proxy.service -f
   ```

3. **Verify API Key**:
   ```bash
   sudo cat /etc/palochangelogs/panorama-api-key
   ```

4. **Test Panorama Connectivity**:
   ```bash
   curl -k https://panorama.example.com/api/?type=op&cmd=<show><system><info></info></system></show>
   ```

### Database Issues

1. **Check Database File**:
   ```bash
   ls -lh /opt/PaloChangeLogs/data/palochangelogs.db
   ```

2. **Check Database Permissions**:
   ```bash
   ls -la /opt/PaloChangeLogs/data/
   ```

3. **Verify Database Content**:
   ```bash
   sqlite3 /opt/PaloChangeLogs/data/palochangelogs.db "SELECT COUNT(*) FROM change_logs;"
   ```

### OIDC Authentication Issues

1. **Check Browser Console**: Look for authentication errors
2. **Verify Azure Configuration**: Ensure Client ID, Authority, and Redirect URI are correct
3. **Check Network Tab**: Verify OIDC requests are reaching Azure AD
4. **Review MSAL Logs**: Check browser console for detailed MSAL logging

### Search Not Finding Results

1. **Verify Database Has Data**:
   ```bash
   sqlite3 /opt/PaloChangeLogs/data/palochangelogs.db "SELECT COUNT(*) FROM change_logs;"
   ```

2. **Check Search Query**: Ensure search terms match content in "after-change-detail" field
3. **Review API Proxy Logs**: Check for search query errors
4. **Test Database Query Directly**:
   ```bash
   sqlite3 /opt/PaloChangeLogs/data/palochangelogs.db "SELECT * FROM change_logs WHERE LOWER(after_change_detail) LIKE '%your_search_term%' LIMIT 5;"
   ```

### Performance Issues

1. **Database Size**: Large databases may slow queries
   - Consider archiving old data
   - Optimize database with `VACUUM`

2. **Panorama API Response Time**: Slow Panorama responses affect today's data loading
   - Check Panorama server performance
   - Verify network connectivity

3. **Browser Cache**: Clear browser cache if UI seems outdated

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the Repository**: Create your own fork
2. **Create a Branch**: Use descriptive branch names
3. **Make Changes**: Follow existing code style
4. **Test Thoroughly**: Ensure changes don't break existing functionality
5. **Submit Pull Request**: Include description of changes

### Development Guidelines

- Use TypeScript for all new code
- Follow React best practices
- Write self-documenting code
- Add comments for complex logic
- Update documentation for user-facing changes

## License

Disclaimer: This software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and noninfringement. In no event shall the author or copyright holder be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software. Use at your own risk.

## Support

For issues, questions, or contributions:
- Open an issue on GitHub
- Review existing documentation
- Check troubleshooting section

## Acknowledgments

- Built with React, TypeScript, and Tailwind CSS
- Uses Palo Alto Networks Panorama API
- Integrates with Azure AD/Entra ID for authentication
