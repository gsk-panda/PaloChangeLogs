# Apache Configuration Changes for PaloChangeLogs

This document describes the Apache configuration changes needed to add the PaloChangeLogs application to an existing Apache server that is already running PanoVision at `/logs`.

## Overview

The PaloChangeLogs application will be served at `https://example.com/changes` and requires:
- Static file serving for the React application
- Proxy configuration for Panorama API requests
- SPA routing support (rewrite rules)

## Configuration Options

### Option 1: Add to Existing VirtualHost (Recommended)

If your existing Apache configuration uses a VirtualHost for `example.com`, add the following configuration **inside** the existing `<VirtualHost *:443>` block:

```apache
# PaloChangeLogs Application - Add to existing VirtualHost *:443
Alias /changes /var/www/palochangelogs
<Directory "/var/www/palochangelogs">
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

# Panorama API Proxy - Global (if not already configured)
<Location /panorama-proxy>
    ProxyPass http://localhost:3001/panorama-proxy
    ProxyPassReverse http://localhost:3001/panorama-proxy
    ProxyPreserveHost On
    
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Header set Access-Control-Allow-Headers "Content-Type, Authorization"
</Location>

# Panorama API Proxy - For /changes path
<Location /changes/panorama-proxy>
    ProxyPass http://localhost:3001/panorama-proxy
    ProxyPassReverse http://localhost:3001/panorama-proxy
    ProxyPreserveHost On
    
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Header set Access-Control-Allow-Headers "Content-Type, Authorization"
</Location>

# HTTP to HTTPS redirect for /changes (add to VirtualHost *:80 if exists)
# Redirect permanent /changes https://example.com/changes
```

### Option 2: Separate Configuration File

Create a new file `/etc/httpd/conf.d/palochangelogs.conf` with the following content:

```apache
# PaloChangeLogs Application Configuration
# This file adds support for the PaloChangeLogs app at /changes

# HTTP to HTTPS redirect
<VirtualHost *:80>
    ServerName example.com
    Redirect permanent /changes https://example.com/changes
</VirtualHost>

# HTTPS Configuration - Add to existing VirtualHost or create new
<VirtualHost *:443>
    ServerName example.com
    
    # Note: SSL configuration should use existing certificates
    # SSLEngine on
    # SSLCertificateFile /path/to/existing/certificate.crt
    # SSLCertificateKeyFile /path/to/existing/certificate.key
    
    Alias /changes /var/www/palochangelogs
    <Directory "/var/www/palochangelogs">
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
        ProxyPass http://localhost:3001/panorama-proxy
        ProxyPassReverse http://localhost:3001/panorama-proxy
        ProxyPreserveHost On
        
        Header set Access-Control-Allow-Origin "*"
        Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
        Header set Access-Control-Allow-Headers "Content-Type, Authorization"
    </Location>

    <Location /changes/panorama-proxy>
        ProxyPass http://localhost:3001/panorama-proxy
        ProxyPassReverse http://localhost:3001/panorama-proxy
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
```

## Required Apache Modules

Ensure these modules are enabled (they should already be enabled for PanoVision):

```apache
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule deflate_module modules/mod_deflate.so
LoadModule headers_module modules/mod_headers.so
```

These are typically enabled in `/etc/httpd/conf/httpd.conf` or `/etc/httpd/conf.modules.d/`.

## Prerequisites

Before adding this configuration, ensure:

1. **Application directory exists:**
   ```bash
   mkdir -p /var/www/palochangelogs
   chown -R palochangelogs:palochangelogs /var/www/palochangelogs
   ```

2. **API Proxy service is running:**
   ```bash
   systemctl status palochangelogs-api-proxy
   ```
   The proxy service should be listening on `localhost:3001`

3. **Log directories exist:**
   ```bash
   touch /var/log/httpd/palochangelogs-access.log
   touch /var/log/httpd/palochangelogs-error.log
   chown apache:apache /var/log/httpd/palochangelogs-*.log
   ```

## Installation Steps

1. **Backup existing configuration:**
   ```bash
   cp /etc/httpd/conf.d/panovision.conf /etc/httpd/conf.d/panovision.conf.backup.$(date +%Y%m%d)
   ```

2. **Add configuration** using Option 1 or Option 2 above

3. **Test Apache configuration:**
   ```bash
   httpd -t
   ```

4. **If test passes, reload Apache:**
   ```bash
   systemctl reload httpd
   ```

5. **Verify the application is accessible:**
   ```bash
   curl -k https://example.com/changes
   ```

## Important Notes

- **SSL Certificates:** If you're using the same SSL certificate for both applications, you don't need to add separate SSL configuration. The existing certificate configuration will work for both `/logs` and `/changes`.

- **Port Conflicts:** The API proxy runs on port 3001. Ensure this port is not used by the PanoVision application (which likely uses a different port).

- **Path Conflicts:** The `/panorama-proxy` location is shared. If PanoVision already uses this path, you may need to adjust the configuration to avoid conflicts. The `/changes/panorama-proxy` location is specific to PaloChangeLogs.

- **File Permissions:** Ensure the `palochangelogs` user has read access to `/var/www/palochangelogs` and Apache can serve files from that directory.

## Troubleshooting

If the application doesn't load:

1. **Check Apache error logs:**
   ```bash
   tail -f /var/log/httpd/palochangelogs-error.log
   tail -f /var/log/httpd/error_log
   ```

2. **Verify API proxy is running:**
   ```bash
   systemctl status palochangelogs-api-proxy
   journalctl -u palochangelogs-api-proxy -f
   ```

3. **Check file permissions:**
   ```bash
   ls -la /var/www/palochangelogs
   ```

4. **Test proxy connectivity:**
   ```bash
   curl http://localhost:3001/panorama-proxy/api/?type=op&cmd=<show><system><info></info></system></show>
   ```

5. **Verify Apache modules are loaded:**
   ```bash
   httpd -M | grep -E 'rewrite|proxy|deflate|headers'
   ```
