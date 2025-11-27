#!/bin/bash
#
# Installation script for Paperless-onS production deployment
# This script sets up systemd service and log rotation
#
# Usage: sudo ./deployment/install-production.sh
#

set -e  # Exit on error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

# Get the actual user who ran sudo
ACTUAL_USER="${SUDO_USER:-$USER}"
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)

# Try to detect project directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}=== Paperless-onS Production Installation ===${NC}\n"

# Verify project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}Error: Could not detect project directory${NC}"
    echo "Please run this script from the deployment directory:"
    echo "  cd paperless_onS/deployment"
    echo "  sudo ./install-production.sh"
    exit 1
fi

echo "Project directory: $PROJECT_DIR"
echo "Running as user: $ACTUAL_USER"
echo ""

# Step 1: Install gunicorn if not already installed
echo -e "${YELLOW}[1/6] Checking for gunicorn...${NC}"
if ! "$PROJECT_DIR/venv/bin/pip" show gunicorn > /dev/null 2>&1; then
    echo "Installing gunicorn..."
    "$PROJECT_DIR/venv/bin/pip" install gunicorn
else
    echo "Gunicorn already installed"
fi

# Step 2: Create log directory
echo -e "${YELLOW}[2/6] Creating log directory...${NC}"
mkdir -p /var/log/paperless_ons
chown "$ACTUAL_USER:$ACTUAL_USER" /var/log/paperless_ons
chmod 755 /var/log/paperless_ons
echo "Created: /var/log/paperless_ons"

# Step 3: Install systemd service
echo -e "${YELLOW}[3/6] Installing systemd service...${NC}"
# Replace placeholders in service file
sed -e "s|__USER__|$ACTUAL_USER|g" \
    -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    "$PROJECT_DIR/deployment/paperless-ons.service" > /etc/systemd/system/paperless-ons.service
systemctl daemon-reload
echo "Installed: /etc/systemd/system/paperless-ons.service"

# Step 4: Install logrotate configuration
echo -e "${YELLOW}[4/6] Installing logrotate configuration...${NC}"
# Replace placeholders in logrotate config
sed -e "s|__USER__|$ACTUAL_USER|g" \
    "$PROJECT_DIR/deployment/logrotate.conf" > /etc/logrotate.d/paperless-ons
chmod 644 /etc/logrotate.d/paperless-ons
echo "Installed: /etc/logrotate.d/paperless-ons"

# Step 5: Test logrotate configuration
echo -e "${YELLOW}[5/6] Testing logrotate configuration...${NC}"
if logrotate -d /etc/logrotate.d/paperless-ons > /dev/null 2>&1; then
    echo "Logrotate configuration is valid"
else
    echo -e "${RED}Warning: Logrotate configuration has errors${NC}"
fi

# Step 6: Enable and start service
echo -e "${YELLOW}[6/6] Service management...${NC}"
echo ""
echo "Service installed successfully!"
echo ""
echo "Available commands:"
echo ""
echo -e "  ${GREEN}sudo systemctl start paperless-ons${NC}     - Start the service"
echo -e "  ${GREEN}sudo systemctl stop paperless-ons${NC}      - Stop the service"
echo -e "  ${GREEN}sudo systemctl restart paperless-ons${NC}   - Restart the service"
echo -e "  ${GREEN}sudo systemctl status paperless-ons${NC}    - Check service status"
echo -e "  ${GREEN}sudo systemctl enable paperless-ons${NC}    - Enable autostart on boot"
echo ""
echo "Log commands:"
echo ""
echo -e "  ${GREEN}sudo journalctl -u paperless-ons -f${NC}                 - Follow live logs"
echo -e "  ${GREEN}sudo journalctl -u paperless-ons -n 100${NC}             - Show last 100 lines"
echo -e "  ${GREEN}sudo journalctl -u paperless-ons --since '1 hour ago'${NC} - Show last hour"
echo -e "  ${GREEN}tail -f /var/log/paperless_ons/access.log${NC}           - Follow access log"
echo -e "  ${GREEN}tail -f /var/log/paperless_ons/error.log${NC}            - Follow error log"
echo ""
echo -e "${YELLOW}Note: Development server is still running. Stop it before starting the production service.${NC}"
echo ""

read -p "Do you want to enable and start the service now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    systemctl enable paperless-ons
    systemctl start paperless-ons
    echo ""
    echo -e "${GREEN}Service enabled and started!${NC}"
    echo ""
    echo "Checking status..."
    sleep 2
    systemctl status paperless-ons --no-pager
else
    echo ""
    echo "Service not started. You can start it later with:"
    echo "  sudo systemctl enable --now paperless-ons"
fi

echo ""
echo -e "${GREEN}Installation complete!${NC}"
