"""Document API endpoints"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from backend.services.document_processor import DocumentProcessor
from backend.clients.paperless import PaperlessClient
from backend.database.models import Settings, EncryptedString
from backend.database.database import async_session_maker
from sqlalchemy import select

router = APIRouter()


class DocumentProcessRequest(BaseModel):
    """Request model for processing a document"""
    document_id: int
    auto_update: bool = False
    text_source_mode: str = "paperless"  # "paperless" or "ai_ocr"


class MetadataUpdateRequest(BaseModel):
    """Request model for updating metadata"""
    document_id: int
    suggested_metadata: Dict[str, Any]


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


@router.get("/by-tag/{tag_id}")
async def get_documents_by_tag(tag_id: int):
    """
    Get documents filtered by tag ID

    Args:
        tag_id: Paperless-NGX tag ID

    Returns:
        List of documents
    """
    try:
        client = await get_paperless_client()
        result = await client.search_documents_by_tag(tag_id)

        if not result["success"]:
            raise HTTPException(status_code=400, detail=result.get("message"))

        return {
            "success": True,
            "count": result.get("count", 0),
            "documents": result.get("documents", [])
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/filter")
async def filter_documents(
    tags: Optional[List[int]] = Query(default=None),
    correspondent: Optional[int] = Query(default=None),
    document_type: Optional[int] = Query(default=None),
    created_after: Optional[str] = Query(default=None),
    created_before: Optional[str] = Query(default=None)
):
    """
    Filter documents by multiple criteria

    Args:
        tags: List of tag IDs (optional, multiple)
        correspondent: Correspondent ID (optional)
        document_type: Document type ID (optional)
        created_after: Date string YYYY-MM-DD (optional)
        created_before: Date string YYYY-MM-DD (optional)

    Returns:
        Filtered list of documents
    """
    try:
        client = await get_paperless_client()

        # Build query parameters for Paperless API
        params = {}

        if tags:
            # Paperless API expects tags__id__in for multiple tags
            params["tags__id__in"] = ",".join(str(t) for t in tags)

        if correspondent:
            params["correspondent__id"] = correspondent

        if document_type:
            params["document_type__id"] = document_type

        if created_after:
            params["created__date__gte"] = created_after

        if created_before:
            params["created__date__lte"] = created_before

        # Fetch filtered documents from Paperless
        result = await client.search_documents(params)

        if not result["success"]:
            raise HTTPException(status_code=400, detail=result.get("message"))

        return {
            "success": True,
            "count": result.get("count", 0),
            "documents": result.get("documents", [])
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/all")
async def get_processing_history(limit: int = 50):
    """
    Get processing history

    Args:
        limit: Maximum number of records to return

    Returns:
        List of processing history records
    """
    try:
        processor = await DocumentProcessor.from_settings()
        history = await processor.get_processing_history(limit=limit)
        return {
            "success": True,
            "count": len(history),
            "history": history
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{document_id}")
async def get_document_history(document_id: int):
    """
    Get processing history for a specific document

    Args:
        document_id: Document ID

    Returns:
        Processing history for the document
    """
    try:
        processor = await DocumentProcessor.from_settings()
        history = await processor.get_processing_history(document_id=document_id)
        return {
            "success": True,
            "document_id": document_id,
            "count": len(history),
            "history": history
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{document_id}")
async def get_document(document_id: int):
    """
    Get detailed information about a document

    Args:
        document_id: Document ID

    Returns:
        Document details
    """
    try:
        client = await get_paperless_client()
        result = await client.get_document(document_id)

        if not result["success"]:
            raise HTTPException(status_code=404, detail=result.get("message"))

        return result["document"]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process")
async def process_document(request: DocumentProcessRequest):
    """
    Process a document through OpenAI analysis

    Args:
        request: Processing request with document_id and auto_update flag

    Returns:
        Processing results with analysis and suggested metadata
    """
    try:
        processor = await DocumentProcessor.from_settings()
        result = await processor.process_document(
            document_id=request.document_id,
            auto_update=request.auto_update,
            text_source_mode=request.text_source_mode
        )

        if not result["success"]:
            raise HTTPException(status_code=400, detail=result.get("message"))

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/apply-metadata")
async def apply_metadata(request: MetadataUpdateRequest):
    """
    Apply suggested metadata to a document

    Args:
        request: Update request with document_id and suggested_metadata

    Returns:
        Update result
    """
    try:
        processor = await DocumentProcessor.from_settings()
        result = await processor.apply_suggested_metadata(
            document_id=request.document_id,
            suggested_metadata=request.suggested_metadata
        )

        if not result["success"]:
            raise HTTPException(status_code=400, detail=result.get("message"))

        return result

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
