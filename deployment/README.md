# Production Deployment Guide

This directory contains configuration files and scripts for deploying Paperless-onS in a production environment.

## Overview

The production setup includes:
- **systemd service** for process management
- **Log rotation** with logrotate
- **Gunicorn** as WSGI server with Uvicorn workers
- **Structured logging** to files

## Quick Installation

```bash
# Run the installation script
sudo ./deployment/install-production.sh
```

The script will:
1. Install gunicorn (if not already installed)
2. Create log directory `/var/log/paperless_ons`
3. Install systemd service
4. Configure log rotation
5. Optionally start the service

## Manual Installation

If you prefer to install manually:

### 1. Install Dependencies

```bash
# Activate virtual environment
source venv/bin/activate

# Install gunicorn
pip install gunicorn
```

### 2. Create Log Directory

```bash
sudo mkdir -p /var/log/paperless_ons
sudo chown $USER:$USER /var/log/paperless_ons
sudo chmod 755 /var/log/paperless_ons
```

### 3. Install systemd Service

```bash
# Copy service file
sudo cp deployment/paperless-ons.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable paperless-ons

# Start service
sudo systemctl start paperless-ons
```

### 4. Install Log Rotation

```bash
# Copy logrotate configuration
sudo cp deployment/logrotate.conf /etc/logrotate.d/paperless-ons

# Test configuration
sudo logrotate -d /etc/logrotate.d/paperless-ons
```

## Service Management

### Basic Commands

```bash
# Start service
sudo systemctl start paperless-ons

# Stop service
sudo systemctl stop paperless-ons

# Restart service
sudo systemctl restart paperless-ons

# Reload service (graceful restart)
sudo systemctl reload paperless-ons

# Check status
sudo systemctl status paperless-ons

# Enable autostart
sudo systemctl enable paperless-ons

# Disable autostart
sudo systemctl disable paperless-ons
```

### View Logs

#### Using journalctl (systemd logs)

```bash
# Follow live logs
sudo journalctl -u paperless-ons -f

# Show last 100 lines
sudo journalctl -u paperless-ons -n 100

# Show logs since specific time
sudo journalctl -u paperless-ons --since "2025-01-01"
sudo journalctl -u paperless-ons --since "1 hour ago"
sudo journalctl -u paperless-ons --since "yesterday"

# Show only errors
sudo journalctl -u paperless-ons -p err

# Export logs to file
sudo journalctl -u paperless-ons > /tmp/paperless-ons.log
```

#### Using log files directly

```bash
# Follow access log
tail -f /var/log/paperless_ons/access.log

# Follow error log
tail -f /var/log/paperless_ons/error.log

# View last 100 lines
tail -n 100 /var/log/paperless_ons/error.log

# Search for errors
grep -i error /var/log/paperless_ons/error.log
```

## Log Rotation

Logs are automatically rotated daily and compressed. Configuration:

- **Rotation**: Daily
- **Retention**:
  - Access logs: 14 days
  - Error logs: 30 days
- **Compression**: Yes (delayed by 1 day)
- **Max size**: 100 MB (rotates immediately if exceeded)

### Manual Log Rotation

```bash
# Force log rotation (for testing)
sudo logrotate -f /etc/logrotate.d/paperless-ons

# Test rotation without actually rotating
sudo logrotate -d /etc/logrotate.d/paperless-ons
```

### View Rotated Logs

```bash
# List all log files
ls -lh /var/log/paperless_ons/

# View compressed log
zcat /var/log/paperless_ons/access.log-20250115.gz | less

# Search in compressed log
zgrep "error" /var/log/paperless_ons/error.log-*.gz
```

## Configuration Files

### paperless-ons.service

Systemd service unit file. Key settings:

- **Workers**: 4 Gunicorn workers
- **Port**: 8000
- **Worker class**: UvicornWorker (for async support)
- **Timeout**: 120 seconds
- **Graceful timeout**: 30 seconds
- **Auto-restart**: Yes
- **Security**: Sandboxing enabled

To modify:
```bash
sudo nano /etc/systemd/system/paperless-ons.service
sudo systemctl daemon-reload
sudo systemctl restart paperless-ons
```

### logrotate.conf

Log rotation configuration. To modify:
```bash
sudo nano /etc/logrotate.d/paperless-ons
sudo logrotate -d /etc/logrotate.d/paperless-ons  # Test
```

## Reverse Proxy Setup

For production, use a reverse proxy (nginx or Caddy) in front of Gunicorn.

### Nginx Example

```nginx
server {
    listen 80;
    server_name paperless-ai.example.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name paperless-ai.example.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/paperless-ai.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/paperless-ai.example.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy to Gunicorn
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (if needed)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }

    # Static files (if served separately)
    location /static/ {
        alias /home/resper/projects/paperless_onS/frontend/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Install:
```bash
sudo ln -s /etc/nginx/sites-available/paperless-ons /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Caddy Example

```
paperless-ai.example.com {
    reverse_proxy localhost:8000
}
```

## Monitoring

### Check Service Health

```bash
# Service status
sudo systemctl status paperless-ons

# Is service running?
sudo systemctl is-active paperless-ons

# Is service enabled?
sudo systemctl is-enabled paperless-ons

# Check if port is listening
sudo ss -tlnp | grep :8000
```

### Resource Usage

```bash
# CPU and memory usage
sudo systemctl status paperless-ons

# Detailed resource usage
sudo systemd-cgtop -1 | grep paperless-ons
```

### Errors and Warnings

```bash
# Recent errors
sudo journalctl -u paperless-ons -p err --since today

# Count errors today
sudo journalctl -u paperless-ons -p err --since today | wc -l
```

## Troubleshooting

### Service Won't Start

```bash
# Check service status
sudo systemctl status paperless-ons -l

# View full error log
sudo journalctl -u paperless-ons -n 50 --no-pager

# Check configuration
gunicorn --check-config backend.main:app
```

### Permission Issues

```bash
# Fix log directory permissions
sudo chown -R resper:resper /var/log/paperless_ons
sudo chmod 755 /var/log/paperless_ons
```

### Port Already in Use

```bash
# Check what's using port 8000
sudo ss -tlnp | grep :8000

# Stop development server if running
# (Ctrl+C in terminal where uvicorn is running)
```

### Database Issues

```bash
# Check database file permissions
ls -l /home/resper/projects/paperless_onS/paperless_ons.db

# Fix if needed
chmod 644 /home/resper/projects/paperless_onS/paperless_ons.db
```

## Backup

Important files to backup:

```bash
# Application database
/home/resper/projects/paperless_onS/paperless_ons.db

# Environment configuration
/home/resper/projects/paperless_onS/.env

# Logs (if needed)
/var/log/paperless_ons/
```

Example backup script:
```bash
#!/bin/bash
BACKUP_DIR="/backup/paperless-ons"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup database
cp /home/resper/projects/paperless_onS/paperless_ons.db \
   "$BACKUP_DIR/paperless_ons_${DATE}.db"

# Backup config
cp /home/resper/projects/paperless_onS/.env \
   "$BACKUP_DIR/env_${DATE}.backup"

# Keep only last 30 days
find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.backup" -mtime +30 -delete
```

## Security Recommendations

1. **Change SECRET_KEY** in `.env` for production
2. **Use HTTPS** with SSL/TLS certificates
3. **Firewall**: Block direct access to port 8000, only allow reverse proxy
4. **Regular updates**: Keep system and Python packages updated
5. **Monitor logs**: Check for suspicious activity
6. **Backup**: Regular automated backups
7. **File permissions**: Restrict database and config files

## Performance Tuning

### Adjust Workers

Edit `/etc/systemd/system/paperless-ons.service`:

```
--workers 4  # Change based on CPU cores (2-4 * cores)
```

Recommended:
- 1-2 cores: 2-4 workers
- 4 cores: 8-12 workers
- 8+ cores: 16-24 workers

### Timeout Settings

```
--timeout 120           # Request timeout
--graceful-timeout 30   # Graceful shutdown time
```

### Resource Limits

In service file:
```
LimitNOFILE=65536      # Max open files
LimitNPROC=4096        # Max processes
```

## Upgrading

```bash
# Stop service
sudo systemctl stop paperless-ons

# Backup database
cp paperless_ons.db paperless_ons.db.backup

# Pull updates
git pull

# Update dependencies
source venv/bin/activate
pip install -r requirements.txt --upgrade

# Run migrations if any
python -m backend.database.init_db

# Restart service
sudo systemctl start paperless-ons

# Check status
sudo systemctl status paperless-ons
```

## Uninstall

```bash
# Stop and disable service
sudo systemctl stop paperless-ons
sudo systemctl disable paperless-ons

# Remove service file
sudo rm /etc/systemd/system/paperless-ons.service
sudo systemctl daemon-reload

# Remove log rotation
sudo rm /etc/logrotate.d/paperless-ons

# Optionally remove logs
sudo rm -rf /var/log/paperless_ons
```

## Support

For issues or questions:
- Check logs: `sudo journalctl -u paperless-ons -f`
- Review documentation in `/deployment/README.md`
- Check main README.md for application-specific help
