"""Prompt management API endpoints"""

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional

from backend.database.models import Settings, EncryptedString, PromptConfiguration
from backend.database.database import async_session_maker
from backend.clients.paperless import PaperlessClient
from backend.clients.openai_client import OpenAIDocumentAnalyzer
from backend.i18n import get_translator
from sqlalchemy import select

router = APIRouter()


class PromptTestRequest(BaseModel):
    """Request model for prompt testing"""
    document_id: int
    prompt_template: Optional[str] = None
    system_prompt: Optional[str] = None


@router.get("/placeholders")
async def get_placeholders(accept_language: Optional[str] = Header(default="en")):
    """
    Get available placeholders for prompt template

    Returns:
        List of available placeholders with descriptions
    """
    # Parse language from Accept-Language header
    language = accept_language.split(',')[0].split('-')[0].lower() if accept_language else "en"
    if language not in ["en", "de"]:
        language = "en"

    # Get translator
    translator = get_translator(language)

    # Get all placeholder translations
    placeholder_translations = translator.get_all("placeholders")

    placeholders = []
    for key in ["filename", "current_title", "extracted_text", "text_length", "max_text_length",
                "available_correspondents", "available_document_types", "available_storage_paths", "available_tags"]:
        placeholder_data = placeholder_translations.get(key, {})
        placeholders.append({
            "placeholder": f"{{{key}}}",
            "description": placeholder_data.get("description", key),
            "example": placeholder_data.get("example", "")
        })

    return {
        "success": True,
        "placeholders": placeholders
    }


@router.post("/test")
async def test_prompt(request: PromptTestRequest):
    """
    Test prompt with a real document and show the generated prompt

    Args:
        request: Document ID and optional custom prompt template

    Returns:
        Generated prompt with actual document data
    """
    try:
        # Get settings from database
        async with async_session_maker() as session:
            result = await session.execute(
                select(Settings).where(
                    Settings.key.in_([
                        "paperless_url",
                        "paperless_token",
                        "prompt_template",
                        "prompt_system",
                        "max_text_length"
                    ])
                )
            )
            settings_list = result.scalars().all()

            settings_dict = {}
            encryptor = EncryptedString()

            for setting in settings_list:
                settings_dict[setting.key] = setting.get_value(encryptor)

            # Validate Paperless settings
            if not settings_dict.get("paperless_url") or not settings_dict.get("paperless_token"):
                raise HTTPException(
                    status_code=400,
                    detail="Paperless-NGX not configured"
                )

        # Get document from Paperless
        paperless_client = PaperlessClient(
            settings_dict["paperless_url"],
            settings_dict["paperless_token"]
        )

        doc_result = await paperless_client.get_document(request.document_id)

        if not doc_result["success"]:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to get document: {doc_result.get('message')}"
            )

        document = doc_result["document"]

        # Download document content
        download_result = await paperless_client.download_document(request.document_id)

        if not download_result["success"]:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to download document: {download_result.get('message')}"
            )

        # Get available correspondents from Paperless
        correspondents_result = await paperless_client.get_correspondents()
        available_correspondents = []
        if correspondents_result["success"]:
            available_correspondents = correspondents_result["correspondents"]

        # Get available document types from Paperless
        doc_types_result = await paperless_client.get_document_types()
        available_document_types = []
        if doc_types_result["success"]:
            available_document_types = doc_types_result["document_types"]

        # Get available tags from Paperless
        tags_result = await paperless_client.get_tags()
        available_tags = []
        if tags_result["success"]:
            available_tags = tags_result["tags"]

        # Create temporary analyzer to build prompt
        analyzer = OpenAIDocumentAnalyzer(
            api_key="dummy",  # Not used for prompt building
            prompt_template=request.prompt_template or settings_dict.get("prompt_template"),
            system_prompt=request.system_prompt or settings_dict.get("prompt_system"),
            max_text_length=int(settings_dict.get("max_text_length", "10000"))
        )

        # Use text already extracted by Paperless-NGX (no redundant extraction)
        extracted_text = document.get("content", "") or "No text extracted by Paperless-NGX"

        # Build the prompt
        prompt = analyzer._build_analysis_prompt(
            extracted_text=extracted_text,
            current_title=document.get("title", ""),
            current_content=document.get("content", ""),
            filename=download_result.get("filename", "document.pdf"),
            available_correspondents=available_correspondents,
            available_document_types=available_document_types,
            available_tags=available_tags
        )

        return {
            "success": True,
            "document": {
                "id": request.document_id,
                "title": document.get("title"),
                "filename": download_result.get("filename")
            },
            "system_prompt": analyzer.system_prompt,
            "user_prompt": prompt,
            "text_stats": {
                "extracted_length": len(extracted_text),
                "preview_length": min(len(extracted_text), analyzer.max_text_length),
                "max_text_length": analyzer.max_text_length
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/template/default")
async def get_default_template():
    """Get the default prompt template"""
    default_template = '''Analyze the following document and provide structured metadata.

**Available Correspondents in Paperless-NGX:**
{available_correspondents}

**Available Document Types in Paperless-NGX:**
{available_document_types}

**Available Tags in Paperless-NGX:**
{available_tags}

**Please provide:**

1. **Document Date**: When was this document created or issued? (format: YYYY-MM-DD, e.g., 2024-03-15)
2. **Correspondent**: Who is this document from/to? (company, person, or organization name)
   - If possible, use one of the available correspondents listed above
   - Only create a new correspondent name if the document is from someone not in the list
3. **Document Type**: What type of document is this?
   - If possible, use one of the available document types listed above
   - Only create a new document type if none of the existing ones match
4. **Content Keywords**: 1-3 keywords describing WHAT the document is about (max 3 words)
   - DO NOT repeat the document type in keywords
   - Describe the CONTENT/PURPOSE, not the type
   - Examples:
     * If Type is "Invoice" → Keywords could be: "Solar Panel Installation" or "Office Supplies Toner"
     * If Type is "Quote" → Keywords could be: "Window Replacement Double-Glazing"
     * If Type is "Receipt" → Keywords could be: "Payment Bank Transfer"
5. **Suggested Title**: Create a title in this exact format: YYYY-MM-DD - Correspondent - Document Type - Content Keywords
   Example: "2025-07-09 - Energy Solutions Ltd - Invoice - Solar Panel Storage"
6. **Suggested Tags**: 3-5 relevant tags that would help categorize this document
   - Prefer using existing tags from the list above when they match the document content
   - Only suggest new tags if none of the existing tags are appropriate'''

    default_system = "You are a document analysis assistant. Analyze documents and extract metadata in a structured format."

    return {
        "success": True,
        "template": default_template,
        "system_prompt": default_system
    }


class ModularPromptTestRequest(BaseModel):
    """Request model for testing modular prompts"""
    document_id: int
    document_date: Optional[str] = ""
    correspondent: Optional[str] = ""
    document_type: Optional[str] = ""
    storage_path: Optional[str] = ""
    content_keywords: Optional[str] = ""
    suggested_title: Optional[str] = ""
    suggested_tag: Optional[str] = ""
    free_instructions: Optional[str] = ""


class ModularPromptsRequest(BaseModel):
    """Request model for saving modular prompts"""
    document_date: Optional[str] = ""
    correspondent: Optional[str] = ""
    document_type: Optional[str] = ""
    storage_path: Optional[str] = ""
    content_keywords: Optional[str] = ""
    suggested_title: Optional[str] = ""
    suggested_tag: Optional[str] = ""
    free_instructions: Optional[str] = ""
    use_json_mode: Optional[bool] = True


@router.get("/modular")
async def get_modular_prompts():
    """Get modular prompt configuration"""
    try:
        async with async_session_maker() as session:
            result = await session.execute(
                select(Settings).where(
                    Settings.key.in_([
                        "prompt_document_date",
                        "prompt_correspondent",
                        "prompt_document_type",
                        "prompt_storage_path",
                        "prompt_content_keywords",
                        "prompt_suggested_title",
                        "prompt_suggested_tag",
                        "prompt_free_instructions",
                        "use_json_mode"
                    ])
                )
            )
            settings_list = result.scalars().all()

            settings_dict = {}
            encryptor = EncryptedString()

            for setting in settings_list:
                settings_dict[setting.key] = setting.get_value(encryptor)

        return {
            "success": True,
            "modular_prompts": {
                "document_date": settings_dict.get("prompt_document_date", ""),
                "correspondent": settings_dict.get("prompt_correspondent", ""),
                "document_type": settings_dict.get("prompt_document_type", ""),
                "storage_path": settings_dict.get("prompt_storage_path", ""),
                "content_keywords": settings_dict.get("prompt_content_keywords", ""),
                "suggested_title": settings_dict.get("prompt_suggested_title", ""),
                "suggested_tag": settings_dict.get("prompt_suggested_tag", ""),
                "free_instructions": settings_dict.get("prompt_free_instructions", ""),
                "use_json_mode": settings_dict.get("use_json_mode", "true").lower() == "true"
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/modular")
async def save_modular_prompts(request: ModularPromptsRequest):
    """Save modular prompt configuration"""
    try:
        async with async_session_maker() as session:
            encryptor = EncryptedString()

            # Map of fields to save
            prompt_fields = {
                "prompt_document_date": request.document_date or "",
                "prompt_correspondent": request.correspondent or "",
                "prompt_document_type": request.document_type or "",
                "prompt_storage_path": request.storage_path or "",
                "prompt_content_keywords": request.content_keywords or "",
                "prompt_suggested_title": request.suggested_title or "",
                "prompt_suggested_tag": request.suggested_tag or "",
                "prompt_free_instructions": request.free_instructions or "",
                "use_json_mode": str(request.use_json_mode).lower()
            }

            # Save each field
            for key, value in prompt_fields.items():
                # Check if setting exists
                result = await session.execute(
                    select(Settings).where(Settings.key == key)
                )
                setting = result.scalar_one_or_none()

                if setting:
                    # Update existing setting
                    setting.set_value(value)
                else:
                    # Create new setting
                    new_setting = Settings(key=key)
                    new_setting.set_value(value)
                    session.add(new_setting)

            await session.commit()

        return {
            "success": True,
            "message": "Modular prompts saved successfully"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/modular/defaults")
async def get_default_modular_prompts():
    """Get default modular prompt templates"""
    defaults = {
        "document_date": "Extract the document date in YYYY-MM-DD format. Look for issue date, creation date, or document date.",
        "correspondent": "Identify who this document is from/to (company, person, or organization). Select a matching correspondent from the available correspondents list above. Only if there is no matching correspondent, suggest a new one.",
        "document_type": "Identify the document type. Select a matching document type from the available document types list above. Only if there is no matching document type, suggest a new one.",
        "storage_path": "Identify the most appropriate storage location for this document. Select a matching storage path from the available storage paths list above. If no storage path matches, leave the field empty or return null.",
        "content_keywords": "Provide 1-3 keywords (max 3 words) describing WHAT the document is about. DO NOT repeat the document type. Describe the CONTENT/PURPOSE, not the type.",
        "suggested_title": "Create a title in this exact format: YYYY-MM-DD - Correspondent - Document Type - Content Keywords. Example: '2025-01-15 - ACME Corp - Invoice - Server Hosting'",
        "suggested_tag": "Select 3-5 matching tags from the available tags list above. If there are no matching tags, suggest suitable ones. Return them as an array in the JSON response.",
        "free_instructions": "Please respond in English."
    }

    return {
        "success": True,
        "defaults": defaults
    }


@router.post("/modular/test")
async def test_modular_prompt(request: ModularPromptTestRequest):
    """
    Test modular prompts with a real document and show the generated prompt

    Args:
        request: Document ID and modular prompt fields

    Returns:
        Generated modular prompt with actual document data
    """
    try:
        # Get settings from database
        async with async_session_maker() as session:
            result = await session.execute(
                select(Settings).where(
                    Settings.key.in_([
                        "paperless_url",
                        "paperless_token",
                        "max_text_length"
                    ])
                )
            )
            settings_list = result.scalars().all()

            settings_dict = {}
            encryptor = EncryptedString()

            for setting in settings_list:
                settings_dict[setting.key] = setting.get_value(encryptor)

            # Validate Paperless settings
            if not settings_dict.get("paperless_url") or not settings_dict.get("paperless_token"):
                raise HTTPException(
                    status_code=400,
                    detail="Paperless-NGX not configured"
                )

        # Get document from Paperless
        paperless_client = PaperlessClient(
            settings_dict["paperless_url"],
            settings_dict["paperless_token"]
        )

        doc_result = await paperless_client.get_document(request.document_id)

        if not doc_result["success"]:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to get document: {doc_result.get('message')}"
            )

        document = doc_result["document"]

        # Download document content
        download_result = await paperless_client.download_document(request.document_id)

        if not download_result["success"]:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to download document: {download_result.get('message')}"
            )

        # Get available correspondents, document types, and tags from Paperless
        correspondents_result = await paperless_client.get_correspondents()
        available_correspondents = []
        if correspondents_result["success"]:
            available_correspondents = correspondents_result["correspondents"]

        doc_types_result = await paperless_client.get_document_types()
        available_document_types = []
        if doc_types_result["success"]:
            available_document_types = doc_types_result["document_types"]

        tags_result = await paperless_client.get_tags()
        available_tags = []
        if tags_result["success"]:
            available_tags = tags_result["tags"]

        # Build modular prompts dict
        modular_prompts = {
            "document_date": request.document_date,
            "correspondent": request.correspondent,
            "document_type": request.document_type,
            "storage_path": request.storage_path,
            "content_keywords": request.content_keywords,
            "suggested_title": request.suggested_title,
            "suggested_tag": request.suggested_tag,
            "free_instructions": request.free_instructions
        }

        # Create temporary analyzer to build prompt
        analyzer = OpenAIDocumentAnalyzer(
            api_key="dummy",  # Not used for prompt building
            modular_prompts=modular_prompts,
            max_text_length=int(settings_dict.get("max_text_length", "10000"))
        )

        # Use text already extracted by Paperless-NGX
        extracted_text = document.get("content", "") or "No text extracted by Paperless-NGX"

        # Build the modular prompt
        prompt = analyzer._build_modular_prompt(
            extracted_text=extracted_text,
            filename=download_result.get("filename", "document.pdf"),
            current_title=document.get("title", ""),
            available_correspondents=available_correspondents,
            available_document_types=available_document_types,
            available_tags=available_tags
        )

        return {
            "success": True,
            "document": {
                "id": request.document_id,
                "title": document.get("title"),
                "filename": download_result.get("filename")
            },
            "system_prompt": "You are a document analysis assistant. Extract metadata in JSON format.",
            "user_prompt": prompt,
            "text_stats": {
                "extracted_length": len(extracted_text),
                "preview_length": min(len(extracted_text), analyzer.max_text_length),
                "max_text_length": analyzer.max_text_length
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Prompt Configuration Management
# ============================================================================

class PromptConfigurationRequest(BaseModel):
    """Request model for saving/updating a prompt configuration"""
    name: str
    document_date: Optional[str] = ""
    correspondent: Optional[str] = ""
    document_type: Optional[str] = ""
    storage_path: Optional[str] = ""
    content_keywords: Optional[str] = ""
    suggested_title: Optional[str] = ""
    suggested_tag: Optional[str] = ""
    free_instructions: Optional[str] = ""


class PromptConfigurationResponse(BaseModel):
    """Response model for a prompt configuration"""
    id: int
    name: str
    document_date: str
    correspondent: str
    document_type: str
    storage_path: str
    content_keywords: str
    suggested_title: str
    suggested_tag: str
    free_instructions: str
    created_at: str
    updated_at: str


@router.get("/configurations")
async def get_all_configurations():
    """Get all saved prompt configurations"""
    try:
        async with async_session_maker() as session:
            result = await session.execute(
                select(PromptConfiguration).order_by(PromptConfiguration.name)
            )
            configurations = result.scalars().all()

            configs_list = []
            for config in configurations:
                configs_list.append({
                    "id": config.id,
                    "name": config.name,
                    "document_date": config.document_date or "",
                    "correspondent": config.correspondent or "",
                    "document_type": config.document_type or "",
                    "storage_path": config.storage_path or "",
                    "content_keywords": config.content_keywords or "",
                    "suggested_title": config.suggested_title or "",
                    "suggested_tag": config.suggested_tag or "",
                    "free_instructions": config.free_instructions or "",
                    "created_at": config.created_at.isoformat() if config.created_at else "",
                    "updated_at": config.updated_at.isoformat() if config.updated_at else ""
                })

            return {
                "success": True,
                "configurations": configs_list
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/configurations/{config_id}")
async def get_configuration(config_id: int):
    """Get a specific prompt configuration by ID"""
    try:
        async with async_session_maker() as session:
            result = await session.execute(
                select(PromptConfiguration).where(PromptConfiguration.id == config_id)
            )
            config = result.scalar_one_or_none()

            if not config:
                raise HTTPException(status_code=404, detail="Configuration not found")

            return {
                "success": True,
                "configuration": {
                    "id": config.id,
                    "name": config.name,
                    "document_date": config.document_date or "",
                    "correspondent": config.correspondent or "",
                    "document_type": config.document_type or "",
                    "storage_path": config.storage_path or "",
                    "content_keywords": config.content_keywords or "",
                    "suggested_title": config.suggested_title or "",
                    "suggested_tag": config.suggested_tag or "",
                    "free_instructions": config.free_instructions or "",
                    "created_at": config.created_at.isoformat() if config.created_at else "",
                    "updated_at": config.updated_at.isoformat() if config.updated_at else ""
                }
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/configurations")
async def create_configuration(request: PromptConfigurationRequest):
    """Create a new prompt configuration"""
    try:
        async with async_session_maker() as session:
            # Check if name already exists
            result = await session.execute(
                select(PromptConfiguration).where(PromptConfiguration.name == request.name)
            )
            existing = result.scalar_one_or_none()

            if existing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Configuration with name '{request.name}' already exists"
                )

            # Create new configuration
            new_config = PromptConfiguration(
                name=request.name,
                document_date=request.document_date or "",
                correspondent=request.correspondent or "",
                document_type=request.document_type or "",
                storage_path=request.storage_path or "",
                content_keywords=request.content_keywords or "",
                suggested_title=request.suggested_title or "",
                suggested_tag=request.suggested_tag or "",
                free_instructions=request.free_instructions or ""
            )

            session.add(new_config)
            await session.commit()
            await session.refresh(new_config)

            return {
                "success": True,
                "message": f"Configuration '{request.name}' created successfully",
                "configuration": {
                    "id": new_config.id,
                    "name": new_config.name
                }
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/configurations/{config_id}")
async def update_configuration(config_id: int, request: PromptConfigurationRequest):
    """Update an existing prompt configuration"""
    try:
        async with async_session_maker() as session:
            # Get existing configuration
            result = await session.execute(
                select(PromptConfiguration).where(PromptConfiguration.id == config_id)
            )
            config = result.scalar_one_or_none()

            if not config:
                raise HTTPException(status_code=404, detail="Configuration not found")

            # Check if new name conflicts with another configuration
            if config.name != request.name:
                result = await session.execute(
                    select(PromptConfiguration).where(PromptConfiguration.name == request.name)
                )
                existing = result.scalar_one_or_none()

                if existing:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Configuration with name '{request.name}' already exists"
                    )

            # Update configuration
            config.name = request.name
            config.document_date = request.document_date or ""
            config.correspondent = request.correspondent or ""
            config.document_type = request.document_type or ""
            config.storage_path = request.storage_path or ""
            config.content_keywords = request.content_keywords or ""
            config.suggested_title = request.suggested_title or ""
            config.suggested_tag = request.suggested_tag or ""
            config.free_instructions = request.free_instructions or ""

            await session.commit()

            return {
                "success": True,
                "message": f"Configuration '{request.name}' updated successfully"
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/configurations/{config_id}")
async def delete_configuration(config_id: int):
    """Delete a prompt configuration"""
    try:
        async with async_session_maker() as session:
            result = await session.execute(
                select(PromptConfiguration).where(PromptConfiguration.id == config_id)
            )
            config = result.scalar_one_or_none()

            if not config:
                raise HTTPException(status_code=404, detail="Configuration not found")

            config_name = config.name
            await session.delete(config)
            await session.commit()

            return {
                "success": True,
                "message": f"Configuration '{config_name}' deleted successfully"
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
