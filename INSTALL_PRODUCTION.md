# Production Installation Guide - RHEL 9.7 with NGINX

This guide explains how to install Palo ChangeLogs in a production environment on RHEL 9.7 using NGINX as a reverse proxy, designed to work alongside other web applications.

## Prerequisites

- RHEL 9.7 system with root/sudo access
- NGINX already installed and configured (or will be installed by the script)
- Internet connectivity for downloading dependencies

## Quick Installation

1. **Download and run the installation script:**

```bash
sudo bash install_rhel_production.sh
```

2. **Configure environment variables (optional):**

```bash
export PANORAMA_HOST="panorama.officeours.com"
export PANORAMA_API_KEY="your-api-key"
export NGINX_LOCATION_PATH="/changelogs"  # Base path for the app
export BACKEND_PORT="3001"  # Backend API port
sudo bash install_rhel_production.sh
```

## Configuration Options

### Environment Variables

- `PANORAMA_HOST` - Panorama server hostname (default: panorama.officeours.com)
- `PANORAMA_API_KEY` - Panorama API key (will prompt if not set)
- `NGINX_LOCATION_PATH` - Base path for the application (default: /changelogs)
- `BACKEND_PORT` - Backend API port (default: 3001)

### NGINX Location Path

The `NGINX_LOCATION_PATH` determines where the application will be accessible:

- `/changelogs` - Accessible at `https://your-domain.com/changelogs`
- `/` - Accessible at the root (requires dedicated server block or careful configuration)

**Important:** If using a path other than `/`, the script will automatically configure Vite's base path during build.

## Installation Steps

The script performs the following:

1. Updates system packages
2. Installs prerequisites (Node.js, NGINX, SQLite, etc.)
3. Creates service user (`palo-changelogs`)
4. Clones/updates the repository
5. Installs npm dependencies
6. Configures environment files
7. Builds the frontend application
8. Creates systemd service for backend
9. Creates NGINX configuration snippet
10. Sets up firewall rules
11. Starts the backend service

## Post-Installation Configuration

### 1. Add NGINX Configuration

The script creates a configuration snippet at `/etc/nginx/conf.d/palo-changelogs-locations.conf`. 

**To use it, add this line to your main NGINX server block:**

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL configuration
    ssl_certificate /path/to/cert.crt;
    ssl_certificate_key /path/to/key.key;
    
    # Include Palo ChangeLogs configuration
    include /etc/nginx/conf.d/palo-changelogs-locations.conf;
    
    # Other location blocks for your other applications...
}
```

### 2. Test and Reload NGINX

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Verify Services

```bash
# Check backend service
sudo systemctl status palo-changelogs-backend

# Check logs
sudo journalctl -u palo-changelogs-backend -f
```

## Accessing the Application

- **Frontend:** `https://your-domain.com/changelogs` (or your configured path)
- **Backend API:** `https://your-domain.com/changelogs/api`
- **Health Check:** `https://your-domain.com/changelogs/api/health`

## File Locations

- **Installation Directory:** `/opt/palo-changelogs`
- **Database:** `/opt/palo-changelogs/data/changelogs.db`
- **Frontend Build:** `/opt/palo-changelogs/dist`
- **Environment Files:**
  - Frontend: `/opt/palo-changelogs/.env.local`
  - Backend: `/opt/palo-changelogs/.env`
- **NGINX Config:** `/etc/nginx/conf.d/palo-changelogs-locations.conf`
- **Systemd Service:** `/etc/systemd/system/palo-changelogs-backend.service`

## Updating the Application

Use the update script created during installation:

```bash
sudo /opt/palo-changelogs/update.sh
```

Or manually:

```bash
cd /opt/palo-changelogs
sudo -u palo-changelogs git pull
sudo -u palo-changelogs npm install
sudo -u palo-changelogs npm run build
sudo systemctl restart palo-changelogs-backend
```

## Database Management

### Populate Historical Data

```bash
sudo -u palo-changelogs bash -c 'cd /opt/palo-changelogs && npm run populate:history'
```

### Check Database

```bash
sudo -u palo-changelogs bash -c 'cd /opt/palo-changelogs && npm run check:db'
```

## Scheduled Jobs

The backend service includes a scheduled job that runs daily at 01:00 MST to:
- Fetch the previous day's change logs from Panorama
- Save them to the local database

## Troubleshooting

### Backend Service Not Starting

```bash
# Check service status
sudo systemctl status palo-changelogs-backend

# Check logs
sudo journalctl -u palo-changelogs-backend -n 50

# Verify environment file
sudo cat /opt/palo-changelogs/.env
```

### NGINX Configuration Issues

```bash
# Test configuration
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log
```

### Frontend Not Loading

1. Verify the build directory exists: `ls -la /opt/palo-changelogs/dist`
2. Check NGINX error logs
3. Verify the base path matches your `NGINX_LOCATION_PATH`
4. Check browser console for 404 errors

### Database Permission Issues

If the populate script reports success but data isn't visible:

```bash
# Fix permissions
sudo chown -R palo-changelogs:palo-changelogs /opt/palo-changelogs/data

# Restart backend
sudo systemctl restart palo-changelogs-backend
```

## Security Considerations

- The service runs as a non-privileged user (`palo-changelogs`)
- Environment files are restricted to the service user (600 permissions)
- Database directory is owned by the service user
- Systemd service includes security hardening options
- NGINX configuration includes security headers

## Working with Multiple Applications

This installation is designed to work alongside other web applications on the same NGINX server:

1. Each application can have its own location block
2. The Palo ChangeLogs configuration uses a configurable base path
3. NGINX configuration is modular (snippet file)
4. Backend runs on a configurable port (default: 3001)

Example multi-app configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # App 1
    location /app1 {
        # ... app1 configuration
    }
    
    # Palo ChangeLogs
    include /etc/nginx/conf.d/palo-changelogs-locations.conf;
    
    # App 2
    location /app2 {
        # ... app2 configuration
    }
}
```

## Support

For issues or questions:
- Check the logs: `journalctl -u palo-changelogs-backend -f`
- Review NGINX logs: `/var/log/nginx/error.log`
- Verify environment configuration files
- Check database permissions and ownership

