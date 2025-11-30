"""Database models"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, JSON
from cryptography.fernet import Fernet
import base64

from backend.database.database import Base
from backend.config.settings import settings


class EncryptedString:
    """Helper for encrypting/decrypting sensitive strings"""

    def __init__(self, key: str = None):
        # Use secret key for encryption, pad/truncate to 32 bytes for Fernet
        secret = (key or settings.secret_key).encode()
        # Generate a proper Fernet key from the secret
        fernet_key = base64.urlsafe_b64encode(secret.ljust(32)[:32])
        self.cipher = Fernet(fernet_key)

    def encrypt(self, value: str) -> str:
        """Encrypt a string value"""
        if not value:
            return ""
        return self.cipher.encrypt(value.encode()).decode()

    def decrypt(self, value: str) -> str:
        """Decrypt a string value"""
        if not value:
            return ""
        return self.cipher.decrypt(value.encode()).decode()


class Settings(Base):
    """Configuration settings table"""

    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    encrypted = Column(Boolean, default=False)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    def get_value(self, encryptor: EncryptedString = None) -> str:
        """Get decrypted value if encrypted"""
        if self.encrypted and self.value and encryptor:
            return encryptor.decrypt(self.value)
        return self.value

    def set_value(self, value: str, encrypt: bool = False, encryptor: EncryptedString = None):
        """Set value, optionally encrypting it"""
        self.encrypted = encrypt
        if encrypt and encryptor:
            self.value = encryptor.encrypt(value)
        else:
            self.value = value


class ProcessingHistory(Base):
    """Track processed documents"""

    __tablename__ = "processing_history"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, nullable=False, index=True)  # Paperless document ID
    document_title = Column(String(255), nullable=True)
    tag_id = Column(Integer, nullable=True)  # Tag used to find document
    status = Column(String(50), nullable=False)  # pending, processing, completed, failed
    openai_response = Column(JSON, nullable=True)  # Store OpenAI analysis result
    error_message = Column(Text, nullable=True)
    metadata_updated = Column(Boolean, default=False)
    processed_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class ApiLog(Base):
    """Log API calls for debugging and monitoring"""

    __tablename__ = "api_logs"

    id = Column(Integer, primary_key=True, index=True)
    service = Column(String(50), nullable=False, index=True)  # paperless, openai
    endpoint = Column(String(255), nullable=False)
    method = Column(String(10), nullable=False)  # GET, POST, PATCH, etc.
    status_code = Column(Integer, nullable=True)
    request_data = Column(JSON, nullable=True)
    response_data = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)  # Request duration in milliseconds
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class PromptConfiguration(Base):
    """Saved prompt configurations"""

    __tablename__ = "prompt_configurations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    document_date = Column(Text, nullable=True)
    correspondent = Column(Text, nullable=True)
    document_type = Column(Text, nullable=True)
    storage_path = Column(Text, nullable=True)
    content_keywords = Column(Text, nullable=True)
    suggested_title = Column(Text, nullable=True)
    suggested_tag = Column(Text, nullable=True)
    free_instructions = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
