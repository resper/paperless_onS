# paperless_onS

Web application bridging Paperless-NGX and OpenAI API for automated document analysis, OCR, and metadata enrichment.

## Features

- 📄 Retrieve documents from Paperless-NGX by tags
- 🤖 Send documents to OpenAI API for analysis and text extraction
- 🏷️ Automatic metadata enrichment and updating
- 🌐 Web interface for configuration and manual processing
- 🔒 Secure storage of API credentials in SQLite database

## Installation

### Prerequisites

- Python 3.12 or higher (required by pypaperless)
- Paperless-NGX instance (v2.17+) with API access
- OpenAI API key

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd paperless_onS
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # or: venv\Scripts\activate  # Windows
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Initialize database**
   ```bash
   python -m backend.database.init_db
   ```

6. **Run the application**
   ```bash
   uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```

7. **Access web interface**
   ```
   Open http://localhost:8000 in your browser
   ```

## Configuration

Configuration can be done via:
- Environment variables in `.env` file
- Web interface (Settings page)

Required settings:
- **Paperless-NGX URL**: Your Paperless instance URL
- **Paperless API Token**: Authentication token from Paperless-NGX
- **OpenAI API Key**: Your OpenAI API key

## Usage

1. **Configure API credentials** in the web interface Settings page
2. **Select a tag** to filter documents from Paperless-NGX
3. **Review listed documents**
4. **Click "Process"** on individual documents to send to OpenAI for analysis
5. **Review and confirm** metadata updates before applying to Paperless-NGX

## Production Deployment

For production use, deploy with systemd service management and automatic log rotation.

### Quick Installation

```bash
# Navigate to deployment directory
cd deployment

# Run installation script
sudo ./install-production.sh
```

The script will:
- Install gunicorn with Uvicorn workers
- Create log directory `/var/log/paperless_ons`
- Install systemd service
- Configure automatic log rotation
- Optionally start and enable the service

### Manual Installation

If you prefer manual setup, see the detailed guide in [`deployment/README.md`](deployment/README.md).

### Service Management

```bash
# Start service
sudo systemctl start paperless-ons

# Stop service
sudo systemctl stop paperless-ons

# Restart service
sudo systemctl restart paperless-ons

# Check status
sudo systemctl status paperless-ons

# Enable autostart on boot
sudo systemctl enable paperless-ons

# View live logs
sudo journalctl -u paperless-ons -f
```

### Log Files

Logs are automatically rotated daily:
- **Access logs**: `/var/log/paperless_ons/access.log` (14 days retention)
- **Error logs**: `/var/log/paperless_ons/error.log` (30 days retention)
- **System logs**: `sudo journalctl -u paperless-ons`

```bash
# View access log
tail -f /var/log/paperless_ons/access.log

# View error log
tail -f /var/log/paperless_ons/error.log

# View systemd journal
sudo journalctl -u paperless-ons -n 100
```

### Reverse Proxy Setup

For production, use a reverse proxy (nginx or Caddy) with SSL/TLS.

#### Nginx Example

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Caddy Example

```
your-domain.com {
    reverse_proxy localhost:8000
}
```

### Security Recommendations

1. **Change SECRET_KEY** in `.env` for production
2. **Use HTTPS** with valid SSL certificates
3. **Configure firewall** to restrict access
4. **Regular backups** of database file
5. **Keep system updated**

See [`deployment/README.md`](deployment/README.md) for comprehensive production documentation including:
- Detailed installation steps
- Configuration options
- Monitoring and troubleshooting
- Performance tuning
- Backup strategies

## Project Structure

```
paperless_onS/
├── backend/
│   ├── api/              # FastAPI endpoints
│   ├── clients/          # Paperless & OpenAI API clients
│   ├── database/         # SQLite models & schemas
│   ├── services/         # Business logic
│   └── config/           # Configuration management
├── frontend/
│   ├── static/           # CSS, JavaScript
│   └── templates/        # HTML templates
└── requirements.txt      # Python dependencies
```

## License

MIT License

## Support

For issues and questions, please open an issue in the repository.
