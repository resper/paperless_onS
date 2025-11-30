# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**paperless_onS** is a production-ready web application that serves as an intelligent bridge between Paperless-NGX and OpenAI API. It enables automatic document analysis, OCR text extraction, and metadata enrichment for documents stored in Paperless-NGX.

### Key Features
- Retrieve documents from Paperless-NGX by specific tags
- Send documents to OpenAI API for analysis and metadata extraction
- OCR text recognition for PDFs using PyPDF2
- Update document metadata in Paperless-NGX with enriched data
- Web interface for configuration and manual document processing
- Secure encrypted storage of API tokens in SQLite database
- Complete API call logging for debugging and monitoring
- Processing history tracking

## Technology Stack

- **Backend**: Python 3.12+ with FastAPI
- **Frontend**: HTML/CSS/JavaScript with Bootstrap 5
- **Database**: SQLite with SQLAlchemy (async)
- **API Integrations**:
  - Paperless-NGX via `pypaperless` library (official async client)
  - OpenAI Python SDK (latest)
- **Key Libraries**:
  - `pypaperless` - Official Paperless-NGX async client
  - `openai` - OpenAI API client
  - `cryptography` - Fernet encryption for API tokens
  - `PyPDF2` - PDF text extraction
  - `aiosqlite` - Async SQLite support

## Architecture

The application follows a clean, modular architecture with clear separation of concerns:

### Backend Structure
```
backend/
├── api/                      # FastAPI endpoints (REST API for frontend)
│   ├── __init__.py
│   ├── documents.py          # Document operations (search, process, update)
│   ├── settings_api.py       # Settings CRUD and connection testing
│   └── tags.py               # Tag listing from Paperless-NGX
├── clients/                  # API clients
│   ├── __init__.py
│   ├── paperless.py          # Paperless-NGX API client (pypaperless wrapper)
│   └── openai_client.py      # OpenAI document analyzer
├── database/                 # SQLite models and schemas
│   ├── __init__.py
│   ├── database.py           # Async database configuration
│   ├── models.py             # SQLAlchemy models (Settings, ProcessingHistory, ApiLog)
│   └── init_db.py            # Database initialization script
├── services/                 # Business logic layer
│   ├── __init__.py
│   └── document_processor.py # Document processing pipeline orchestration
├── config/                   # Configuration management
│   ├── __init__.py
│   └── settings.py           # Pydantic settings with .env support
├── __init__.py
└── main.py                   # FastAPI application entry point
```

### Frontend Structure
```
frontend/
├── static/
│   ├── css/
│   │   └── style.css         # Custom styling
│   └── js/
│       └── app.js            # Frontend JavaScript application
└── templates/
    └── index.html            # Main web interface (SPA-style)
```

### Data Flow
1. **Configuration**: User configures API credentials via web interface → encrypted and stored in SQLite
2. **Document Discovery**: User selects tag → backend queries Paperless-NGX API for matching documents
3. **Document Display**: Documents listed in web interface with metadata preview
4. **AI Processing**: User triggers processing → document downloaded → sent to OpenAI API
5. **Results**: OpenAI returns analysis/metadata → displayed in modal for user review
6. **Update**: User confirms → backend updates Paperless-NGX with new metadata

## Development Commands

### Setup
```bash
# Create virtual environment (requires Python 3.12+)
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment template (optional)
cp .env.example .env
```

### Database Initialization
```bash
# Initialize database with default settings
python -m backend.database.init_db

# This creates:
# - paperless_ons.db SQLite file
# - Settings table with encrypted fields
# - ProcessingHistory and ApiLog tables
```

### Running the Application
```bash
# Development server with auto-reload
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Production with Gunicorn (install separately)
gunicorn backend.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Access Points
- **Web Interface**: http://localhost:8000/app
- **API Documentation**: http://localhost:8000/docs
- **OpenAPI Schema**: http://localhost:8000/openapi.json
- **Health Check**: http://localhost:8000/health

## Key Integration Points

### Paperless-NGX API (via pypaperless)
- **Library**: `pypaperless` - Official async Python client for Paperless-NGX
- **Repository**: https://github.com/tb1337/paperless-api
- **Authentication**: Token-based authentication
- **Key Operations**:
  - `client.documents.filter(tags=[tag_id])` - Search documents by tag
  - `client.documents.get(document_id)` - Get document details
  - `client.documents.download(document_id)` - Download document file
  - `client.documents.update(document_id, **kwargs)` - Update metadata
  - `client.tags.all()` - Iterate over all tags
- **Async Support**: Full async/await support with aiohttp
- **Requirements**: Python >=3.12, pypaperless >=1.2.1, Paperless-NGX >=2.17

**Code Reference**: `backend/clients/paperless.py:24` (PaperlessClient initialization)

### OpenAI API
- **Library**: Official OpenAI Python SDK
- **Used for**: Document analysis, metadata extraction, OCR
- **Models**: GPT-4 Turbo (default), GPT-3.5 Turbo (configurable)
- **Primary Use Cases**:
  - PDF text extraction and analysis
  - Metadata generation (title, summary, tags, correspondent)
  - Document type classification
  - Key information extraction

**Code Reference**: `backend/clients/openai_client.py:18` (OpenAIDocumentAnalyzer)

## REST API Endpoints

### Documents
- `GET /api/documents/by-tag/{tag_id}` - Get documents filtered by tag
- `GET /api/documents/{document_id}` - Get document details
- `POST /api/documents/process` - Process document through OpenAI
- `POST /api/documents/apply-metadata` - Apply suggested metadata to Paperless
- `GET /api/documents/history/all` - Get processing history
- `GET /api/documents/history/{document_id}` - Get document-specific history

### Tags
- `GET /api/tags/all` - Get all available tags from Paperless-NGX

### Settings
- `GET /api/settings/all` - Get all settings (encrypted values masked)
- `GET /api/settings/{key}` - Get specific setting
- `PUT /api/settings/{key}` - Update setting value
- `POST /api/settings/test-paperless` - Test Paperless-NGX connection
- `POST /api/settings/test-openai` - Validate OpenAI API key

### Application
- `GET /` - API information and endpoint list
- `GET /health` - Health check endpoint
- `GET /app` - Serve web interface
- `GET /docs` - Interactive API documentation (Swagger UI)

## Database Schema

### Settings Table
```python
id: Integer (Primary Key)
key: String(100) - Setting key (unique, indexed)
value: Text - Setting value (encrypted if encrypted=True)
encrypted: Boolean - Whether value is encrypted
description: String(255) - Human-readable description
updated_at: DateTime - Last update timestamp
created_at: DateTime - Creation timestamp
```

**Default Settings**:
- `paperless_url` - Paperless-NGX server URL
- `paperless_token` - Paperless API token (encrypted)
- `openai_api_key` - OpenAI API key (encrypted)
- `default_tag_id` - Default tag for filtering
- `openai_model` - OpenAI model name
- `auto_update_metadata` - Auto-update flag

### ProcessingHistory Table
```python
id: Integer (Primary Key)
document_id: Integer - Paperless document ID (indexed)
document_title: String(255) - Document title
tag_id: Integer - Tag used to find document
status: String(50) - pending|processing|completed|failed
openai_response: JSON - Full OpenAI analysis result
error_message: Text - Error details if failed
metadata_updated: Boolean - Whether metadata was applied
processed_at: DateTime - Processing timestamp
created_at: DateTime - Creation timestamp
```

### ApiLog Table
```python
id: Integer (Primary Key)
service: String(50) - paperless|openai (indexed)
endpoint: String(255) - API endpoint called
method: String(10) - HTTP method (GET, POST, PATCH, etc.)
status_code: Integer - HTTP status code
request_data: JSON - Request payload
response_data: JSON - Response payload
error_message: Text - Error details
duration_ms: Integer - Request duration in milliseconds
created_at: DateTime - Log timestamp (indexed)
```

## Configuration Storage

### Encryption
- **Algorithm**: Fernet (symmetric encryption)
- **Key Derivation**: Secret key from settings (configurable via .env)
- **Encrypted Fields**: API tokens, passwords, sensitive credentials
- **Implementation**: `backend/database/models.py:15` (EncryptedString class)

### Environment Variables (.env)
```bash
APP_NAME=paperless_onS
APP_VERSION=0.1.0
DEBUG=false
DATABASE_URL=sqlite:///./paperless_ons.db
HOST=0.0.0.0
PORT=8000
SECRET_KEY=change-this-in-production

# Optional: Override via web interface
PAPERLESS_URL=http://localhost:8000
PAPERLESS_TOKEN=your-token
OPENAI_API_KEY=your-key
```

## Security Considerations

### Data Protection
- API tokens stored encrypted using Fernet (AES-128 in CBC mode)
- No hardcoded credentials in source code
- All sensitive data configurable via web interface
- Environment variables supported for production deployment
- SQLite database should have restricted file permissions

### Best Practices
1. **Change SECRET_KEY** in production (used for encryption)
2. **Restrict database file access** (chmod 600 paperless_ons.db)
3. **Use HTTPS** in production with reverse proxy
4. **Rotate API tokens** regularly
5. **Monitor API logs** for unusual activity
6. **Backup database** regularly (contains settings and history)

## Error Handling

### Client Errors
All API clients implement comprehensive error handling:
- Connection timeouts
- Authentication failures
- Invalid responses
- Network errors

**Code Reference**: `backend/clients/paperless.py:54` (test_connection method)

### API Logging
All API calls are logged to the database for debugging:
- Request/response payloads
- Status codes
- Error messages
- Execution duration

**Code Reference**: `backend/database/models.py:71` (ApiLog model)

## Common Development Tasks

### Adding a New Setting
1. Add default value in `backend/database/init_db.py:15`
2. Update settings form in `frontend/templates/index.html`
3. Add handling in `frontend/static/js/app.js`

### Modifying Document Processing
**Main Pipeline**: `backend/services/document_processor.py:52` (process_document method)

Steps:
1. Fetch document from Paperless
2. Download document content
3. Analyze with OpenAI
4. Save results to database
5. Optionally update metadata

### Adding New API Endpoints
1. Create endpoint in appropriate file under `backend/api/`
2. Include router in `backend/main.py:30`
3. Add frontend handler in `frontend/static/js/app.js`

## Troubleshooting

### Database Issues
```bash
# Reset database
rm paperless_ons.db
python -m backend.database.init_db
```

### Connection Errors
- **Paperless-NGX**: Check URL format (include http://), verify token
- **OpenAI**: Verify API key format (starts with sk-)
- Use test endpoints: `/api/settings/test-paperless` and `/api/settings/test-openai`

### Import Errors
```bash
# Ensure virtual environment is activated
source venv/bin/activate  # Linux/Mac

# Reinstall dependencies
pip install -r requirements.txt --force-reinstall
```

### Python Version
```bash
# Check Python version (must be 3.12+)
python --version

# If too old, use specific Python version
python3.12 -m venv venv
```

## Change Logging Protocol

**IMPORTANT**: All structural or fundamental changes must be logged in `AGENTS.log` with:
1. Date (YYYY-MM-DD format)
2. Summary of changes
3. Files/components modified
4. Reason for changes
5. Impact on functionality

**IMPORTANT**: Update this CLAUDE.md file when making structural changes to:
- Architecture or design patterns
- API integrations
- Database schema
- Development workflow
- Key commands or configurations
- Security practices
- Deployment procedures

## Production Deployment

### Recommended Stack
- **Reverse Proxy**: nginx or Caddy
- **Process Manager**: systemd or supervisor
- **WSGI Server**: Gunicorn with Uvicorn workers
- **SSL/TLS**: Let's Encrypt certificates
- **Firewall**: Restrict access to port 8000

### Example systemd Service
```ini
[Unit]
Description=Paperless-onS Application
After=network.target

[Service]
Type=notify
User=paperless
WorkingDirectory=/opt/paperless_onS
Environment="PATH=/opt/paperless_onS/venv/bin"
ExecStart=/opt/paperless_onS/venv/bin/gunicorn backend.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 127.0.0.1:8000

[Install]
WantedBy=multi-user.target
```

### Example nginx Configuration
```nginx
server {
    listen 80;
    server_name paperless-ai.example.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## User Interface Features

### Metadata Selection Modal (2025-11-23)

The document analysis modal provides a checkbox-based interface for selective metadata updates:

**Features**:
- **Selective Updates**: Each metadata field (title, date, correspondent, type, keywords, tags) has a checkbox
- **All Enabled by Default**: All suggested fields are pre-selected for user convenience
- **Tag Management**: Special "Clear existing tags" option controls tag behavior:
  - Unchecked (default): New tags are appended to existing tags
  - Checked: All existing tags are removed and replaced with suggested tags
- **Partial Updates**: Only checked fields are sent to Paperless-NGX
- **Visual Feedback**: Success/error messages with i18n support

**Code References**:
- Frontend: `frontend/static/js/app.js:512` (displayProcessingResults)
- Backend: `backend/services/document_processor.py:327` (apply_suggested_metadata)

### Settings Interface Organization

Settings are organized in a tabbed interface with clear separation:

**Document Processing Tab**:
- Text source mode (Paperless OCR vs Vision API)
- Text preview length
- Auto-update metadata toggle

**Automatic Processing Tab**:
- Filter tag selection
- Tag management after processing
- Auto-update settings

**Prompt Configuration Tab**:
- Modular prompt fields
- System prompt
- Saved configurations

## Performance Optimizations

### Parallel API Fetching (2025-11-23)
Metadata updates now use intelligent parallel fetching:
- Only fetches lists (correspondents/types/tags) when needed
- Multiple lists fetched concurrently using `asyncio.gather()`
- Reduces update time from ~3-5 seconds to ~1-2 seconds

**Code Reference**: `backend/services/document_processor.py:362` (parallel list fetching)

## Project Status

**Current Version**: 0.1.0
**Status**: Production Ready
**Last Updated**: 2025-11-23

### Implemented Features
✅ Paperless-NGX integration via pypaperless
✅ OpenAI document analysis with Vision API support
✅ Web-based configuration interface
✅ Encrypted credential storage
✅ Document processing pipeline
✅ Processing history tracking
✅ Comprehensive API logging
✅ REST API with documentation
✅ Error handling and validation
✅ Checkbox-based metadata selection
✅ Partial metadata updates
✅ Tag append/replace modes
✅ Parallel API optimization
✅ Multilingual UI (German/English)
✅ Modular prompt system

### Future Enhancements (Optional)
- Batch document processing
- Tag list caching for faster updates
- Document type mapping
- Tag auto-creation
- Scheduled processing jobs
- Email notifications
- Multi-user support
- Docker containerization

## Resources

- **Paperless-NGX Docs**: https://docs.paperless-ngx.com/
- **pypaperless GitHub**: https://github.com/tb1337/paperless-api
- **OpenAI API Docs**: https://platform.openai.com/docs/
- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **SQLAlchemy Docs**: https://docs.sqlalchemy.org/
