"""Paperless-NGX API client using pypaperless library"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from pypaperless import Paperless
from contextlib import asynccontextmanager

from backend.database.models import ApiLog
from backend.database.database import async_session_maker


class PaperlessClient:
    """Client for interacting with Paperless-NGX REST API using pypaperless"""

    def __init__(self, base_url: str, token: str):
        """
        Initialize Paperless client

        Args:
            base_url: Paperless-NGX server URL (e.g., http://localhost:8000)
            token: API authentication token
        """
        self.base_url = base_url.rstrip("/")
        self.token = token

    @asynccontextmanager
    async def _get_client(self):
        """Get an initialized Paperless client as async context manager"""
        async with Paperless(url=self.base_url, token=self.token) as client:
            yield client

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
                    service="paperless",
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

    async def test_connection(self) -> Dict[str, Any]:
        """
        Test connection to Paperless-NGX API

        Returns:
            Dict with connection status and message
        """
        start_time = datetime.now()
        try:
            # Try to initialize connection - just initializing is enough to test
            async with self._get_client() as client:
                # Access is_initialized to verify connection worked
                if client.is_initialized:
                    duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

                    await self._log_api_call(
                        endpoint="/api/",
                        method="GET",
                        status_code=200,
                        duration_ms=duration_ms
                    )

                    return {
                        "success": True,
                        "message": "Successfully connected to Paperless-NGX",
                        "data": {"connected": True}
                    }
                else:
                    raise Exception("Failed to initialize Paperless client")

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            await self._log_api_call(
                endpoint="/api/",
                method="GET",
                status_code=None,
                error_message=str(e),
                duration_ms=duration_ms
            )
            return {
                "success": False,
                "message": f"Connection error: {str(e)}"
            }

    async def get_tags(self) -> Dict[str, Any]:
        """
        Get all available tags from Paperless-NGX

        Returns:
            Dict with tags list or error
        """
        start_time = datetime.now()
        try:
            tags = []
            async with self._get_client() as client:
                # Use client.tags helper directly - it's an async iterator
                async for tag in client.tags:
                    tags.append({
                        "id": tag.id,
                        "name": tag.name,
                        "color": getattr(tag, 'colour', '#000000'),  # Note: Paperless uses 'colour'
                        "is_inbox_tag": getattr(tag, 'is_inbox_tag', False),
                        "document_count": getattr(tag, 'document_count', 0)
                    })

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            await self._log_api_call(
                endpoint="/api/tags/",
                method="GET",
                status_code=200,
                response_data={"count": len(tags)},
                duration_ms=duration_ms
            )

            return {
                "success": True,
                "tags": tags,
                "count": len(tags)
            }

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            await self._log_api_call(
                endpoint="/api/tags/",
                method="GET",
                status_code=None,
                error_message=str(e),
                duration_ms=duration_ms
            )
            return {
                "success": False,
                "message": f"Error getting tags: {str(e)}"
            }

    async def get_correspondents(self) -> Dict[str, Any]:
        """
        Get all available correspondents from Paperless-NGX

        Returns:
            Dict with correspondents list or error
        """
        start_time = datetime.now()
        try:
            correspondents = []
            async with self._get_client() as client:
                # Use client.correspondents helper directly - it's an async iterator
                async for correspondent in client.correspondents:
                    correspondents.append({
                        "id": correspondent.id,
                        "name": correspondent.name,
                        "document_count": getattr(correspondent, 'document_count', 0)
                    })

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            await self._log_api_call(
                endpoint="/api/correspondents/",
                method="GET",
                status_code=200,
                response_data={"count": len(correspondents)},
                duration_ms=duration_ms
            )

            return {
                "success": True,
                "correspondents": correspondents,
                "count": len(correspondents)
            }

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            await self._log_api_call(
                endpoint="/api/correspondents/",
                method="GET",
                status_code=None,
                error_message=str(e),
                duration_ms=duration_ms
            )
            return {
                "success": False,
                "message": f"Error getting correspondents: {str(e)}"
            }

    async def get_document_types(self) -> Dict[str, Any]:
        """
        Get all available document types from Paperless-NGX

        Returns:
            Dict with document types list or error
        """
        start_time = datetime.now()
        try:
            document_types = []
            async with self._get_client() as client:
                # Use client.document_types helper directly - it's an async iterator
                async for doc_type in client.document_types:
                    document_types.append({
                        "id": doc_type.id,
                        "name": doc_type.name,
                        "document_count": getattr(doc_type, 'document_count', 0)
                    })

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            await self._log_api_call(
                endpoint="/api/document_types/",
                method="GET",
                status_code=200,
                response_data={"count": len(document_types)},
                duration_ms=duration_ms
            )

            return {
                "success": True,
                "document_types": document_types,
                "count": len(document_types)
            }

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            await self._log_api_call(
                endpoint="/api/document_types/",
                method="GET",
                status_code=None,
                error_message=str(e),
                duration_ms=duration_ms
            )
            return {
                "success": False,
                "message": f"Error getting document types: {str(e)}"
            }

    async def search_documents(self, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Search for documents with optional filter parameters

        Args:
            params: Optional dictionary of filter parameters for Paperless API
                   (e.g., {"tags__id__in": "1,2,3", "correspondent__id": 5})

        Returns:
            Dict with documents list or error
        """
        start_time = datetime.now()
        filter_params = params or {}

        try:
            documents = []
            async with self._get_client() as client:
                if filter_params:
                    # Use reduce context to filter documents
                    async with client.documents.reduce(**filter_params) as filtered:
                        async for doc in filtered:
                            documents.append({
                                "id": doc.id,
                                "title": doc.title,
                                "content": getattr(doc, 'content', ''),
                                "created": doc.created.isoformat() if hasattr(doc, 'created') and doc.created else None,
                                "modified": doc.modified.isoformat() if hasattr(doc, 'modified') and doc.modified else None,
                                "tags": doc.tags if hasattr(doc, 'tags') else [],
                                "correspondent": doc.correspondent if hasattr(doc, 'correspondent') else None,
                                "correspondent_name": getattr(doc, 'correspondent_name', None),
                                "document_type": doc.document_type if hasattr(doc, 'document_type') else None,
                                "archive_serial_number": getattr(doc, 'archive_serial_number', None)
                            })
                else:
                    # No filters - get all documents
                    async for doc in client.documents:
                        documents.append({
                            "id": doc.id,
                            "title": doc.title,
                            "content": getattr(doc, 'content', ''),
                            "created": doc.created.isoformat() if hasattr(doc, 'created') and doc.created else None,
                            "modified": doc.modified.isoformat() if hasattr(doc, 'modified') and doc.modified else None,
                            "tags": doc.tags if hasattr(doc, 'tags') else [],
                            "correspondent": doc.correspondent if hasattr(doc, 'correspondent') else None,
                            "correspondent_name": getattr(doc, 'correspondent_name', None),
                            "document_type": doc.document_type if hasattr(doc, 'document_type') else None,
                            "archive_serial_number": getattr(doc, 'archive_serial_number', None)
                        })

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            await self._log_api_call(
                endpoint="/api/documents/",
                method="GET",
                status_code=200,
                request_data=filter_params,
                response_data={"count": len(documents)},
                duration_ms=duration_ms
            )

            return {
                "success": True,
                "documents": documents,
                "count": len(documents)
            }

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            await self._log_api_call(
                endpoint="/api/documents/",
                method="GET",
                status_code=None,
                request_data=filter_params,
                error_message=str(e),
                duration_ms=duration_ms
            )
            return {
                "success": False,
                "message": f"Error searching documents: {str(e)}"
            }

    async def search_documents_by_tag(self, tag_id: int) -> Dict[str, Any]:
        """
        Search for documents with a specific tag

        Args:
            tag_id: Tag ID to filter documents

        Returns:
            Dict with documents list or error
        """
        start_time = datetime.now()
        try:
            documents = []
            async with self._get_client() as client:
                # Use reduce context to filter documents
                async with client.documents.reduce(**{"tags__id__in": str(tag_id)}) as filtered:
                    async for doc in filtered:
                        documents.append({
                            "id": doc.id,
                            "title": doc.title,
                            "content": getattr(doc, 'content', ''),
                            "created": doc.created.isoformat() if hasattr(doc, 'created') and doc.created else None,
                            "modified": doc.modified.isoformat() if hasattr(doc, 'modified') and doc.modified else None,
                            "tags": doc.tags if hasattr(doc, 'tags') else [],
                            "correspondent": doc.correspondent if hasattr(doc, 'correspondent') else None,
                            "correspondent_name": getattr(doc, 'correspondent_name', None),
                            "document_type": doc.document_type if hasattr(doc, 'document_type') else None,
                            "archive_serial_number": getattr(doc, 'archive_serial_number', None)
                        })

            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

            await self._log_api_call(
                endpoint=f"/api/documents/?tags__id={tag_id}",
                method="GET",
                status_code=200,
                request_data={"tag_id": tag_id},
                response_data={"count": len(documents)},
                duration_ms=duration_ms
            )

            return {
                "success": True,
                "documents": documents,
                "count": len(documents)
            }

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            await self._log_api_call(
                endpoint=f"/api/documents/?tags__id={tag_id}",
                method="GET",
                status_code=None,
                error_message=str(e),
                duration_ms=duration_ms
            )
            return {
                "success": False,
                "message": f"Error searching documents: {str(e)}"
            }

    async def get_document(self, document_id: int) -> Dict[str, Any]:
        """
        Get detailed information about a specific document

        Args:
            document_id: Document ID

        Returns:
            Dict with document details or error
        """
        start_time = datetime.now()
        try:
            async with self._get_client() as client:
                # Use client.documents(id) to get document
                doc = await client.documents(document_id)
                duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

                document_data = {
                    "id": doc.id,
                    "title": doc.title,
                    "content": getattr(doc, 'content', ''),
                    "created": doc.created.isoformat() if hasattr(doc, 'created') and doc.created else None,
                    "modified": doc.modified.isoformat() if hasattr(doc, 'modified') and doc.modified else None,
                    "added": doc.added.isoformat() if hasattr(doc, 'added') and doc.added else None,
                    "tags": doc.tags if hasattr(doc, 'tags') else [],
                    "correspondent": doc.correspondent if hasattr(doc, 'correspondent') else None,
                    "document_type": doc.document_type if hasattr(doc, 'document_type') else None,
                    "archive_serial_number": getattr(doc, 'archive_serial_number', None),
                    "original_file_name": getattr(doc, 'original_file_name', None),
                    "archived_file_name": getattr(doc, 'archived_file_name', None)
                }

                await self._log_api_call(
                    endpoint=f"/api/documents/{document_id}/",
                    method="GET",
                    status_code=200,
                    duration_ms=duration_ms
                )

                return {
                    "success": True,
                    "document": document_data
                }

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            await self._log_api_call(
                endpoint=f"/api/documents/{document_id}/",
                method="GET",
                status_code=None,
                error_message=str(e),
                duration_ms=duration_ms
            )
            return {
                "success": False,
                "message": f"Error getting document: {str(e)}"
            }

    async def download_document(self, document_id: int) -> Dict[str, Any]:
        """
        Download document file content

        Args:
            document_id: Document ID

        Returns:
            Dict with file content (bytes) or error
        """
        start_time = datetime.now()
        try:
            async with self._get_client() as client:
                # Get document info first
                doc = await client.documents(document_id)

                # Download the document file using get_download() method
                # Returns a DownloadedDocument object with .content attribute
                download_result = await doc.get_download()
                duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

                await self._log_api_call(
                    endpoint=f"/api/documents/{document_id}/download/",
                    method="GET",
                    status_code=200,
                    duration_ms=duration_ms
                )

                # Determine filename
                filename = getattr(doc, "original_file_name", f"document_{document_id}.pdf")

                # Extract bytes from DownloadedDocument object
                document_bytes = download_result.content if hasattr(download_result, 'content') else download_result

                return {
                    "success": True,
                    "content": document_bytes,
                    "content_type": "application/pdf",  # pypaperless typically returns PDF
                    "filename": filename
                }

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            await self._log_api_call(
                endpoint=f"/api/documents/{document_id}/download/",
                method="GET",
                status_code=None,
                error_message=str(e),
                duration_ms=duration_ms
            )
            return {
                "success": False,
                "message": f"Error downloading document: {str(e)}"
            }

    async def update_document_metadata(
        self,
        document_id: int,
        title: Optional[str] = None,
        content: Optional[str] = None,
        tags: Optional[List[int]] = None,
        correspondent: Optional[int] = None,
        document_type: Optional[int] = None,
        created: Optional[str] = None,
        custom_fields: Optional[List[Dict]] = None
    ) -> Dict[str, Any]:
        """
        Update document metadata

        Args:
            document_id: Document ID
            title: New document title
            content: New document content/text
            tags: List of tag IDs
            correspondent: Correspondent ID
            document_type: Document type ID
            created: Document creation date (YYYY-MM-DD format)
            custom_fields: List of custom field updates

        Returns:
            Dict with update status or error
        """
        start_time = datetime.now()

        # Build update payload
        update_data = {}
        if title is not None:
            update_data["title"] = title
        if content is not None:
            update_data["content"] = content
        if tags is not None:
            update_data["tags"] = tags
        if correspondent is not None:
            update_data["correspondent"] = correspondent
        if document_type is not None:
            update_data["document_type"] = document_type
        if created is not None:
            update_data["created"] = created
        if custom_fields is not None:
            update_data["custom_fields"] = custom_fields

        try:
            async with self._get_client() as client:
                # Get document first
                doc = await client.documents(document_id)

                # Set fields directly on document object
                if "title" in update_data:
                    doc.title = update_data["title"]
                if "content" in update_data:
                    doc.content = update_data["content"]
                if "tags" in update_data:
                    doc.tags = update_data["tags"]
                if "correspondent" in update_data:
                    doc.correspondent = update_data["correspondent"]
                if "document_type" in update_data:
                    doc.document_type = update_data["document_type"]
                if "created" in update_data:
                    doc.created = update_data["created"]
                if "custom_fields" in update_data:
                    doc.custom_fields = update_data["custom_fields"]

                # Now call update without parameters
                await doc.update()
                duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

                await self._log_api_call(
                    endpoint=f"/api/documents/{document_id}/",
                    method="PATCH",
                    status_code=200,
                    request_data=update_data,
                    duration_ms=duration_ms
                )

                return {
                    "success": True,
                    "document": {
                        "id": doc.id,
                        "title": doc.title,
                        "content": getattr(doc, 'content', '')
                    },
                    "message": "Document metadata updated successfully"
                }

        except Exception as e:
            duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            await self._log_api_call(
                endpoint=f"/api/documents/{document_id}/",
                method="PATCH",
                status_code=None,
                request_data=update_data,
                error_message=str(e),
                duration_ms=duration_ms
            )
            return {
                "success": False,
                "message": f"Error updating document: {str(e)}"
            }
