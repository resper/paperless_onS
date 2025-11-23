"""Application settings and configuration"""

from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Application
    app_name: str = "paperless_onS"
    app_version: str = "0.1.0"
    debug: bool = False

    # Database
    database_url: str = "sqlite:///./paperless_ons.db"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    # Security
    secret_key: str = "change-this-secret-key-in-production"

    # Optional API defaults (can be overridden via web interface)
    paperless_url: str | None = None
    paperless_token: str | None = None
    openai_api_key: str | None = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Global settings instance
settings = Settings()
