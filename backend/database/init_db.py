"""Initialize database with default settings"""

import asyncio
from sqlalchemy import select
from backend.database.database import init_database, async_session_maker
from backend.database.models import Settings, EncryptedString


async def create_default_settings():
    """Create default configuration settings"""

    default_settings = [
        {
            "key": "paperless_url",
            "value": "",
            "encrypted": False,
            "description": "Paperless-NGX server URL (e.g., http://localhost:8000)"
        },
        {
            "key": "paperless_token",
            "value": "",
            "encrypted": True,
            "description": "Paperless-NGX API authentication token"
        },
        {
            "key": "openai_api_key",
            "value": "",
            "encrypted": True,
            "description": "OpenAI API key for document analysis"
        },
        {
            "key": "default_tag_id",
            "value": "",
            "encrypted": False,
            "description": "Default tag ID to filter documents"
        },
        {
            "key": "openai_model",
            "value": "gpt-4-vision-preview",
            "encrypted": False,
            "description": "OpenAI model to use for document analysis"
        },
        {
            "key": "auto_update_metadata",
            "value": "false",
            "encrypted": False,
            "description": "Automatically update Paperless metadata without confirmation"
        },
    ]

    async with async_session_maker() as session:
        try:
            # Check if settings already exist
            result = await session.execute(select(Settings))
            existing_settings = result.scalars().all()
            count = len(existing_settings)

            if count == 0:
                print("Creating default settings...")
                encryptor = EncryptedString()

                for setting_data in default_settings:
                    setting = Settings(
                        key=setting_data["key"],
                        encrypted=setting_data["encrypted"],
                        description=setting_data["description"]
                    )
                    setting.set_value(
                        setting_data["value"],
                        encrypt=setting_data["encrypted"],
                        encryptor=encryptor
                    )
                    session.add(setting)

                await session.commit()
                print(f"✓ Created {len(default_settings)} default settings")
            else:
                print(f"✓ Database already contains {count} settings")

        except Exception as e:
            print(f"✗ Error creating default settings: {e}")
            await session.rollback()
            raise


async def main():
    """Main initialization function"""
    print("Initializing database...")

    try:
        # Create tables
        await init_database()
        print("✓ Database tables created")

        # Create default settings
        await create_default_settings()

        print("\n✓ Database initialization complete!")
        print("\nYou can now run the application with:")
        print("  uvicorn backend.main:app --reload\n")

    except Exception as e:
        print(f"\n✗ Database initialization failed: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
