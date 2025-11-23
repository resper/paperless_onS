"""Settings API endpoints"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from backend.database.models import Settings, EncryptedString
from backend.database.database import async_session_maker
from backend.clients.paperless import PaperlessClient
from sqlalchemy import select

router = APIRouter()


class SettingResponse(BaseModel):
    """Setting response model"""
    key: str
    value: str
    encrypted: bool
    description: Optional[str] = None


class SettingUpdateRequest(BaseModel):
    """Setting update request model"""
    key: str
    value: str


@router.get("/all", response_model=List[SettingResponse])
async def get_all_settings():
    """
    Get all settings (encrypted values are masked)

    Returns:
        List of all settings
    """
    try:
        async with async_session_maker() as session:
            result = await session.execute(select(Settings))
            settings = result.scalars().all()

            return [
                SettingResponse(
                    key=setting.key,
                    value="***ENCRYPTED***" if setting.encrypted and setting.value else (setting.value or ""),
                    encrypted=setting.encrypted,
                    description=setting.description
                )
                for setting in settings
            ]

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{key}")
async def get_setting(key: str):
    """
    Get a specific setting by key

    Args:
        key: Setting key

    Returns:
        Setting value (encrypted values are masked)
    """
    try:
        async with async_session_maker() as session:
            result = await session.execute(
                select(Settings).where(Settings.key == key)
            )
            setting = result.scalar_one_or_none()

            if not setting:
                raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")

            return SettingResponse(
                key=setting.key,
                value="***ENCRYPTED***" if setting.encrypted and setting.value else (setting.value or ""),
                encrypted=setting.encrypted,
                description=setting.description
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{key}")
async def update_setting(key: str, request: SettingUpdateRequest):
    """
    Update a setting value

    Args:
        key: Setting key
        request: Update request with new value

    Returns:
        Updated setting
    """
    try:
        encryptor = EncryptedString()

        async with async_session_maker() as session:
            result = await session.execute(
                select(Settings).where(Settings.key == key)
            )
            setting = result.scalar_one_or_none()

            if not setting:
                raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")

            # Update value
            setting.set_value(request.value, encrypt=setting.encrypted, encryptor=encryptor)
            await session.commit()

            return {
                "success": True,
                "message": f"Setting '{key}' updated successfully",
                "setting": SettingResponse(
                    key=setting.key,
                    value="***ENCRYPTED***" if setting.encrypted else request.value,
                    encrypted=setting.encrypted,
                    description=setting.description
                )
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-paperless")
async def test_paperless_connection():
    """
    Test connection to Paperless-NGX

    Returns:
        Connection test result
    """
    try:
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
                return {
                    "success": False,
                    "message": "Paperless-NGX URL or token not configured"
                }

            client = PaperlessClient(
                settings_dict["paperless_url"],
                settings_dict["paperless_token"]
            )

            test_result = await client.test_connection()
            return test_result

    except Exception as e:
        return {
            "success": False,
            "message": f"Connection test failed: {str(e)}"
        }


@router.post("/test-openai")
async def test_openai_connection():
    """
    Test OpenAI API key

    Returns:
        Connection test result
    """
    try:
        async with async_session_maker() as session:
            result = await session.execute(
                select(Settings).where(Settings.key == "openai_api_key")
            )
            setting = result.scalar_one_or_none()

            if not setting or not setting.value:
                return {
                    "success": False,
                    "message": "OpenAI API key not configured"
                }

            encryptor = EncryptedString()
            api_key = setting.get_value(encryptor)

            if not api_key or len(api_key) < 10:
                return {
                    "success": False,
                    "message": "Invalid OpenAI API key"
                }

            # Simple validation (actual test would require making an API call)
            return {
                "success": True,
                "message": "OpenAI API key is configured (not fully tested)"
            }

    except Exception as e:
        return {
            "success": False,
            "message": f"Test failed: {str(e)}"
        }
