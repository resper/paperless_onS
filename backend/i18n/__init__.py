"""Internationalization (i18n) support for Paperless-onS"""

import json
import os
from typing import Optional, Dict, Any
from pathlib import Path


class Translator:
    """Translation helper with fallback to English"""

    def __init__(self, language: str = "en"):
        """
        Initialize translator

        Args:
            language: Language code (e.g., 'en', 'de')
        """
        self.language = language
        self.translations: Dict[str, Any] = {}
        self.fallback_translations: Dict[str, Any] = {}
        self._load_translations()

    def _load_translations(self):
        """Load translation files"""
        i18n_dir = Path(__file__).parent

        # Load requested language
        lang_file = i18n_dir / f"{self.language}.json"
        if lang_file.exists():
            with open(lang_file, 'r', encoding='utf-8') as f:
                self.translations = json.load(f)

        # Load English as fallback (if not already loaded)
        if self.language != "en":
            en_file = i18n_dir / "en.json"
            if en_file.exists():
                with open(en_file, 'r', encoding='utf-8') as f:
                    self.fallback_translations = json.load(f)

    def t(self, key: str, **kwargs) -> str:
        """
        Translate a key with optional parameters

        Args:
            key: Translation key in dot notation (e.g., 'settings.title')
            **kwargs: Variables to replace in translation (e.g., {name})

        Returns:
            Translated string with variables replaced
        """
        # Split key by dots to navigate nested dictionary
        keys = key.split('.')

        # Try to get from current language
        value = self._get_nested(self.translations, keys)

        # Fallback to English if not found
        if value is None and self.fallback_translations:
            value = self._get_nested(self.fallback_translations, keys)

        # If still not found, return the key itself
        if value is None:
            return key

        # Replace variables if any
        if kwargs:
            try:
                return value.format(**kwargs)
            except (KeyError, ValueError):
                return value

        return value

    def _get_nested(self, data: Dict, keys: list) -> Optional[str]:
        """Get nested dictionary value"""
        current = data
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return None
        return current if isinstance(current, str) else None

    def get_all(self, section: Optional[str] = None) -> Dict[str, Any]:
        """
        Get all translations for a section or entire dictionary

        Args:
            section: Section key (e.g., 'placeholders')

        Returns:
            Dictionary of translations
        """
        if section:
            keys = section.split('.')
            result = self._get_nested_dict(self.translations, keys)
            if result is None and self.fallback_translations:
                result = self._get_nested_dict(self.fallback_translations, keys)
            return result or {}
        return self.translations

    def _get_nested_dict(self, data: Dict, keys: list) -> Optional[Dict]:
        """Get nested dictionary"""
        current = data
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return None
        return current if isinstance(current, dict) else None


# Global translator instance (default English)
_translator: Optional[Translator] = None


def get_translator(language: str = "en") -> Translator:
    """
    Get or create translator instance

    Args:
        language: Language code

    Returns:
        Translator instance
    """
    global _translator
    if _translator is None or _translator.language != language:
        _translator = Translator(language)
    return _translator


def set_language(language: str):
    """
    Set global language

    Args:
        language: Language code (e.g., 'en', 'de')
    """
    global _translator
    _translator = Translator(language)


def t(key: str, language: str = "en", **kwargs) -> str:
    """
    Quick translation function

    Args:
        key: Translation key
        language: Language code
        **kwargs: Variables for replacement

    Returns:
        Translated string
    """
    translator = get_translator(language)
    return translator.t(key, **kwargs)
