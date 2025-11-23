// Simple i18n system for Paperless-onS Frontend

class I18n {
    constructor() {
        this.currentLanguage = 'en';
        this.translations = {};
        this.fallbackTranslations = {};
    }

    async init(language = null) {
        // Get language from localStorage or browser or default
        if (!language) {
            language = localStorage.getItem('language') || this.getBrowserLanguage();
        }

        // Validate language
        if (!['en', 'de'].includes(language)) {
            language = 'en';
        }

        this.currentLanguage = language;

        // Load translations
        await this.loadTranslations(language);

        // Load English as fallback if not already loaded
        if (language !== 'en') {
            await this.loadFallback();
        }

        // Store in localStorage
        localStorage.setItem('language', language);
    }

    getBrowserLanguage() {
        const browserLang = navigator.language || navigator.userLanguage;
        const lang = browserLang.split('-')[0].toLowerCase();
        return ['en', 'de'].includes(lang) ? lang : 'en';
    }

    async loadTranslations(language) {
        try {
            const response = await fetch(`/i18n/${language}.json`);
            if (response.ok) {
                this.translations = await response.json();
            } else {
                console.warn(`Failed to load ${language}.json, falling back to English`);
                if (language !== 'en') {
                    await this.loadTranslations('en');
                }
            }
        } catch (error) {
            console.error(`Error loading translations for ${language}:`, error);
            if (language !== 'en') {
                await this.loadTranslations('en');
            }
        }
    }

    async loadFallback() {
        try {
            const response = await fetch('/i18n/en.json');
            if (response.ok) {
                this.fallbackTranslations = await response.json();
            }
        } catch (error) {
            console.error('Error loading fallback translations:', error);
        }
    }

    t(key, params = {}) {
        // Split key by dots to navigate nested object
        const keys = key.split('.');
        let value = this.getNested(this.translations, keys);

        // Fallback to English if not found
        if (value === null && this.fallbackTranslations) {
            value = this.getNested(this.fallbackTranslations, keys);
        }

        // If still not found, return the key itself
        if (value === null) {
            console.warn(`Translation key not found: ${key}`);
            return key;
        }

        // Replace parameters if any
        if (Object.keys(params).length > 0) {
            Object.keys(params).forEach(param => {
                value = value.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
            });
        }

        return value;
    }

    getNested(obj, keys) {
        return keys.reduce((current, key) => {
            return current && typeof current === 'object' && key in current
                ? current[key]
                : null;
        }, obj);
    }

    setLanguage(language) {
        if (['en', 'de'].includes(language)) {
            this.init(language).then(() => {
                // Trigger a custom event so components can re-render
                window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language } }));
            });
        }
    }

    getLanguage() {
        return this.currentLanguage;
    }

    // Get all translations for a section
    getSection(section) {
        const keys = section.split('.');
        let result = this.getNested(this.translations, keys);
        if (!result && this.fallbackTranslations) {
            result = this.getNested(this.fallbackTranslations, keys);
        }
        return result || {};
    }
}

// Create global i18n instance
const i18n = new I18n();

// Helper function for quick access
function t(key, params = {}) {
    return i18n.t(key, params);
}
