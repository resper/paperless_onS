"""Main FastAPI application"""

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from pathlib import Path

from backend.config.settings import settings
from backend.database.database import init_database
from backend.api import documents, settings_api, tags, prompts, correspondents, document_types, storage_paths

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Web application bridging Paperless-NGX and OpenAI API"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["settings"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
app.include_router(prompts.router, prefix="/api/prompts", tags=["prompts"])
app.include_router(correspondents.router, prefix="/api/correspondents", tags=["correspondents"])
app.include_router(document_types.router, prefix="/api/document-types", tags=["document-types"])
app.include_router(storage_paths.router, prefix="/api/storage-paths", tags=["storage-paths"])

# Mount static files
static_path = Path(__file__).parent.parent / "frontend" / "static"
static_path.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

# Mount i18n files
i18n_path = Path(__file__).parent.parent / "frontend" / "static" / "i18n"
i18n_path.mkdir(parents=True, exist_ok=True)
app.mount("/i18n", StaticFiles(directory=str(i18n_path)), name="i18n")

# Setup templates
templates_path = Path(__file__).parent.parent / "frontend" / "templates"
templates_path.mkdir(parents=True, exist_ok=True)
templates = Jinja2Templates(directory=str(templates_path))


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    await init_database()
    print(f"✓ {settings.app_name} v{settings.app_version} started")
    print(f"✓ Database initialized")
    print(f"✓ Server running on http://{settings.host}:{settings.port}")


@app.get("/")
async def root():
    """Redirect to web application"""
    return RedirectResponse(url="/app")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": settings.app_version
    }


@app.get("/app", response_class=HTMLResponse)
async def web_app(request: Request):
    """Serve the web application interface"""
    return templates.TemplateResponse("index.html", {"request": request})
