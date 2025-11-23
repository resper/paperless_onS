"""Correspondents API endpoints"""

from fastapi import APIRouter, HTTPException

from backend.database.models import Settings, EncryptedString
from backend.database.database import async_session_maker
from backend.clients.paperless import PaperlessClient
from sqlalchemy import select

router = APIRouter()


async def get_paperless_client() -> PaperlessClient:
    """Get configured Paperless client from settings"""
    async with async_session_maker() as session:
        result = await session.execute(
            select(Settings).where(
                Settings.key.in_(["paperless_url", "paperless_token"])
            )
        )
        settings_list = result.scalars().all()
        settings_dict = {}
        encryptor = EncryptedString()

        for setting in settings_list:
            settings_dict[setting.key] = setting.get_value(encryptor)

        if not settings_dict.get("paperless_url") or not settings_dict.get("paperless_token"):
            raise HTTPException(
                status_code=400,
                detail="Paperless-NGX not configured. Please configure in settings."
            )

        return PaperlessClient(
            settings_dict["paperless_url"],
            settings_dict["paperless_token"]
        )


@router.get("/all")
async def get_all_correspondents():
    """
    Get all available correspondents from Paperless-NGX

    Returns:
        List of correspondents
    """
    try:
        client = await get_paperless_client()
        result = await client.get_correspondents()

        if not result["success"]:
            raise HTTPException(status_code=400, detail=result.get("message"))

        return {
            "success": True,
            "count": result.get("count", 0),
            "correspondents": result.get("correspondents", [])
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
