"""Database connection and session management"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

from backend.config.settings import settings

# Convert sqlite:/// to sqlite+aiosqlite:///
DATABASE_URL = settings.database_url.replace("sqlite://", "sqlite+aiosqlite://")

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=settings.debug,
    future=True
)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Base class for models
Base = declarative_base()


async def get_db():
    """Dependency for getting async database sessions"""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_database():
    """Initialize database tables and default settings"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Create default settings if they don't exist
    from backend.database.models import Settings
    from sqlalchemy import select

    async with async_session_maker() as session:
        # Check and create text_source_mode setting
        result = await session.execute(
            select(Settings).where(Settings.key == "text_source_mode")
        )
        setting = result.scalar_one_or_none()

        if not setting:
            setting = Settings(
                key="text_source_mode",
                value="paperless",
                encrypted=False,
                description="Text source for AI analysis: 'paperless' (OCR) or 'ai_ocr' (Vision API)"
            )
            session.add(setting)

        # Check and create display_text_length setting
        result = await session.execute(
            select(Settings).where(Settings.key == "display_text_length")
        )
        setting = result.scalar_one_or_none()

        if not setting:
            setting = Settings(
                key="display_text_length",
                value="5000",
                encrypted=False,
                description="Maximum number of characters for text preview in analysis dialog (500 - 20,000)"
            )
            session.add(setting)

        await session.commit()
