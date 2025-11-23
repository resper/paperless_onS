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
