# NGINX Configuration Troubleshooting

## Error: "host not found in upstream 'palo_changelogs_backend'"

This error occurs when the upstream block is not defined in the `http {}` block of `/etc/nginx/nginx.conf`.

### Quick Fix

Add the upstream block to your `http {}` block in `/etc/nginx/nginx.conf`:

```nginx
http {
    # ... other directives ...
    
    upstream palo_changelogs_backend {
        server 127.0.0.1:3001;  # Change port if different
        keepalive 32;
    }
    
    # Make sure this line exists:
    include /etc/nginx/conf.d/*.conf;
    
    # ... rest of http block ...
}
```

### Automated Fix Script

You can also run this command to automatically add it:

```bash
# Backup nginx.conf first
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup

# Add upstream block (adjust port if needed)
sudo sed -i '/^http {/a\    upstream palo_changelogs_backend {\n        server 127.0.0.1:3001;\n        keepalive 32;\n    }' /etc/nginx/nginx.conf

# Test configuration
sudo nginx -t

# If test passes, reload
sudo systemctl reload nginx
```

### Verify

After adding the upstream block:

```bash
# Test configuration
sudo nginx -t

# Check if upstream is found
sudo nginx -T | grep -A 3 "upstream palo_changelogs_backend"
```

---

## Error: "cannot load certificate" or "BIO_new_file() failed"

This error occurs when the SSL certificate files specified in the NGINX configuration don't exist.

### Quick Fix

Create a self-signed certificate:

```bash
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/private.key \
    -out /etc/nginx/ssl/certificate.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=your-domain.com"

# Set proper permissions
sudo chmod 600 /etc/nginx/ssl/private.key
sudo chmod 644 /etc/nginx/ssl/certificate.crt

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### Automated Fix Script

Run the fix script:

```bash
sudo bash fix-nginx-ssl.sh your-domain.com
```

Or for localhost/testing:

```bash
sudo bash fix-nginx-ssl.sh
```

### For Production

Use Let's Encrypt for trusted certificates:

```bash
sudo dnf install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

This will automatically configure NGINX with valid SSL certificates.

---

## Error: "EADDRINUSE: address already in use :::3001"

This error occurs when port 3001 (or the configured backend port) is already in use by another process.

### Quick Fix

Find and stop the process using the port:

```bash
# Find what's using port 3001
sudo lsof -i:3001
# or
sudo ss -tlnp | grep :3001

# Stop the process (replace PID with actual process ID)
sudo kill <PID>

# Restart the backend service
sudo systemctl restart palo-changelogs-backend
```

### Automated Fix Script

Run the fix script:

```bash
sudo bash fix-port-conflict.sh
```

Or for a different port:

```bash
sudo bash fix-port-conflict.sh 3002
```

### Alternative: Change the Port

If you need to use a different port:

1. Edit `/opt/palo-changelogs/.env`:
   ```
   PORT=3002
   ```

2. Update NGINX upstream configuration in `/etc/nginx/nginx.conf`:
   ```nginx
   upstream palo_changelogs_backend {
       server 127.0.0.1:3002;  # Changed from 3001
       keepalive 32;
   }
   ```

3. Restart services:
   ```bash
   sudo systemctl restart palo-changelogs-backend
   sudo nginx -t
   sudo systemctl reload nginx
   ```

---

## Error: "Endpoint not found (404). Check if the Panorama API endpoint is correct."

This error occurs when the Panorama API proxy is not configured in NGINX, or the frontend environment variable is not set correctly.

### Quick Fix

1. **Add Panorama proxy location to NGINX configuration:**

Edit `/etc/nginx/conf.d/palo-changelogs.conf` and add this location block before the backend API location:

```nginx
# Panorama API proxy location
location /changelogs/panorama-proxy/ {  # Adjust path if using different NGINX_LOCATION_PATH
    proxy_pass https://panorama.officeours.com/;  # Your Panorama host
    proxy_ssl_verify off;
    proxy_ssl_server_name on;
    proxy_http_version 1.1;
    proxy_set_header Host panorama.officeours.com;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    proxy_connect_timeout 75s;
    
    # CORS headers
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range' always;
}
```

2. **Update frontend environment file:**

Edit `/opt/palo-changelogs/.env.local` and add:

```
VITE_PANORAMA_PROXY=/changelogs/panorama-proxy  # Adjust path to match your NGINX_LOCATION_PATH
```

3. **Rebuild frontend and reload NGINX:**

```bash
cd /opt/palo-changelogs
sudo -u palo-changelogs npm run build
sudo nginx -t
sudo systemctl reload nginx
```

### Automated Fix Script

Run the fix script:

```bash
sudo bash fix-panorama-proxy.sh
```

This will automatically add the Panorama proxy configuration to NGINX.

---

## Error: "location directive is not allowed here"

This error occurs when the `palo-changelogs-locations.conf` file is included at the wrong level in your NGINX configuration.

### Diagnosis

Run this command to find where the file is being included:

```bash
sudo grep -r "palo-changelogs-locations.conf" /etc/nginx/
```

### Common Mistakes

#### ❌ WRONG: Including at http level
```nginx
http {
    include /etc/nginx/conf.d/palo-changelogs-locations.conf;  # WRONG!
}
```

#### ❌ WRONG: Including outside any block
```nginx
include /etc/nginx/conf.d/palo-changelogs-locations.conf;  # WRONG!
```

#### ✅ CORRECT: Including inside server block
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    include /etc/nginx/conf.d/palo-changelogs-locations.conf;  # CORRECT!
}
```

### Solution

1. **Find where you're including it:**
   ```bash
   sudo grep -r "palo-changelogs-locations.conf" /etc/nginx/
   ```

2. **If it's in `/etc/nginx/nginx.conf` at the `http` level, remove it from there**

3. **Create or edit your server block file** (usually in `/etc/nginx/conf.d/your-domain.conf`):
   ```nginx
   server {
       listen 443 ssl http2;
       server_name your-domain.com;
       
       # SSL configuration
       ssl_certificate /path/to/cert.crt;
       ssl_certificate_key /path/to/key.key;
       
       # Include Palo ChangeLogs locations (MUST be inside server block)
       include /etc/nginx/conf.d/palo-changelogs-locations.conf;
   }
   ```

4. **Make sure the upstream is in the http block** in `/etc/nginx/nginx.conf`:
   ```nginx
   http {
       # ... other directives ...
       
       # Include Palo ChangeLogs upstream (this is OK at http level)
       include /etc/nginx/conf.d/palo-changelogs-upstream.conf;
       
       # ... rest of http block ...
   }
   ```

5. **Test the configuration:**
   ```bash
   sudo nginx -t
   ```

6. **If test passes, reload NGINX:**
   ```bash
   sudo systemctl reload nginx
   ```

### Quick Fix Script

If you've included it in the wrong place, here's a quick fix:

```bash
# Find and show where it's included
echo "Checking where locations file is included:"
sudo grep -rn "palo-changelogs-locations.conf" /etc/nginx/

# If it's in nginx.conf at http level, you'll need to:
# 1. Remove the include line from the http block
# 2. Add it to a server block instead
```

### File Structure Summary

- **`palo-changelogs-upstream.conf`** → Include in `http` block ✅
- **`palo-changelogs-locations.conf`** → Include in `server` block ✅

### Still Having Issues?

1. Check NGINX error log:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

2. Verify file permissions:
   ```bash
   ls -la /etc/nginx/conf.d/palo-changelogs-*.conf
   ```

3. Check for syntax errors in the locations file:
   ```bash
   sudo nginx -t -c /etc/nginx/nginx.conf
   ```

4. Review the example server block:
   ```bash
   cat /opt/palo-changelogs/nginx-server-block-example.conf
   ```

