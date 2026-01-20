# Multi-stage Dockerfile for PaloChangeLogs

# Stage 1: Build the frontend application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build arguments for environment variables
ARG VITE_PANORAMA_SERVER
ARG VITE_OIDC_ENABLED=false
ARG VITE_AZURE_CLIENT_ID
ARG VITE_AZURE_AUTHORITY
ARG VITE_AZURE_REDIRECT_URI

# Set environment variables for build
ENV VITE_PANORAMA_SERVER=$VITE_PANORAMA_SERVER
ENV VITE_OIDC_ENABLED=$VITE_OIDC_ENABLED
ENV VITE_AZURE_CLIENT_ID=$VITE_AZURE_CLIENT_ID
ENV VITE_AZURE_AUTHORITY=$VITE_AZURE_AUTHORITY
ENV VITE_AZURE_REDIRECT_URI=$VITE_AZURE_REDIRECT_URI

# Build the application with base path
RUN npm run build -- --base=/changes/

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /app

# Install dumb-init and su-exec for proper signal handling and user switching
RUN apk add --no-cache dumb-init su-exec

# Use existing node user (already has UID 1000)

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

# Copy deployment scripts
COPY deploy/api-proxy.template.js ./deploy/api-proxy.js
COPY deploy/sync-daily-logs.js ./deploy/
COPY deploy/prepopulate-database.js ./deploy/

# Create necessary directories and set ownership
RUN mkdir -p /app/data /app/config && \
    chown -R node:node /app

# Create entrypoint script
RUN cat > /app/docker-entrypoint.sh << 'EOF' && chmod +x /app/docker-entrypoint.sh && chown node:node /app/docker-entrypoint.sh
#!/bin/sh
set -e

# Create config files from environment variables
if [ -n "$PANORAMA_API_KEY" ]; then
    echo "$PANORAMA_API_KEY" > /app/config/panorama-api-key
    chmod 600 /app/config/panorama-api-key
    echo "✓ Panorama API key configured"
else
    echo "⚠ Warning: PANORAMA_API_KEY not set"
fi

if [ -n "$PANORAMA_URL" ]; then
    echo "PANORAMA_URL=$PANORAMA_URL" > /app/config/panorama-config
    chmod 644 /app/config/panorama-config
    echo "✓ Panorama URL configured: $PANORAMA_URL"
else
    echo "⚠ Warning: PANORAMA_URL not set"
fi

# Update API proxy script to use config directory
sed -i 's|/etc/palochangelogs|/app/config|g' /app/deploy/api-proxy.js
sed -i "s|__PROJECT_DIR__|/app|g" /app/deploy/api-proxy.js

# Ensure data directory exists
mkdir -p /app/data

# Start API proxy
echo "Starting PaloChangeLogs API Proxy..."
exec node /app/deploy/api-proxy.js
EOF

# Don't switch user - will be handled by docker-compose
# USER node

# Expose API proxy port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/panorama-proxy/api/db/stats', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "mkdir -p /app/frontend && cp -r /app/dist/* /app/frontend/ && chown -R node:node /app/frontend && echo \"Frontend files copied to /app/frontend\" && if [ -n \"$PANORAMA_API_KEY\" ]; then echo \"$PANORAMA_API_KEY\" > /app/config/panorama-api-key && chmod 600 /app/config/panorama-api-key && echo \"✓ Panorama API key configured\"; else echo \"⚠ Warning: PANORAMA_API_KEY not set\"; fi && if [ -n \"$PANORAMA_URL\" ]; then echo \"PANORAMA_URL=$PANORAMA_URL\" > /app/config/panorama-config && chmod 644 /app/config/panorama-config && echo \"✓ Panorama URL configured: $PANORAMA_URL\"; else echo \"⚠ Warning: PANORAMA_URL not set\"; fi && sed -i 's|/etc/palochangelogs|/app/config|g' /app/deploy/api-proxy.js && sed -i \"s|__PROJECT_DIR__|/app|g\" /app/deploy/api-proxy.js && mkdir -p /app/data && chown -R node:node /app/data /app/config && echo \"Starting PaloChangeLogs API Proxy...\" && su-exec node node /app/deploy/api-proxy.js"]
