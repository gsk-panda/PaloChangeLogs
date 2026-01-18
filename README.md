# PaloChangeLogs

A web application for viewing and analyzing Palo Alto Networks Panorama configuration change logs.

## Features

- View configuration changes from Palo Alto Networks Panorama
- Search change logs by keywords
- Daily database sync for historical data
- OIDC authentication support (Azure AD/Entra ID)
- Interactive dashboard with statistics and charts

## Prerequisites

- Node.js 18.8.20 or higher
- Access to a Palo Alto Networks Panorama instance
- Panorama API key

## Installation

See the installation scripts in the repository:
- `install.sh` - Main installation script for RHEL/CentOS
- `install_rhel.sh` - Alternative RHEL installation script
- `install2.sh` - NGINX-based installation script

## Configuration

1. Configure your Panorama server URL and API key during installation
2. Set up OIDC authentication (optional but recommended)
3. Configure your web server (Apache or NGINX) to serve the application

## Development

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
```

## License

See LICENSE file for details.
