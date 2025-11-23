"""Document processing pipeline service"""

from typing import Dict, Any, Optional
from datetime import datetime

from backend.clients.paperless import PaperlessClient
from backend.clients.openai_client import OpenAIDocumentAnalyzer
from backend.database.models import ProcessingHistory, Settings, EncryptedString
from backend.database.database import async_session_maker
from sqlalchemy import select


class DocumentProcessor:
    """Service for processing documents through the Paperless -> OpenAI -> Paperless pipeline"""

    def __init__(
        self,
        paperless_url: str,
        paperless_token: str,
        openai_api_key: str,
        openai_model: str = "gpt-4-turbo-preview",
        prompt_template: Optional[str] = None,
        system_prompt: Optional[str] = None,
        max_text_length: int = 10000,
        display_text_length: int = 5000,
        use_json_mode: bool = True,
        modular_prompts: Optional[Dict[str, str]] = None
    ):
        """
        Initialize document processor

        Args:
            paperless_url: Paperless-NGX server URL
            paperless_token: Paperless API token
            openai_api_key: OpenAI API key
            openai_model: OpenAI model to use
            prompt_template: Custom prompt template (legacy)
            system_prompt: Custom system prompt
            max_text_length: Maximum characters to extract from documents
            display_text_length: Maximum characters to display in preview
            use_json_mode: Use JSON response format
            modular_prompts: Dict with modular prompt fields
        """
        self.paperless_client = PaperlessClient(paperless_url, paperless_token)
        self.openai_analyzer = OpenAIDocumentAnalyzer(
            openai_api_key,
            openai_model,
            prompt_template=prompt_template,
            system_prompt=system_prompt,
            max_text_length=max_text_length,
            use_json_mode=use_json_mode,
            modular_prompts=modular_prompts
        )
        self.display_text_length = display_text_length

    @classmethod
    async def from_settings(cls) -> "DocumentProcessor":
        """
        Create DocumentProcessor from database settings

        Returns:
            DocumentProcessor instance configured from database
        """
        async with async_session_maker() as session:
            # Get settings from database
            result = await session.execute(
                select(Settings).where(
                    Settings.key.in_([
                        "paperless_url",
                        "paperless_token",
                        "openai_api_key",
                        "openai_model",
                        "prompt_template",
                        "prompt_system",
                        "max_text_length",
                        "display_text_length",
                        "use_json_mode",
                        "prompt_document_date",
                        "prompt_correspondent",
                        "prompt_document_type",
                        "prompt_content_keywords",
                        "prompt_suggested_title",
                        "prompt_suggested_tag"
                    ])
                )
            )
            settings_list = result.scalars().all()

            # Convert to dict
            settings_dict = {}
            encryptor = EncryptedString()

            for setting in settings_list:
                settings_dict[setting.key] = setting.get_value(encryptor)

            # Validate required settings
            required = ["paperless_url", "paperless_token", "openai_api_key"]
            missing = [key for key in required if not settings_dict.get(key)]

            if missing:
                raise ValueError(f"Missing required settings: {', '.join(missing)}")

            # Build modular prompts dict
            modular_prompts = {}
            for key in ["document_date", "correspondent", "document_type", "content_keywords", "suggested_title", "suggested_tag"]:
                prompt_key = f"prompt_{key}"
                if prompt_key in settings_dict and settings_dict[prompt_key]:
                    modular_prompts[key] = settings_dict[prompt_key]

            # Check if we should use JSON mode
            use_json_mode = settings_dict.get("use_json_mode", "true").lower() == "true"

            # Use modular prompts if any are configured, otherwise use legacy template
            if modular_prompts:
                prompt_template = None  # Don't use legacy template
            else:
                prompt_template = settings_dict.get("prompt_template")

            return cls(
                paperless_url=settings_dict["paperless_url"],
                paperless_token=settings_dict["paperless_token"],
                openai_api_key=settings_dict["openai_api_key"],
                openai_model=settings_dict.get("openai_model", "gpt-4-turbo-preview"),
                prompt_template=prompt_template,
                system_prompt=settings_dict.get("prompt_system"),
                max_text_length=int(settings_dict.get("max_text_length", "10000")),
                display_text_length=int(settings_dict.get("display_text_length", "5000")),
                use_json_mode=use_json_mode,
                modular_prompts=modular_prompts
            )

    async def process_document(
        self,
        document_id: int,
        auto_update: bool = False,
        text_source_mode: str = "paperless"
    ) -> Dict[str, Any]:
        """
        Process a single document through the complete pipeline

        Args:
            document_id: Paperless document ID
            auto_update: Automatically update metadata in Paperless (default: False)
            text_source_mode: "paperless" to use OCR text from Paperless, "ai_ocr" to use Vision API

        Returns:
            Dict with processing results
        """
        # Create processing history record
        async with async_session_maker() as session:
            history = ProcessingHistory(
                document_id=document_id,
                status="processing",
                processed_at=datetime.utcnow()
            )
            session.add(history)
            await session.commit()
            history_id = history.id

        try:
            # Step 1: Get document from Paperless
            doc_result = await self.paperless_client.get_document(document_id)

            if not doc_result["success"]:
                await self._update_history_failed(
                    history_id,
                    f"Failed to get document from Paperless: {doc_result.get('message')}"
                )
                return {
                    "success": False,
                    "message": doc_result.get("message"),
                    "step": "fetch_document"
                }

            document = doc_result["document"]

            # Update history with document title
            async with async_session_maker() as session:
                result = await session.execute(
                    select(ProcessingHistory).where(ProcessingHistory.id == history_id)
                )
                history = result.scalar_one()
                history.document_title = document.get("title", "Untitled")
                await session.commit()

            # Step 2: Download document content
            download_result = await self.paperless_client.download_document(document_id)

            if not download_result["success"]:
                await self._update_history_failed(
                    history_id,
                    f"Failed to download document: {download_result.get('message')}"
                )
                return {
                    "success": False,
                    "message": download_result.get("message"),
                    "step": "download_document"
                }

            # Step 2.5: Get available correspondents from Paperless
            correspondents_result = await self.paperless_client.get_correspondents()
            available_correspondents = []
            if correspondents_result["success"]:
                available_correspondents = correspondents_result["correspondents"]

            # Step 2.6: Get available document types from Paperless
            doc_types_result = await self.paperless_client.get_document_types()
            available_document_types = []
            if doc_types_result["success"]:
                available_document_types = doc_types_result["document_types"]

            # Step 2.7: Get available tags from Paperless
            tags_result = await self.paperless_client.get_tags()
            available_tags = []
            if tags_result["success"]:
                available_tags = tags_result["tags"]

            # Step 3: Analyze document with OpenAI
            analysis_result = await self.openai_analyzer.analyze_document(
                document_content=download_result["content"],
                filename=download_result.get("filename", "document.pdf"),
                content_type=download_result.get("content_type", "application/pdf"),
                current_metadata=document,
                available_correspondents=available_correspondents,
                available_document_types=available_document_types,
                available_tags=available_tags,
                text_source_mode=text_source_mode
            )

            if not analysis_result["success"]:
                await self._update_history_failed(
                    history_id,
                    f"OpenAI analysis failed: {analysis_result.get('message')}"
                )
                return {
                    "success": False,
                    "message": analysis_result.get("message"),
                    "step": "openai_analysis"
                }

            # Step 3.5: If Vision API was used, log OCR text extraction
            if analysis_result.get("text_source") == "vision_api":
                ocr_text = analysis_result.get("extracted_text", "")
                if ocr_text and ocr_text != "[Vision API hat Text nicht separat ausgegeben]":
                    # Note: Paperless content field is read-only, so Vision API text is used for analysis only
                    print(f"ℹ️  Vision API OCR extracted {len(ocr_text)} characters (used for analysis, not saved to Paperless)")

            # Save analysis result to history
            async with async_session_maker() as session:
                result = await session.execute(
                    select(ProcessingHistory).where(ProcessingHistory.id == history_id)
                )
                history = result.scalar_one()
                history.openai_response = {
                    "analysis": analysis_result.get("analysis"),
                    "suggested_metadata": analysis_result.get("suggested_metadata"),
                    "tokens_used": analysis_result.get("tokens_used", 0)
                }
                history.status = "completed"
                await session.commit()

            # Resolve IDs to names for current metadata
            correspondent_id = document.get("correspondent")
            correspondent_name = None
            if correspondent_id:
                for c in available_correspondents:
                    if c.get("id") == correspondent_id:
                        correspondent_name = c.get("name")
                        break

            doc_type_id = document.get("document_type")
            doc_type_name = None
            if doc_type_id:
                for dt in available_document_types:
                    if dt.get("id") == doc_type_id:
                        doc_type_name = dt.get("name")
                        break

            tag_ids = document.get("tags", [])
            tag_names = []
            for tag_id in tag_ids:
                for t in available_tags:
                    if t.get("id") == tag_id:
                        tag_names.append(t.get("name"))
                        break

            # Prepare response
            response = {
                "success": True,
                "document_id": document_id,
                "document_title": document.get("title"),
                "current_metadata": {
                    "title": document.get("title"),
                    "content": document.get("content"),
                    "tags": tag_names,
                    "correspondent": correspondent_name,
                    "document_type": doc_type_name
                },
                "analysis": {
                    "extracted_text": analysis_result.get("extracted_text", "")[:self.display_text_length],
                    "full_analysis": analysis_result.get("analysis"),
                    "suggested_metadata": analysis_result.get("suggested_metadata"),
                    "tokens_used": analysis_result.get("tokens_used", 0)
                },
                "metadata_updated": False
            }

            # Step 4: Auto-update if enabled
            if auto_update:
                update_result = await self.apply_suggested_metadata(
                    document_id,
                    analysis_result.get("suggested_metadata", {})
                )
                response["metadata_updated"] = update_result.get("success", False)
                response["update_message"] = update_result.get("message")

            return response

        except Exception as e:
            await self._update_history_failed(history_id, str(e))
            return {
                "success": False,
                "message": f"Processing error: {str(e)}",
                "step": "unknown"
            }

    async def apply_suggested_metadata(
        self,
        document_id: int,
        suggested_metadata: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Apply suggested metadata to Paperless document

        Args:
            document_id: Paperless document ID
            suggested_metadata: Metadata from OpenAI analysis (can be partial)

        Returns:
            Dict with update result
        """
        try:
            # Get current document to preserve unselected fields
            doc_result = await self.paperless_client.get_document(document_id)
            if not doc_result["success"]:
                return {
                    "success": False,
                    "message": f"Failed to get document: {doc_result.get('message')}"
                }

            current_doc = doc_result["document"]

            # Prepare update payload with only the fields that are provided
            update_data = {}

            if "title" in suggested_metadata:
                update_data["title"] = suggested_metadata["title"]

            if "document_date" in suggested_metadata:
                update_data["created"] = suggested_metadata["document_date"]

            # Fetch only the lists we actually need
            need_correspondents = "correspondent" in suggested_metadata
            need_doc_types = "document_type" in suggested_metadata
            need_tags = "suggested_tags" in suggested_metadata

            # Fetch lists in parallel if multiple are needed
            correspondents = []
            document_types = []
            tags = []

            if need_correspondents or need_doc_types or need_tags:
                # Fetch needed lists concurrently
                import asyncio
                tasks = []

                if need_correspondents:
                    tasks.append(self.paperless_client.get_correspondents())
                if need_doc_types:
                    tasks.append(self.paperless_client.get_document_types())
                if need_tags:
                    tasks.append(self.paperless_client.get_tags())

                results = await asyncio.gather(*tasks)

                # Distribute results
                result_idx = 0
                if need_correspondents:
                    if results[result_idx]["success"]:
                        correspondents = results[result_idx]["correspondents"]
                    result_idx += 1
                if need_doc_types:
                    if results[result_idx]["success"]:
                        document_types = results[result_idx]["document_types"]
                    result_idx += 1
                if need_tags:
                    if results[result_idx]["success"]:
                        tags = results[result_idx]["tags"]

            # Resolve correspondent name to ID
            if "correspondent" in suggested_metadata and correspondents:
                correspondent_name = suggested_metadata["correspondent"]
                for corr in correspondents:
                    if corr["name"].lower() == correspondent_name.lower():
                        update_data["correspondent"] = corr["id"]
                        break

            # Resolve document type name to ID
            if "document_type" in suggested_metadata and document_types:
                doc_type_name = suggested_metadata["document_type"]
                for dt in document_types:
                    if dt["name"].lower() == doc_type_name.lower():
                        update_data["document_type"] = dt["id"]
                        break

            # Handle tags
            if "suggested_tags" in suggested_metadata and tags:
                tag_ids = []

                # Check if existing tags should be cleared
                clear_existing_tags = suggested_metadata.get("clear_existing_tags", False)

                # If not clearing, keep existing tags
                if not clear_existing_tags:
                    tag_ids = current_doc.get("tags", []).copy()

                # Add new tags
                suggested_tag_names = suggested_metadata["suggested_tags"]
                if isinstance(suggested_tag_names, str):
                    suggested_tag_names = [suggested_tag_names]

                for tag_name in suggested_tag_names:
                    for tag in tags:
                        if tag["name"].lower() == tag_name.lower():
                            if tag["id"] not in tag_ids:
                                tag_ids.append(tag["id"])
                            break

                update_data["tags"] = tag_ids

            # Update document in Paperless
            update_result = await self.paperless_client.update_document_metadata(
                document_id=document_id,
                **update_data
            )

            if update_result["success"]:
                # Update processing history
                async with async_session_maker() as session:
                    result = await session.execute(
                        select(ProcessingHistory)
                        .where(ProcessingHistory.document_id == document_id)
                        .order_by(ProcessingHistory.processed_at.desc())
                    )
                    history = result.first()
                    if history:
                        history[0].metadata_updated = True
                        await session.commit()

            return update_result

        except Exception as e:
            return {
                "success": False,
                "message": f"Error applying metadata: {str(e)}"
            }

    async def get_documents_by_tag(self, tag_id: int) -> Dict[str, Any]:
        """
        Get documents filtered by tag

        Args:
            tag_id: Tag ID to filter by

        Returns:
            Dict with documents list
        """
        return await self.paperless_client.search_documents_by_tag(tag_id)

    async def get_processing_history(
        self,
        document_id: Optional[int] = None,
        limit: int = 50
    ) -> list[Dict[str, Any]]:
        """
        Get processing history

        Args:
            document_id: Filter by specific document ID (optional)
            limit: Maximum number of records to return

        Returns:
            List of processing history records
        """
        async with async_session_maker() as session:
            query = select(ProcessingHistory).order_by(
                ProcessingHistory.processed_at.desc()
            ).limit(limit)

            if document_id:
                query = query.where(ProcessingHistory.document_id == document_id)

            result = await session.execute(query)
            history_records = result.scalars().all()

            return [
                {
                    "id": record.id,
                    "document_id": record.document_id,
                    "document_title": record.document_title,
                    "status": record.status,
                    "metadata_updated": record.metadata_updated,
                    "processed_at": record.processed_at.isoformat() if record.processed_at else None,
                    "error_message": record.error_message
                }
                for record in history_records
            ]

    async def _update_history_failed(self, history_id: int, error_message: str):
        """Update processing history with failure status"""
        async with async_session_maker() as session:
            result = await session.execute(
                select(ProcessingHistory).where(ProcessingHistory.id == history_id)
            )
            history = result.scalar_one_or_none()
            if history:
                history.status = "failed"
                history.error_message = error_message
                await session.commit()
