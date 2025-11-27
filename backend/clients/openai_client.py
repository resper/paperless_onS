"""OpenAI API client for document analysis"""

import base64
from typing import Dict, Any, Optional
from datetime import datetime
from openai import AsyncOpenAI
import io
from PyPDF2 import PdfReader

from backend.database.models import ApiLog
from backend.database.database import async_session_maker


class OpenAIDocumentAnalyzer:
    """Client for analyzing documents using OpenAI API"""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4-vision-preview",
        prompt_template: Optional[str] = None,
        system_prompt: Optional[str] = None,
        max_text_length: int = 10000,
        use_json_mode: bool = True,
        modular_prompts: Optional[Dict[str, str]] = None
    ):
        """
        Initialize OpenAI client

        Args:
            api_key: OpenAI API key
            model: Model to use for analysis (default: gpt-4-vision-preview)
            prompt_template: Custom prompt template with placeholders (legacy)
            system_prompt: Custom system prompt
            max_text_length: Maximum characters to extract from documents (default: 10000)
            use_json_mode: Use JSON response format (default: True)
            modular_prompts: Dict with modular prompt fields for each metadata type
        """
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model
        self.prompt_template = prompt_template
        self.system_prompt = system_prompt or "You are a document analysis assistant. Analyze documents and extract metadata in a structured format."
        self.max_text_length = max_text_length
        self.use_json_mode = use_json_mode
        self.modular_prompts = modular_prompts or {}

    async def _log_api_call(
        self,
        endpoint: str,
        method: str,
        status_code: Optional[int],
        request_data: Optional[Dict] = None,
        response_data: Optional[Dict] = None,
        error_message: Optional[str] = None,
        duration_ms: Optional[int] = None
    ):
        """Log API call to database"""
        try:
            async with async_session_maker() as session:
                log_entry = ApiLog(
                    service="openai",
                    endpoint=endpoint,
                    method=method,
                    status_code=status_code,
                    request_data=request_data,
                    response_data=response_data,
                    error_message=error_message,
                    duration_ms=duration_ms
                )
                session.add(log_entry)
                await session.commit()
        except Exception as e:
            print(f"Failed to log API call: {e}")

    def _extract_text_from_pdf(self, pdf_content: bytes) -> str:
        """
        Extract text from PDF using PyPDF2

        Args:
            pdf_content: PDF file content as bytes

        Returns:
            Extracted text from PDF
        """
        try:
            pdf_file = io.BytesIO(pdf_content)
            reader = PdfReader(pdf_file)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"
            return text.strip()
        except Exception as e:
            print(f"Error extracting text from PDF: {e}")
            return ""

    def _convert_pdf_to_images_base64(self, pdf_content: bytes, max_pages: int = 3) -> list[str]:
        """
        Convert PDF pages to base64-encoded images for Vision API

        Args:
            pdf_content: PDF file content as bytes
            max_pages: Maximum number of pages to convert (default: 3)

        Returns:
            List of base64-encoded images
        """
        # Note: This is a placeholder. For actual implementation, you would need
        # pdf2image library (requires poppler-utils)
        # For now, we'll rely on text extraction
        return []

    async def analyze_document(
        self,
        document_content: bytes,
        filename: str,
        content_type: str,
        current_metadata: Optional[Dict[str, Any]] = None,
        available_correspondents: Optional[list] = None,
        available_document_types: Optional[list] = None,
        available_tags: Optional[list] = None,
        text_source_mode: str = "paperless"
    ) -> Dict[str, Any]:
        """
        Analyze document and extract/enhance metadata

        Args:
            document_content: Document file content
            filename: Original filename
            content_type: MIME type of document
            current_metadata: Current metadata from Paperless-NGX
            available_correspondents: List of available correspondents from Paperless-NGX
            available_document_types: List of available document types from Paperless-NGX
            available_tags: List of available tags from Paperless-NGX
            text_source_mode: "paperless" to use Paperless OCR text, "ai_ocr" to use Vision API

        Returns:
            Dict with analysis results and suggested metadata
        """
        start_time = datetime.now()

        try:
            current_title = current_metadata.get("title", "") if current_metadata else ""
            current_content = current_metadata.get("content", "") if current_metadata else ""

            # Determine text source based on mode
            if text_source_mode == "ai_ocr":
                # Use Vision API to extract text from document
                return await self._analyze_with_vision(
                    document_content=document_content,
                    filename=filename,
                    content_type=content_type,
                    current_title=current_title,
                    available_correspondents=available_correspondents,
                    available_document_types=available_document_types,
                    available_tags=available_tags
                )

            # Default: Use text already extracted by Paperless-NGX
            extracted_text = current_content if current_content else "No text extracted by Paperless-NGX"

            # Build prompt for document analysis
            prompt = self._build_analysis_prompt(
                extracted_text=extracted_text,
                current_title=current_title,
                current_content=current_content,
                filename=filename,
                available_correspondents=available_correspondents,
                available_document_types=available_document_types,
                available_tags=available_tags
            )

            # Log the complete prompt for debugging
            print("\n" + "="*80)
            print("📝 GENERATED PROMPT FOR DOCUMENT ANALYSIS")
            print("="*80)
            print("\n🔹 SYSTEM PROMPT:")
            print("-" * 80)
            print(self.system_prompt)
            print("\n🔹 USER PROMPT:")
            print("-" * 80)
            print(prompt)
            print("\n" + "="*80 + "\n")

            # Prepare API parameters
            api_params = {
                "model": self.model if self.model != "gpt-4-vision-preview" else "gpt-4-turbo-preview",
                "messages": [
                    {
                        "role": "system",
                        "content": self.system_prompt + ("\n\nRespond with valid JSON only." if self.use_json_mode else "")
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "temperature": 0.3,
                "max_tokens": 2000
            }

            # Add JSON mode if enabled and model supports it
            if self.use_json_mode and ("gpt-4" in api_params["model"] or "gpt-3.5" in api_params["model"]):
                api_params["response_format"] = {"type": "json_object"}

            # Call OpenAI API
            response = await self.client.chat.completions.create(**api_params)

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            # Parse response
            analysis_result = response.choices[0].message.content

            # Extract token usage information
            tokens_used = 0
            if hasattr(response, "usage") and response.usage:
                tokens_used = response.usage.total_tokens
                # Debug logging for token usage
                print(f"\n🔢 TEXT-BASED API TOKEN USAGE:")
                print(f"   - Prompt tokens: {response.usage.prompt_tokens}")
                print(f"   - Completion tokens: {response.usage.completion_tokens}")
                print(f"   - Total tokens: {response.usage.total_tokens}")
            else:
                print(f"\n⚠️  WARNING: Text-based API response has no usage information!")

            # Log API call
            await self._log_api_call(
                endpoint="/v1/chat/completions",
                method="POST",
                status_code=200,
                request_data={
                    "model": self.model,
                    "filename": filename,
                    "text_length": len(extracted_text)
                },
                response_data={
                    "usage": dict(response.usage) if hasattr(response, "usage") else None,
                    "analysis_length": len(analysis_result),
                    "tokens_used": tokens_used
                },
                duration_ms=duration_ms
            )

            # Parse structured response
            metadata = self._parse_analysis_result(analysis_result)

            print(f"\n✅ TEXT-BASED ANALYSIS COMPLETE:")
            print(f"   - Tokens used: {tokens_used}")
            print(f"   - Text input length: {len(extracted_text)}")
            print(f"   - Analysis length: {len(analysis_result)}\n")

            return {
                "success": True,
                "extracted_text": extracted_text,
                "analysis": analysis_result,
                "suggested_metadata": metadata,
                "tokens_used": tokens_used
            }

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            await self._log_api_call(
                endpoint="/v1/chat/completions",
                method="POST",
                status_code=None,
                error_message=str(e),
                duration_ms=duration_ms
            )
            return {
                "success": False,
                "message": f"Error analyzing document: {str(e)}"
            }

    def _build_modular_prompt(
        self,
        extracted_text: str,
        filename: str,
        current_title: str,
        available_correspondents: Optional[list] = None,
        available_document_types: Optional[list] = None,
        available_tags: Optional[list] = None
    ) -> str:
        """Build modular prompt using individual field prompts"""

        # Get modular prompts or use defaults
        prompts = self.modular_prompts or {}

        # Build replacement strings for placeholders
        if available_correspondents:
            correspondents_str = ", ".join([c["name"] for c in available_correspondents])
        else:
            correspondents_str = "None available"

        if available_document_types:
            doc_types_str = ", ".join([dt["name"] for dt in available_document_types])
        else:
            doc_types_str = "None available"

        if available_tags:
            tags_str = ", ".join([t["name"] for t in available_tags])
        else:
            tags_str = "None available"

        # Determine which fields are active (have non-empty prompts) and replace placeholders
        active_fields = {}
        for field in ["document_date", "correspondent", "document_type", "content_keywords", "suggested_title", "suggested_tag"]:
            if field in prompts and prompts[field] and prompts[field].strip():
                # Replace placeholders in the prompt text
                field_prompt = prompts[field]
                field_prompt = field_prompt.replace("{available_correspondents}", correspondents_str)
                field_prompt = field_prompt.replace("{available_document_types}", doc_types_str)
                field_prompt = field_prompt.replace("{available_tags}", tags_str)
                field_prompt = field_prompt.replace("{filename}", filename)
                field_prompt = field_prompt.replace("{current_title}", current_title or "Not set")
                active_fields[field] = field_prompt

        # Get free instructions if available and replace placeholders
        free_instructions = prompts.get("free_instructions", "").strip()
        if free_instructions:
            free_instructions = free_instructions.replace("{available_correspondents}", correspondents_str)
            free_instructions = free_instructions.replace("{available_document_types}", doc_types_str)
            free_instructions = free_instructions.replace("{available_tags}", tags_str)
            free_instructions = free_instructions.replace("{filename}", filename)
            free_instructions = free_instructions.replace("{current_title}", current_title or "Not set")

        # Build the prompt sections
        sections = []

        sections.append("Analyze the following document and extract metadata in JSON format.")

        # Build available options section - only show relevant ones
        available_options = []
        if "correspondent" in active_fields and available_correspondents:
            correspondents_list = ", ".join([c["name"] for c in available_correspondents])
            available_options.append(f"- Correspondents: {correspondents_list}")

        if "document_type" in active_fields and available_document_types:
            doc_types_list = ", ".join([dt["name"] for dt in available_document_types])
            available_options.append(f"- Document Types: {doc_types_list}")

        if "suggested_tag" in active_fields and available_tags:
            tags_list = ", ".join([t["name"] for t in available_tags])
            available_options.append(f"- Tags: {tags_list}")

        if available_options:
            sections.append("\n**Available Options from Paperless-NGX:**")
            sections.append("\n".join(available_options))

        # Document information
        sections.append(f"""
**Document Information:**
- Filename: {filename}
- Current Title: {current_title or "Not set"}

**Document Text:**
{extracted_text[:self.max_text_length]}""")

        # Add field-specific instructions only for active fields
        if active_fields:
            sections.append("\n**Instructions for each field:**")

            if "document_date" in active_fields:
                sections.append(f"\n**Document Date:**\n{active_fields['document_date']}")

            if "correspondent" in active_fields:
                sections.append(f"\n**Correspondent:**\n{active_fields['correspondent']}")

            if "document_type" in active_fields:
                sections.append(f"\n**Document Type:**\n{active_fields['document_type']}")

            if "content_keywords" in active_fields:
                sections.append(f"\n**Content Keywords:**\n{active_fields['content_keywords']}")

            if "suggested_title" in active_fields:
                sections.append(f"\n**Suggested Title:**\n{active_fields['suggested_title']}")

            if "suggested_tag" in active_fields:
                sections.append(f"\n**Suggested Tag:**\n{active_fields['suggested_tag']}")

        # Add free instructions if provided
        if free_instructions:
            sections.append(f"\n**General Instructions:**\n{free_instructions}")

        # Build JSON schema with only active fields
        json_fields = []
        if "document_date" in active_fields:
            json_fields.append('  "document_date": "YYYY-MM-DD"')
        if "correspondent" in active_fields:
            json_fields.append('  "correspondent": "string"')
        if "document_type" in active_fields:
            json_fields.append('  "document_type": "string"')
        if "content_keywords" in active_fields:
            json_fields.append('  "content_keywords": "string"')
        if "suggested_title" in active_fields:
            json_fields.append('  "suggested_title": "string"')
        if "suggested_tag" in active_fields:
            json_fields.append('  "suggested_tags": ["tag1"]')

        if json_fields:
            sections.append("\nPlease return the answer in JSON format:")
            sections.append("{")
            sections.append(",\n".join(json_fields))
            sections.append("}")
            sections.append("\nIMPORTANT: Return ONLY valid JSON, no additional text or explanation.")

        return "\n".join(sections)

    def _build_analysis_prompt(
        self,
        extracted_text: str,
        current_title: str,
        current_content: str,
        filename: str,
        available_correspondents: Optional[list] = None,
        available_document_types: Optional[list] = None,
        available_tags: Optional[list] = None
    ) -> str:
        """Build prompt for OpenAI analysis using template with placeholders"""

        # Use modular prompts if configured
        if self.modular_prompts and any(self.modular_prompts.values()):
            return self._build_modular_prompt(
                extracted_text=extracted_text,
                filename=filename,
                current_title=current_title,
                available_correspondents=available_correspondents,
                available_document_types=available_document_types,
                available_tags=available_tags
            )

        # Use custom template if provided, otherwise use default
        if self.prompt_template:
            template = self.prompt_template
        else:
            template = """Analyze the following document and provide structured metadata.

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
   - Only suggest new tags if none of the existing tags are appropriate"""

        # Prepare text preview (limited by max_text_length setting)
        text_preview = extracted_text[:self.max_text_length]
        text_length_info = f"first {self.max_text_length}" if len(extracted_text) > self.max_text_length else "complete"

        # Replace placeholders in template
        template = template.replace("{filename}", filename)
        template = template.replace("{current_title}", current_title or "Not set")
        template = template.replace("{extracted_text}", text_preview)
        template = template.replace("{text_length}", str(len(extracted_text)))
        template = template.replace("{max_text_length}", str(self.max_text_length))

        # Replace correspondents placeholder - always replace, even if empty
        if "{available_correspondents}" in template:
            if available_correspondents:
                correspondents_list = ", ".join([c["name"] for c in available_correspondents])
            else:
                correspondents_list = "None available"
            template = template.replace("{available_correspondents}", correspondents_list)

        # Replace document types placeholder - always replace, even if empty
        if "{available_document_types}" in template:
            if available_document_types:
                doc_types_list = ", ".join([dt["name"] for dt in available_document_types])
            else:
                doc_types_list = "None available"
            template = template.replace("{available_document_types}", doc_types_list)

        # Replace tags placeholder - always replace, even if empty
        if "{available_tags}" in template:
            if available_tags:
                tags_list = ", ".join([t["name"] for t in available_tags])
            else:
                tags_list = "None available"
            template = template.replace("{available_tags}", tags_list)

        # Build document information section
        doc_info = f"""**Document Information:**
- Filename: {filename}
- Current Title: {current_title or "Not set"}
- Text Length: {len(extracted_text)} characters (showing {text_length_info})

**Document Text (extracted by Paperless-NGX):**
{text_preview}"""

        prompt = f"""{doc_info}

{template}

Please format your response as follows:

DATE: [document date in YYYY-MM-DD format]
CORRESPONDENT: [sender/recipient name]
TYPE: [document type]
KEYWORDS: [keyword1, keyword2, keyword3]
TITLE: [YYYY-MM-DD - Correspondent - Type - Keywords]
TAGS: [tag1, tag2, tag3, ...]
"""
        return prompt

    def _parse_analysis_result(self, analysis_text: str) -> Dict[str, Any]:
        """
        Parse structured analysis result from OpenAI (JSON or text format)

        Args:
            analysis_text: Raw text response from OpenAI (JSON or legacy text format)

        Returns:
            Dict with parsed metadata fields
        """
        import json

        # Try to parse as JSON first
        try:
            result = json.loads(analysis_text)

            # Handle tags (can be array or single string for backward compatibility)
            tags = result.get("suggested_tags", [])
            if isinstance(tags, str):
                # If it's a string, convert to array
                tags = [tags] if tags else []
            elif not isinstance(tags, list):
                # If neither string nor list, try suggested_tag (singular, legacy)
                tag = result.get("suggested_tag", "")
                tags = [tag] if tag else []

            # Map JSON fields to expected format
            metadata = {
                "title": result.get("suggested_title", ""),
                "document_type": result.get("document_type", ""),
                "document_date": result.get("document_date", ""),
                "keywords": result.get("content_keywords", ""),
                "suggested_tags": tags,
                "correspondent": result.get("correspondent", "")
            }
            return metadata
        except json.JSONDecodeError:
            pass  # Fall back to text parsing

        # Legacy text parsing (fallback)
        metadata = {
            "title": "",
            "document_type": "",
            "document_date": "",
            "keywords": "",
            "suggested_tags": [],
            "correspondent": ""
        }

        try:
            lines = analysis_text.split("\n")
            for line in lines:
                line = line.strip()
                if line.startswith("TITLE:"):
                    metadata["title"] = line.replace("TITLE:", "").strip()
                elif line.startswith("TYPE:"):
                    metadata["document_type"] = line.replace("TYPE:", "").strip()
                elif line.startswith("DATE:"):
                    metadata["document_date"] = line.replace("DATE:", "").strip()
                elif line.startswith("KEYWORDS:"):
                    metadata["keywords"] = line.replace("KEYWORDS:", "").strip()
                elif line.startswith("TAG:"):
                    tag_str = line.replace("TAG:", "").strip()
                    metadata["suggested_tags"] = [tag_str] if tag_str else []
                elif line.startswith("TAGS:"):
                    tags_str = line.replace("TAGS:", "").strip()
                    # Parse tags (handle various formats)
                    tags_str = tags_str.strip("[]")
                    metadata["suggested_tags"] = [
                        tag.strip() for tag in tags_str.split(",")
                    ]
                elif line.startswith("CORRESPONDENT:"):
                    metadata["correspondent"] = line.replace("CORRESPONDENT:", "").strip()

        except Exception as e:
            print(f"Error parsing analysis result: {e}")

        return metadata

    async def extract_ocr_text(self, document_content: bytes, filename: str) -> Dict[str, Any]:
        """
        Extract text from document using OCR (via OpenAI Vision API)

        Args:
            document_content: Document file content
            filename: Original filename

        Returns:
            Dict with extracted text or error
        """
        start_time = datetime.now()

        try:
            # For PDFs, use text extraction first
            if filename.lower().endswith(".pdf"):
                extracted_text = self._extract_text_from_pdf(document_content)

                if extracted_text and len(extracted_text.strip()) > 50:
                    # Text extraction successful
                    return {
                        "success": True,
                        "text": extracted_text,
                        "method": "text_extraction"
                    }

            # If text extraction failed or not a PDF, could use Vision API
            # (requires image conversion)
            return {
                "success": False,
                "message": "OCR via Vision API not yet implemented for this file type"
            }

        except Exception as e:
            return {
                "success": False,
                "message": f"Error extracting text: {str(e)}"
            }

    async def _analyze_with_vision(
        self,
        document_content: bytes,
        filename: str,
        content_type: str,
        current_title: str,
        available_correspondents: Optional[list] = None,
        available_document_types: Optional[list] = None,
        available_tags: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Analyze document using OpenAI Vision API for OCR and analysis

        Args:
            document_content: Document file content
            filename: Original filename
            content_type: MIME type of document
            current_title: Current title from Paperless
            available_correspondents: List of available correspondents
            available_document_types: List of available document types
            available_tags: List of available tags

        Returns:
            Dict with analysis results and suggested metadata
        """
        start_time = datetime.now()

        try:
            # Determine if this is an image or PDF
            is_image = content_type.startswith("image/") or filename.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp"))
            is_pdf = content_type == "application/pdf" or filename.lower().endswith(".pdf")

            if not is_image and not is_pdf:
                return {
                    "success": False,
                    "message": f"Vision API does not support this file type: {content_type}"
                }

            # Build the vision prompt
            vision_prompt = self._build_vision_prompt(
                filename=filename,
                current_title=current_title,
                available_correspondents=available_correspondents,
                available_document_types=available_document_types,
                available_tags=available_tags
            )

            # Prepare message content - ALWAYS send document as image to Vision API
            messages_content = []
            extracted_text = ""
            text_source = "vision_ocr"

            if is_pdf:
                # Convert PDF to images using PyMuPDF
                import fitz  # PyMuPDF
                import io
                from PIL import Image

                extracted_text = "[Text wird von der Vision API aus dem PDF extrahiert / Text extracted by Vision API from PDF]"

                # Open PDF with PyMuPDF
                pdf_document = fitz.open(stream=document_content, filetype="pdf")

                # Convert first page to image (for now, only process first page)
                page = pdf_document[0]

                # Render page to image (higher resolution for better OCR)
                zoom = 2.0  # Increase resolution
                mat = fitz.Matrix(zoom, zoom)
                pix = page.get_pixmap(matrix=mat)

                # Convert to PNG bytes
                img_bytes = pix.tobytes("png")
                base64_content = base64.b64encode(img_bytes).decode("utf-8")

                pdf_document.close()

                messages_content.append({
                    "type": "text",
                    "text": f"Please perform OCR on this document image, extract ALL text completely, and then analyze it.\n\nIMPORTANT: First extract the complete text from the document, then analyze it according to the instructions below.\n\n{vision_prompt}"
                })
                messages_content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{base64_content}",
                        "detail": "high"
                    }
                })
            else:
                # For images, encode and send directly
                extracted_text = "[Text wird von der Vision API aus dem Bild extrahiert / Text extracted by Vision API from image]"
                mime_type = content_type if content_type else "image/jpeg"
                base64_content = base64.b64encode(document_content).decode("utf-8")

                messages_content.append({
                    "type": "text",
                    "text": f"Please perform OCR on this document image, extract ALL text completely, and then analyze it.\n\nIMPORTANT: First extract the complete text from the document, then analyze it according to the instructions below.\n\n{vision_prompt}"
                })
                messages_content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{base64_content}",
                        "detail": "high"
                    }
                })

            # Use a vision-capable model
            vision_model = "gpt-4o" if "gpt-4o" in self.model or self.model == "gpt-4-turbo-preview" else self.model
            if "vision" not in vision_model and "gpt-4o" not in vision_model and "gpt-4-turbo" not in vision_model:
                vision_model = "gpt-4o"  # Default to gpt-4o for vision tasks

            # Log the Vision API prompt for debugging
            print("\n" + "="*80)
            print("📝 GENERATED PROMPT FOR VISION API DOCUMENT ANALYSIS")
            print("="*80)
            print(f"\n🔹 MODE: Vision API OCR")
            print(f"🔹 MODEL: {vision_model}")
            print(f"🔹 FILE: {filename}")
            print(f"🔹 CONTENT TYPE: {content_type}")
            print(f"🔹 TEXT SOURCE: {text_source}")
            print("\n🔹 SYSTEM PROMPT:")
            print("-" * 80)
            print(self.system_prompt + "\n\nYou will receive a document image. First extract all text from the document using OCR, then analyze it.")
            print("\n🔹 USER PROMPT (text part):")
            print("-" * 80)
            for content_item in messages_content:
                if content_item["type"] == "text":
                    print(content_item["text"])
            print("\n🔹 IMAGE/PDF DATA: [base64 encoded, not shown]")
            print("\n" + "="*80 + "\n")

            # Call OpenAI Vision API
            response = await self.client.chat.completions.create(
                model=vision_model,
                messages=[
                    {
                        "role": "system",
                        "content": self.system_prompt + "\n\nYou will receive a document image. IMPORTANT: Your response must contain two parts:\n1. EXTRACTED_TEXT: The complete text you extracted from the document via OCR\n2. ANALYSIS: The structured analysis according to the format below\n\nFormat your response exactly like this:\n\nEXTRACTED_TEXT:\n[Put the complete extracted text here]\n\nANALYSIS:\n[Put your structured analysis here in the requested format]"
                    },
                    {
                        "role": "user",
                        "content": messages_content
                    }
                ],
                temperature=0.3,
                max_tokens=4000
            )

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            # Parse response
            response_text = response.choices[0].message.content

            # Extract token usage information
            tokens_used = 0
            if hasattr(response, "usage") and response.usage:
                tokens_used = response.usage.total_tokens
                # Debug logging for token usage
                print(f"\n🔢 VISION API TOKEN USAGE:")
                print(f"   - Prompt tokens: {response.usage.prompt_tokens}")
                print(f"   - Completion tokens: {response.usage.completion_tokens}")
                print(f"   - Total tokens: {response.usage.total_tokens}")
            else:
                print(f"\n⚠️  WARNING: Vision API response has no usage information!")
                print(f"   - Response type: {type(response)}")
                print(f"   - Has usage attr: {hasattr(response, 'usage')}")

            # Extract the OCR text and analysis from the response
            ocr_text = ""
            analysis_result = response_text

            if "EXTRACTED_TEXT:" in response_text and "ANALYSIS:" in response_text:
                parts = response_text.split("ANALYSIS:", 1)
                ocr_part = parts[0].replace("EXTRACTED_TEXT:", "").strip()
                analysis_part = parts[1].strip()

                ocr_text = ocr_part
                analysis_result = analysis_part
            else:
                # Fallback: use the whole response as analysis
                ocr_text = "[Vision API hat Text nicht separat ausgegeben]"
                analysis_result = response_text

            # Log API call
            await self._log_api_call(
                endpoint="/v1/chat/completions",
                method="POST",
                status_code=200,
                request_data={
                    "model": vision_model,
                    "filename": filename,
                    "mode": "vision_ocr"
                },
                response_data={
                    "usage": dict(response.usage) if hasattr(response, "usage") else None,
                    "analysis_length": len(analysis_result),
                    "ocr_text_length": len(ocr_text),
                    "tokens_used": tokens_used
                },
                duration_ms=duration_ms
            )

            # Parse structured response
            metadata = self._parse_analysis_result(analysis_result)

            print(f"\n✅ VISION API ANALYSIS COMPLETE:")
            print(f"   - Tokens used: {tokens_used}")
            print(f"   - OCR text length: {len(ocr_text)}")
            print(f"   - Analysis length: {len(analysis_result)}\n")

            return {
                "success": True,
                "extracted_text": ocr_text,  # Return the actual OCR text from Vision API
                "analysis": analysis_result,
                "suggested_metadata": metadata,
                "tokens_used": tokens_used,
                "text_source": "vision_api"  # Mark that this came from Vision API
            }

        except Exception as e:
            import traceback
            error_traceback = traceback.format_exc()
            print(f"\n❌ VISION API ERROR:")
            print(error_traceback)

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            await self._log_api_call(
                endpoint="/v1/chat/completions",
                method="POST",
                status_code=None,
                error_message=str(e),
                duration_ms=duration_ms
            )
            return {
                "success": False,
                "message": f"Error analyzing document with Vision API: {str(e)}"
            }

    def _build_vision_prompt(
        self,
        filename: str,
        current_title: str,
        available_correspondents: Optional[list] = None,
        available_document_types: Optional[list] = None,
        available_tags: Optional[list] = None
    ) -> str:
        """Build prompt for Vision API analysis - uses modular prompts if configured"""

        # Use modular prompts if configured (same logic as regular analysis)
        if self.modular_prompts and any(self.modular_prompts.values()):
            # Use modular prompt building (reuse the same method)
            # Note: For Vision API, we don't have extracted_text yet, so we use empty string
            return self._build_modular_prompt(
                extracted_text="",  # Vision API extracts text, so we don't have it yet
                filename=filename,
                current_title=current_title,
                available_correspondents=available_correspondents,
                available_document_types=available_document_types,
                available_tags=available_tags
            )

        # Fallback to default prompt if no modular prompts configured
        # Build lists of available options
        correspondents_list = ", ".join([c["name"] for c in available_correspondents]) if available_correspondents else "None available"
        doc_types_list = ", ".join([dt["name"] for dt in available_document_types]) if available_document_types else "None available"
        tags_list = ", ".join([t["name"] for t in available_tags]) if available_tags else "None available"

        prompt = f"""**Document Information:**
- Filename: {filename}
- Current Title: {current_title or "Not set"}

**Available Correspondents in Paperless-NGX:**
{correspondents_list}

**Available Document Types in Paperless-NGX:**
{doc_types_list}

**Available Tags in Paperless-NGX:**
{tags_list}

**Please provide:**

1. **Document Date**: When was this document created or issued? (format: YYYY-MM-DD)
2. **Correspondent**: Who is this document from/to? (prefer existing correspondents if matching)
3. **Document Type**: What type of document is this? (prefer existing types if matching)
4. **Content Keywords**: 1-3 keywords describing WHAT the document is about (not the type)
5. **Suggested Title**: Create a title in format: YYYY-MM-DD - Correspondent - Document Type - Content Keywords
6. **Suggested Tags**: 3-5 relevant tags (prefer existing tags when appropriate)

Please format your response as follows:

DATE: [document date in YYYY-MM-DD format]
CORRESPONDENT: [sender/recipient name]
TYPE: [document type]
KEYWORDS: [keyword1, keyword2, keyword3]
TITLE: [YYYY-MM-DD - Correspondent - Type - Keywords]
TAGS: [tag1, tag2, tag3, ...]
"""
        return prompt
