#!/bin/bash

# Quick fix script for port conflict error
# Usage: sudo bash fix-port-conflict.sh [PORT]

set -e

PORT="${1:-3001}"

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root or with sudo"
    exit 1
fi

echo "Checking for processes using port $PORT..."

# Find what's using the port
PROCESS=$(lsof -ti:$PORT 2>/dev/null || ss -tlnp | grep ":$PORT " | awk '{print $6}' | cut -d',' -f2 | cut -d'=' -f2 | head -1)

if [ -z "$PROCESS" ]; then
    # Try with ss command
    PROCESS=$(ss -tlnp | grep ":$PORT " | awk '{print $6}' | head -1)
fi

if [ -n "$PROCESS" ]; then
    echo "Port $PORT is in use by:"
    echo ""
    
    # Try to get process details
    if command -v lsof &> /dev/null; then
        lsof -i:$PORT
        PID=$(lsof -ti:$PORT | head -1)
    elif command -v ss &> /dev/null; then
        ss -tlnp | grep ":$PORT "
        PID=$(ss -tlnp | grep ":$PORT " | awk '{print $6}' | cut -d',' -f2 | cut -d'=' -f2 | head -1)
    else
        PID=$(netstat -tlnp 2>/dev/null | grep ":$PORT " | awk '{print $7}' | cut -d'/' -f1 | head -1)
    fi
    
    if [ -n "$PID" ]; then
        echo ""
        echo "Process details:"
        ps -p "$PID" -o pid,user,cmd 2>/dev/null || echo "Could not get process details for PID $PID"
        echo ""
        
        # Check if it's the same service
        if ps -p "$PID" -o cmd= 2>/dev/null | grep -q "palo-changelogs\|panorama-change-sentinel"; then
            echo "This appears to be a previous instance of the Palo ChangeLogs backend."
            echo ""
            read -p "Stop the existing process? (y/n) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                kill "$PID" 2>/dev/null || true
                sleep 2
                
                # Check if it's still running
                if kill -0 "$PID" 2>/dev/null; then
                    echo "Process still running, forcing kill..."
                    kill -9 "$PID" 2>/dev/null || true
                fi
                
                echo "✓ Process stopped"
                echo ""
                echo "Restarting backend service..."
                systemctl restart palo-changelogs-backend
                sleep 2
                
                if systemctl is-active --quiet palo-changelogs-backend; then
                    echo "✓ Backend service started successfully"
                else
                    echo "⚠ Backend service may not have started. Check status:"
                    echo "  systemctl status palo-changelogs-backend"
                fi
            else
                echo "Process not stopped. Please stop it manually or change the port."
            fi
        else
            echo "Port $PORT is in use by a different process (PID: $PID)"
            echo ""
            echo "Options:"
            echo "1. Stop the process using port $PORT:"
            echo "   sudo kill $PID"
            echo ""
            echo "2. Change the backend port in /opt/palo-changelogs/.env:"
            echo "   PORT=3002  # or another available port"
            echo "   Then update NGINX upstream configuration and restart services"
        fi
    fi
else
    echo "Port $PORT appears to be free."
    echo ""
    echo "The error might be from a stale process. Try:"
    echo "  sudo systemctl restart palo-changelogs-backend"
    echo ""
    echo "Or check for zombie processes:"
    echo "  ps aux | grep palo-changelogs"
fi

