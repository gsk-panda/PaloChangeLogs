# Updating the Application After Code Changes

When you make changes to source files (like `App.tsx`), you need to rebuild and redeploy the application. Here's how:

## Quick Update Process

1. **Pull the latest code** (if updating from git):
   ```bash
   cd /opt/PaloChangeLogs
   git pull origin main
   ```

2. **Rebuild the application**:
   ```bash
   cd /opt/PaloChangeLogs
   export NODE_OPTIONS="--openssl-legacy-provider"
   npm run build -- --base=/changes/
   ```

3. **Deploy the built files**:
   ```bash
   rsync -av --delete /opt/PaloChangeLogs/dist/ /var/www/palochangelogs/
   chown -R palochangelogs:palochangelogs /var/www/palochangelogs
   ```

4. **Restart Apache** (if needed):
   ```bash
   systemctl reload httpd
   ```

## Why You Can't Just Copy App.tsx

- `App.tsx` is a **source file** written in TypeScript/React
- The application needs to be **compiled/built** using Vite
- The build process:
  - Transpiles TypeScript to JavaScript
  - Bundles all dependencies
  - Optimizes and minifies the code
  - Creates the final files in the `dist/` directory
- Apache serves the **built files** from `/var/www/palochangelogs/`, not the source files

## Alternative: Create an Update Script

You can create a simple update script at `/opt/PaloChangeLogs/deploy/update-app.sh`:

```bash
#!/bin/bash
set -e

cd /opt/PaloChangeLogs

echo "Pulling latest code..."
git pull origin main

echo "Building application..."
export NODE_OPTIONS="--openssl-legacy-provider"
npm run build -- --base=/changes/

echo "Deploying files..."
rsync -av --delete dist/ /var/www/palochangelogs/
chown -R palochangelogs:palochangelogs /var/www/palochangelogs

echo "Reloading Apache..."
systemctl reload httpd

echo "Update complete!"
```

Then make it executable:
```bash
chmod +x /opt/PaloChangeLogs/deploy/update-app.sh
```

And run it whenever you need to update:
```bash
sudo /opt/PaloChangeLogs/deploy/update-app.sh
```

## Files That Don't Require Rebuild

- **Configuration files** (like Apache configs, systemd services) - just copy and restart services
- **Database files** - no rebuild needed
- **Deploy scripts** (like `sync-daily-logs.js`, `api-proxy.js`) - just restart the service

## Files That Require Rebuild

- Any `.tsx` or `.ts` files in the `src/` or root directory
- `package.json` changes (need `npm install` first)
- Any React component files
- TypeScript configuration changes
