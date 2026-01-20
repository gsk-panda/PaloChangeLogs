# Docker Installation Guide - Step by Step

This guide provides complete step-by-step instructions for installing PaloChangeLogs on your workstation using Docker.

## Prerequisites Check

Before starting, ensure you have:

1. **Docker Desktop** installed and running
   - Windows: Download from [docker.com](https://www.docker.com/products/docker-desktop)
   - Verify installation: Open PowerShell/Command Prompt and run:
     ```bash
     docker --version
     docker-compose --version
     ```

2. **Git** installed (for cloning the repository)
   - Verify: `git --version`

3. **Required Information**:
   - Panorama server URL or IP address
   - Panorama API key
   - (Optional) Azure AD/Entra ID credentials for OIDC

## Step-by-Step Installation

### Step 1: Clone the Repository

Open PowerShell (Windows) or Terminal (Mac/Linux) and run:

```bash
git clone https://github.com/gsk-panda/PaloChangeLogs.git
cd PaloChangeLogs
```

### Step 2: Create Environment Configuration File

Create a `.env` file in the project directory:

**On Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
notepad .env
```

**On Mac/Linux:**
```bash
cp .env.example .env
nano .env
```

### Step 3: Configure Environment Variables

Edit the `.env` file with your actual values:

```env
# Panorama Configuration (REQUIRED)
PANORAMA_URL=https://panorama.example.com
PANORAMA_API_KEY=your_actual_panorama_api_key_here

# Frontend Build Configuration (REQUIRED)
VITE_PANORAMA_SERVER=https://panorama.example.com

# OIDC Authentication (OPTIONAL - set to false to disable)
VITE_OIDC_ENABLED=false

# If OIDC is enabled, configure these:
# VITE_AZURE_CLIENT_ID=your_azure_client_id
# VITE_AZURE_AUTHORITY=https://login.microsoftonline.com/your-tenant-id
# VITE_AZURE_REDIRECT_URI=http://localhost/changes
```

**Important Notes:**
- Replace `panorama.example.com` with your actual Panorama URL or IP
- Replace `your_actual_panorama_api_key_here` with your real API key
- If you don't have OIDC set up, keep `VITE_OIDC_ENABLED=false`
- For local testing, you can use `http://localhost/changes` as the redirect URI

### Step 4: Build Docker Images

Build the Docker images (this may take 5-10 minutes the first time):

```bash
docker-compose build
```

**What this does:**
- Downloads Node.js base image
- Installs all npm dependencies
- Builds the React frontend application
- Creates the production Docker image

### Step 5: Start the Application

Start all services:

```bash
docker-compose up -d
```

The `-d` flag runs containers in the background (detached mode).

**What starts:**
- `palochangelogs`: Main application with API proxy (port 3002)
- `nginx`: Web server for frontend (ports 80 and 443)
- `sync`: Database synchronization service

### Step 6: Verify Installation

Check that all containers are running:

```bash
docker-compose ps
```

You should see three containers with status "Up".

View logs to ensure everything started correctly:

```bash
docker-compose logs -f
```

Press `Ctrl+C` to exit log viewing.

### Step 7: Access the Application

Open your web browser and navigate to:

```
http://localhost/changes
```

**If you see the login screen or dashboard**, the installation was successful!

## Post-Installation Steps

### Prepopulate Database (Optional)

To import historical data into the database:

```bash
docker-compose exec palochangelogs node /app/deploy/prepopulate-database.js
```

**Note:** This can take several hours depending on the amount of historical data.

### Check Database Status

View database statistics:

```bash
# Access the container
docker-compose exec palochangelogs sh

# Inside the container, check database
sqlite3 /app/data/palochangelogs.db "SELECT COUNT(*) FROM change_logs;"

# Exit container
exit
```

Or use the API:

```bash
curl http://localhost:3002/panorama-proxy/api/db/stats
```

## Common Commands

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f palochangelogs

# Last 100 lines
docker-compose logs --tail=100
```

### Stop the Application

```bash
docker-compose stop
```

### Start the Application

```bash
docker-compose start
```

### Restart the Application

```bash
docker-compose restart
```

### Stop and Remove Containers

```bash
docker-compose down
```

**Warning:** This stops containers but keeps data volumes. To remove volumes too (deletes database):

```bash
docker-compose down -v
```

### Rebuild After Code Changes

```bash
docker-compose build --no-cache
docker-compose up -d
```

## Troubleshooting

### Port Already in Use

If you get an error about ports being in use:

**Windows:**
```powershell
# Check what's using port 80
netstat -ano | findstr :80

# Check what's using port 3002
netstat -ano | findstr :3002
```

**Solution:** Either stop the conflicting service or change ports in `docker-compose.yml`:
```yaml
ports:
  - "8080:80"  # Change 80 to 8080
  - "3003:3002"  # Change 3002 to 3003
```

### Container Won't Start

1. **Check logs:**
   ```bash
   docker-compose logs palochangelogs
   ```

2. **Verify environment variables:**
   ```bash
   docker-compose config
   ```

3. **Check if API key is set:**
   ```bash
   # Windows PowerShell
   Get-Content .env | Select-String "PANORAMA_API_KEY"
   ```

### Frontend Not Loading

1. **Check nginx logs:**
   ```bash
   docker-compose logs nginx
   ```

2. **Verify frontend files exist:**
   ```bash
   docker-compose exec palochangelogs ls -la /app/frontend
   ```

3. **Rebuild frontend:**
   ```bash
   docker-compose build --no-cache palochangelogs
   docker-compose up -d
   ```

### API Proxy Not Responding

1. **Check API proxy logs:**
   ```bash
   docker-compose logs palochangelogs
   ```

2. **Test API proxy directly:**
   ```bash
   curl http://localhost:3002/panorama-proxy/api/db/stats
   ```

3. **Verify API key in container:**
   ```bash
   docker-compose exec palochangelogs cat /app/config/panorama-api-key
   ```

### Database Issues

1. **Check database file:**
   ```bash
   docker-compose exec palochangelogs ls -lh /app/data/
   ```

2. **View database content:**
   ```bash
   docker-compose exec palochangelogs sh -c "sqlite3 /app/data/palochangelogs.db 'SELECT COUNT(*) FROM change_logs;'"
   ```

## Updating the Application

When you need to update to the latest version:

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose build
docker-compose up -d
```

## Uninstalling

To completely remove the application:

```bash
# Stop and remove containers
docker-compose down

# Remove volumes (⚠️ deletes database)
docker-compose down -v

# Remove images (optional)
docker rmi palochangelogs-palochangelogs palochangelogs-sync
```

## Next Steps

1. **Configure OIDC** (if needed): Update `.env` with Azure AD credentials
2. **Set up SSL**: Configure SSL certificates in `nginx.conf` for HTTPS
3. **Prepopulate database**: Import historical data for faster searches
4. **Customize**: Modify configuration files as needed

## Getting Help

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Review the troubleshooting section above
3. Check [DOCKER.md](DOCKER.md) for more detailed information
4. Open an issue on GitHub

## Quick Reference

| Task | Command |
|------|---------|
| Start application | `docker-compose up -d` |
| Stop application | `docker-compose stop` |
| View logs | `docker-compose logs -f` |
| Rebuild | `docker-compose build` |
| Check status | `docker-compose ps` |
| Access container | `docker-compose exec palochangelogs sh` |
| Remove everything | `docker-compose down -v` |
