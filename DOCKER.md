# Docker Deployment Guide

This guide provides step-by-step instructions for deploying PaloChangeLogs using Docker and Docker Compose.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Building and Running](#building-and-running)
- [Production Deployment](#production-deployment)
- [Database Management](#database-management)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher
- **Git**: For cloning the repository

### Required Information

- **Panorama URL**: Your Palo Alto Networks Panorama instance URL
- **Panorama API Key**: Valid API key with read permissions
- **Azure AD/Entra ID** (Optional): App Registration details for OIDC

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/PaloChangeLogs.git
cd PaloChangeLogs
```

### 2. Create Environment File

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Panorama Configuration
PANORAMA_URL=https://panorama.example.com
PANORAMA_API_KEY=your_actual_api_key_here

# Frontend Build Configuration
VITE_PANORAMA_SERVER=https://panorama.example.com
VITE_OIDC_ENABLED=true

# OIDC Authentication (if enabled)
VITE_AZURE_CLIENT_ID=your_azure_client_id
VITE_AZURE_AUTHORITY=https://login.microsoftonline.com/your-tenant-id
VITE_AZURE_REDIRECT_URI=https://your-domain.com/changes
```

### 3. Build and Start

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

### 4. Access the Application

Once started, access the application at:
- **HTTP**: `http://localhost/changes`
- **API Proxy**: `http://localhost:3002`

## Configuration

### Environment Variables

#### Required Variables

- `PANORAMA_URL`: Panorama instance URL (e.g., `https://panorama.example.com`)
- `PANORAMA_API_KEY`: Panorama API key

#### Optional Variables

- `VITE_OIDC_ENABLED`: Enable OIDC authentication (`true` or `false`, default: `false`)
- `VITE_AZURE_CLIENT_ID`: Azure AD Client ID
- `VITE_AZURE_AUTHORITY`: Azure AD Authority URL
- `VITE_AZURE_REDIRECT_URI`: OIDC redirect URI
- `VITE_PANORAMA_SERVER`: Panorama server URL (for frontend)

### Docker Compose Files

- **`docker-compose.yml`**: Development configuration
- **`docker-compose.prod.yml`**: Production configuration with logging

### Nginx Configuration

The `nginx.conf` file is included for serving the frontend. For production:

1. **Enable HTTPS**: Uncomment the HTTPS server block in `nginx.conf`
2. **Add SSL Certificates**: Place certificates in `./ssl/` directory:
   ```bash
   mkdir -p ssl
   cp your-cert.pem ssl/cert.pem
   cp your-key.pem ssl/key.pem
   ```
3. **Update Server Name**: Change `server_name _;` to your domain

## Building and Running

### Build Images

```bash
# Build all images
docker-compose build

# Build specific service
docker-compose build palochangelogs
```

### Start Services

```bash
# Start in detached mode
docker-compose up -d

# Start and view logs
docker-compose up

# Start specific service
docker-compose up -d palochangelogs
```

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes database)
docker-compose down -v
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f palochangelogs

# Last 100 lines
docker-compose logs --tail=100 palochangelogs
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart palochangelogs
```

## Production Deployment

### 1. Use Production Compose File

```bash
# Use production configuration
docker-compose -f docker-compose.prod.yml up -d
```

### 2. Configure SSL

1. Create SSL directory:
   ```bash
   mkdir -p ssl
   ```

2. Add your SSL certificates:
   ```bash
   cp /path/to/cert.pem ssl/cert.pem
   cp /path/to/key.pem ssl/key.pem
   ```

3. Update `nginx.conf`:
   - Uncomment HTTPS server block
   - Update `server_name` with your domain
   - Ensure certificate paths are correct

### 3. Set Up Reverse Proxy (Optional)

If using an external reverse proxy (e.g., Traefik, Caddy):

```yaml
# docker-compose.prod.yml
services:
  palochangelogs:
    # Remove nginx service
    # Expose port 3002 directly or use reverse proxy
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.palochangelogs.rule=Host(`your-domain.com`)"
      - "traefik.http.routers.palochangelogs.entrypoints=websecure"
      - "traefik.http.routers.palochangelogs.tls.certresolver=letsencrypt"
```

### 4. Resource Limits

Add resource limits for production:

```yaml
services:
  palochangelogs:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Database Management

### Database Location

The SQLite database is stored in a Docker volume:
- **Volume Name**: `palochangelogs-data`
- **Container Path**: `/app/data/palochangelogs.db`

### Backup Database

```bash
# Create backup
docker run --rm \
  -v palochangelogs-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/palochangelogs-backup-$(date +%Y%m%d).tar.gz -C /data .

# Or copy directly
docker cp palochangelogs:/app/data/palochangelogs.db ./backup-$(date +%Y%m%d).db
```

### Restore Database

```bash
# Restore from backup
docker run --rm \
  -v palochangelogs-data:/data \
  -v $(pwd):/backup \
  alpine sh -c "cd /data && rm -f palochangelogs.db && tar xzf /backup/palochangelogs-backup-YYYYMMDD.tar.gz"
```

### Prepopulate Database

```bash
# Run prepopulation script
docker-compose exec palochangelogs node /app/deploy/prepopulate-database.js
```

### View Database

```bash
# Access SQLite shell
docker-compose exec palochangelogs sh -c "sqlite3 /app/data/palochangelogs.db"

# Run SQL query
docker-compose exec palochangelogs sh -c "sqlite3 /app/data/palochangelogs.db 'SELECT COUNT(*) FROM change_logs;'"
```

### Update API Key

```bash
# Method 1: Update environment variable and restart
# Edit .env file, then:
docker-compose restart palochangelogs

# Method 2: Update directly in container
docker-compose exec palochangelogs sh -c "echo 'new_api_key' > /app/config/panorama-api-key"
docker-compose restart palochangelogs
```

## Troubleshooting

### Container Won't Start

1. **Check Logs**:
   ```bash
   docker-compose logs palochangelogs
   ```

2. **Verify Environment Variables**:
   ```bash
   docker-compose config
   ```

3. **Check Port Conflicts**:
   ```bash
   # Check if port 3002 is in use
   netstat -tuln | grep 3002
   # or
   lsof -i :3002
   ```

### API Proxy Not Responding

1. **Check Container Status**:
   ```bash
   docker-compose ps
   ```

2. **Test API Proxy**:
   ```bash
   curl http://localhost:3002/panorama-proxy/api/db/stats
   ```

3. **Check API Key**:
   ```bash
   docker-compose exec palochangelogs cat /app/config/panorama-api-key
   ```

### Frontend Not Loading

1. **Check Nginx Logs**:
   ```bash
   docker-compose logs nginx
   ```

2. **Verify Files**:
   ```bash
   docker-compose exec nginx ls -la /usr/share/nginx/html/changes
   ```

3. **Check Nginx Configuration**:
   ```bash
   docker-compose exec nginx nginx -t
   ```

### Database Issues

1. **Check Database File**:
   ```bash
   docker-compose exec palochangelogs ls -lh /app/data/
   ```

2. **Check Permissions**:
   ```bash
   docker-compose exec palochangelogs ls -la /app/data/
   ```

3. **Verify Database Content**:
   ```bash
   docker-compose exec palochangelogs sh -c "sqlite3 /app/data/palochangelogs.db 'SELECT COUNT(*) FROM change_logs;'"
   ```

### Sync Service Not Running

1. **Check Sync Container**:
   ```bash
   docker-compose logs sync
   ```

2. **Manually Trigger Sync**:
   ```bash
   docker-compose exec sync node /app/deploy/sync-daily-logs.js
   ```

### Build Failures

1. **Clear Build Cache**:
   ```bash
   docker-compose build --no-cache
   ```

2. **Check Node Version**:
   ```bash
   docker run --rm node:20-alpine node --version
   ```

3. **Verify Dockerfile**:
   ```bash
   docker build -t test-build .
   ```

## Advanced Configuration

### Custom Nginx Configuration

Create a custom `nginx.conf` and mount it:

```yaml
services:
  nginx:
    volumes:
      - ./custom-nginx.conf:/etc/nginx/nginx.conf:ro
```

### External Database (PostgreSQL/MySQL)

For production, consider using an external database:

1. Update `deploy/api-proxy.js` to use external database
2. Add database service to `docker-compose.yml`
3. Update connection strings

### Health Checks

Health checks are configured in `docker-compose.yml`. Monitor with:

```bash
docker-compose ps
```

### Resource Monitoring

```bash
# Container stats
docker stats

# Specific container
docker stats palochangelogs
```

## Maintenance

### Update Application

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose build
docker-compose up -d
```

### Clean Up

```bash
# Remove stopped containers
docker-compose down

# Remove volumes (⚠️ deletes database)
docker-compose down -v

# Remove images
docker-compose down --rmi all
```

### Log Rotation

Logs are automatically rotated in production configuration (10MB max, 3 files).

View logs:
```bash
docker-compose logs --tail=1000 > logs.txt
```

## Security Considerations

1. **API Keys**: Never commit `.env` file to version control
2. **SSL/TLS**: Always use HTTPS in production
3. **Network**: Use Docker networks to isolate services
4. **Volumes**: Secure volume mounts with proper permissions
5. **Updates**: Regularly update base images for security patches

## Support

For issues or questions:
- Check logs: `docker-compose logs`
- Review troubleshooting section
- Open an issue on GitHub
