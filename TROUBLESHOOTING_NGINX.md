# NGINX Configuration Troubleshooting

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

