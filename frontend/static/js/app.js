// Paperless-onS Frontend Application
// Updated: 2025-11-22 23:30 - Database storage for text_source_mode
console.log('🔄 Paperless-onS loaded - Version 2025-11-22 23:30 - Database text_source_mode support ACTIVE');

const API_BASE = '';

// Tab Management
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.content-tab').forEach(tab => {
        tab.style.display = 'none';
    });

    // Show selected tab
    document.getElementById(tabName + 'Tab').style.display = 'block';

    // Update active nav item
    document.querySelectorAll('.list-group-item').forEach(item => {
        item.classList.remove('active');
    });
    event.target.classList.add('active');

    // Load data for specific tabs
    if (tabName === 'settings') {
        loadSettings();
        loadProcessingSettings();
        loadConfigurations();  // Load saved prompt configurations
    } else if (tabName === 'history') {
        loadHistory();
    } else if (tabName === 'documents') {
        loadTags();
    }
}

// Load Tags and Documents based on processing settings
async function loadTags() {
    try {
        // Load filter options (tags, correspondents, document types)
        await loadDocumentFilters();

        // Load documents based on selected filter tags from settings
        await loadDocumentsByFilterTags();
    } catch (error) {
        showError(t('errors.loading_tags') + ': ' + error.message);
    }
}

// Load all documents on homepage
async function loadDocumentsByFilterTags() {
    const loadingDiv = document.getElementById('documentsLoading');
    const contentDiv = document.getElementById('documentsContent');

    loadingDiv.style.display = 'block';
    contentDiv.innerHTML = '';

    try {
        // Load ALL documents (not filtered by auto-processing tag)
        const response = await fetch(`${API_BASE}/api/documents/filter`);
        const data = await response.json();

        loadingDiv.style.display = 'none';

        if (data.success && data.documents && data.documents.length > 0) {
            contentDiv.innerHTML = data.documents.map(doc => createDocumentCard(doc)).join('');
        } else {
            contentDiv.innerHTML = `<p class="text-muted">${t('documents.no_documents')}</p>`;
        }
    } catch (error) {
        loadingDiv.style.display = 'none';
        showError(t('errors.loading_documents') + ': ' + error.message);
    }
}

// Load tags for automatic processing settings
async function loadAutoProcessingTags() {
    await refreshTagsForSettings();
}

// Refresh tags for settings dropdowns
async function refreshTagsForSettings() {
    try {
        const response = await fetch(`${API_BASE}/api/tags/all`);
        const data = await response.json();

        if (data.success) {
            const filterTagSelect = document.getElementById('autoProcessingFilterTag');
            const addTagSelect = document.getElementById('addTagAfterProcessingSelect');

            // Get current selections
            const currentFilterTag = localStorage.getItem('filterTag') || '';
            const currentAddTag = localStorage.getItem('addTagAfterProcessingId') || '';

            // Populate filter tag select (single-select dropdown)
            filterTagSelect.innerHTML = `<option value="">${t('processing_settings.no_tag')}</option>`;
            data.tags.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.id;
                option.textContent = `${tag.name} (${tag.document_count || 0})`;
                if (tag.id.toString() === currentFilterTag) {
                    option.selected = true;
                }
                filterTagSelect.appendChild(option);
            });

            // Populate add tag select
            addTagSelect.innerHTML = `<option value="">${t('processing_settings.select_tag')}</option>`;
            data.tags.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.id;
                option.textContent = tag.name;
                if (tag.id.toString() === currentAddTag) {
                    option.selected = true;
                }
                addTagSelect.appendChild(option);
            });
        } else {
            showError(t('errors.loading_tags') + ': ' + data.message);
        }
    } catch (error) {
        showError(t('errors.loading_tags') + ': ' + error.message);
    }
}

// ============================================
// Document Filter Functions
// ============================================

// Load all filter options (tags, correspondents, document types)
async function loadDocumentFilters() {
    try {
        // Load tags
        const tagsResponse = await fetch(`${API_BASE}/api/tags/all`);
        const tagsData = await tagsResponse.json();

        if (tagsData.success) {
            const filterTagsSelect = document.getElementById('filterDocumentTags');
            filterTagsSelect.innerHTML = '';

            tagsData.tags.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.id;
                option.textContent = `${tag.name} (${tag.document_count || 0})`;
                filterTagsSelect.appendChild(option);
            });
        }

        // Load correspondents
        const correspondentsResponse = await fetch(`${API_BASE}/api/correspondents/all`);
        const correspondentsData = await correspondentsResponse.json();

        if (correspondentsData.success) {
            const filterCorrespondentSelect = document.getElementById('filterCorrespondent');
            filterCorrespondentSelect.innerHTML = `<option value="">${t('documents.all_correspondents')}</option>`;

            correspondentsData.correspondents.forEach(correspondent => {
                const option = document.createElement('option');
                option.value = correspondent.id;
                option.textContent = correspondent.name;
                filterCorrespondentSelect.appendChild(option);
            });
        }

        // Load document types
        const docTypesResponse = await fetch(`${API_BASE}/api/document-types/all`);
        const docTypesData = await docTypesResponse.json();

        if (docTypesData.success) {
            const filterDocTypeSelect = document.getElementById('filterDocumentType');
            filterDocTypeSelect.innerHTML = `<option value="">${t('documents.all_document_types')}</option>`;

            docTypesData.document_types.forEach(docType => {
                const option = document.createElement('option');
                option.value = docType.id;
                option.textContent = docType.name;
                filterDocTypeSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading document filters:', error);
    }
}

// Apply document filters
async function applyDocumentFilters() {
    const loadingDiv = document.getElementById('documentsLoading');
    const contentDiv = document.getElementById('documentsContent');

    // Get filter values
    const selectedTags = Array.from(document.getElementById('filterDocumentTags').selectedOptions).map(opt => opt.value);
    const selectedCorrespondent = document.getElementById('filterCorrespondent').value;
    const selectedDocType = document.getElementById('filterDocumentType').value;
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;

    loadingDiv.style.display = 'block';
    contentDiv.innerHTML = '';

    try {
        // Build query parameters
        const params = new URLSearchParams();

        if (selectedTags.length > 0) {
            selectedTags.forEach(tagId => params.append('tags', tagId));
        }

        if (selectedCorrespondent) {
            params.append('correspondent', selectedCorrespondent);
        }

        if (selectedDocType) {
            params.append('document_type', selectedDocType);
        }

        if (dateFrom) {
            params.append('created_after', dateFrom);
        }

        if (dateTo) {
            params.append('created_before', dateTo);
        }

        // Fetch filtered documents
        const response = await fetch(`${API_BASE}/api/documents/filter?${params.toString()}`);
        const data = await response.json();

        loadingDiv.style.display = 'none';

        if (data.success && data.documents && data.documents.length > 0) {
            contentDiv.innerHTML = data.documents.map(doc => createDocumentCard(doc)).join('');
        } else {
            contentDiv.innerHTML = `<p class="text-muted">${t('documents.no_documents')}</p>`;
        }
    } catch (error) {
        loadingDiv.style.display = 'none';
        showError(t('errors.loading_documents') + ': ' + error.message);
    }
}

// Clear all document filters
function clearDocumentFilters() {
    // Clear all filter selections
    document.getElementById('filterDocumentTags').selectedIndex = -1;
    document.getElementById('filterCorrespondent').value = '';
    document.getElementById('filterDocumentType').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';

    // Reload documents based on settings
    loadDocumentsByFilterTags();
}

// ============================================
// End Document Filter Functions
// ============================================

// Load processing settings
async function loadProcessingSettings() {
    const filterTag = localStorage.getItem('filterTag') || '';  // Single tag now
    const enableAutoProcessing = localStorage.getItem('enableAutoProcessing') === 'true';
    const removeFilterTag = localStorage.getItem('removeFilterTagAfterProcessing') === 'true';
    const addTagEnabled = localStorage.getItem('addTagAfterProcessing') === 'true';
    const addTagId = localStorage.getItem('addTagAfterProcessingId') || '';
    const autoUpdate = localStorage.getItem('autoUpdateMetadata') === 'true';

    // Load text_source_mode from database
    let textSourceMode = 'paperless';  // default
    try {
        const response = await fetch(`${API_BASE}/api/settings/text_source_mode`);
        const data = await response.json();
        if (data && data.value) {
            textSourceMode = data.value;
        }
    } catch (error) {
        console.error('Error loading text_source_mode:', error);
    }

    // Set checkbox states
    document.getElementById('enableAutoProcessing').checked = enableAutoProcessing;
    document.getElementById('removeFilterTagAfterProcessing').checked = removeFilterTag;
    document.getElementById('addTagAfterProcessing').checked = addTagEnabled;
    document.getElementById('addTagAfterProcessingSelect').disabled = !addTagEnabled;
    document.getElementById('autoUpdateMetadata').checked = autoUpdate;

    // Set text source mode
    if (textSourceMode === 'ai_ocr') {
        document.getElementById('textSourceAI').checked = true;
    } else {
        document.getElementById('textSourcePaperless').checked = true;
    }

    // Load tags into selects
    refreshTagsForSettings();
}

// Save processing settings
document.addEventListener('DOMContentLoaded', () => {
    const processingForm = document.getElementById('processingSettingsForm');
    if (processingForm) {
        processingForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Get selected filter tag (single tag now)
            const filterTagSelect = document.getElementById('autoProcessingFilterTag');
            const selectedFilterTag = filterTagSelect.value;

            // Get other settings
            const enableAutoProcessing = document.getElementById('enableAutoProcessing').checked;
            const removeFilterTag = document.getElementById('removeFilterTagAfterProcessing').checked;
            const addTagEnabled = document.getElementById('addTagAfterProcessing').checked;
            const addTagId = document.getElementById('addTagAfterProcessingSelect').value;
            const autoUpdate = document.getElementById('autoUpdateMetadata').checked;
            const textSourceMode = document.querySelector('input[name="textSourceMode"]:checked').value;
            const displayTextLength = document.getElementById('displayTextLength').value;

            // Save to localStorage
            localStorage.setItem('filterTag', selectedFilterTag);
            localStorage.setItem('enableAutoProcessing', enableAutoProcessing.toString());
            localStorage.setItem('removeFilterTagAfterProcessing', removeFilterTag.toString());
            localStorage.setItem('addTagAfterProcessing', addTagEnabled.toString());
            localStorage.setItem('addTagAfterProcessingId', addTagId);
            localStorage.setItem('autoUpdateMetadata', autoUpdate.toString());

            // Save text_source_mode to database
            await fetch(`${API_BASE}/api/settings/text_source_mode`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'text_source_mode', value: textSourceMode })
            });

            // Save display_text_length to database
            if (displayTextLength) {
                await fetch(`${API_BASE}/api/settings/display_text_length`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'display_text_length', value: displayTextLength })
                });
            }

            showSuccess(t('processing_settings.saved_success'));

            // Reload documents with new filter
            await loadDocumentsByFilterTags();
        });
    }

    // Toggle add tag select based on checkbox
    const addTagCheckbox = document.getElementById('addTagAfterProcessing');
    if (addTagCheckbox) {
        addTagCheckbox.addEventListener('change', (e) => {
            document.getElementById('addTagAfterProcessingSelect').disabled = !e.target.checked;
        });
    }
});

// Save Modular Prompts
document.addEventListener('DOMContentLoaded', () => {
    const modularPromptsForm = document.getElementById('modularPromptsForm');
    if (modularPromptsForm) {
        modularPromptsForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const modularPrompts = {
                document_date: document.getElementById('promptDocumentDate').value,
                correspondent: document.getElementById('promptCorrespondent').value,
                document_type: document.getElementById('promptDocumentType').value,
                content_keywords: document.getElementById('promptContentKeywords').value,
                suggested_title: document.getElementById('promptSuggestedTitle').value,
                suggested_tag: document.getElementById('promptSuggestedTag').value,
                free_instructions: document.getElementById('promptFreeInstructions').value,
                use_json_mode: true  // JSON mode is always enabled
            };

            try {
                const response = await fetch(`${API_BASE}/api/prompts/modular`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(modularPrompts)
                });

                const data = await response.json();

                if (data.success) {
                    showSuccess(t('prompt.saved_success'));
                } else {
                    showError(t('errors.saving_prompt') + ': ' + data.message);
                }
            } catch (error) {
                showError(t('errors.saving_prompt') + ': ' + error.message);
            }
        });
    }
});

// Load Documents by Tag
async function loadDocumentsByTag() {
    const tagId = document.getElementById('tagSelect').value;

    if (!tagId) {
        document.getElementById('documentsContent').innerHTML =
            `<p class="text-muted">${t('documents.select_tag_prompt')}</p>`;
        return;
    }

    const loadingDiv = document.getElementById('documentsLoading');
    const contentDiv = document.getElementById('documentsContent');

    loadingDiv.style.display = 'block';
    contentDiv.innerHTML = '';

    try {
        const response = await fetch(`${API_BASE}/api/documents/by-tag/${tagId}`);
        const data = await response.json();

        loadingDiv.style.display = 'none';

        if (data.success && data.documents.length > 0) {
            contentDiv.innerHTML = data.documents.map(doc => createDocumentCard(doc)).join('');
        } else {
            contentDiv.innerHTML = `<p class="text-muted">${t('documents.no_documents')}</p>`;
        }
    } catch (error) {
        loadingDiv.style.display = 'none';
        showError(t('errors.loading_documents') + ': ' + error.message);
    }
}

// Create Document Card HTML
function createDocumentCard(doc) {
    return `
        <div class="card document-card">
            <div class="card-body">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <h6 class="card-title">${doc.title || t('documents.untitled')}</h6>
                        <p class="card-text text-muted small">
                            ${t('documents.id')}: ${doc.id} |
                            ${t('documents.created')}: ${new Date(doc.created).toLocaleDateString()}
                            ${doc.correspondent_name ? ' | ' + t('documents.from') + ': ' + doc.correspondent_name : ''}
                        </p>
                    </div>
                    <button class="btn btn-primary btn-sm btn-process" onclick="processDocument(${doc.id})">
                        ${t('documents.analyze')}
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Process Document
async function processDocument(documentId) {
    const modal = new bootstrap.Modal(document.getElementById('processingModal'));
    const modalBody = document.getElementById('processingModalBody');
    const modalFooter = document.getElementById('processingModalFooter');

    modal.show();

    modalBody.innerHTML = `
        <div class="text-center">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">${t('common.loading')}</span>
            </div>
            <p class="mt-2">${t('processing.analyzing')}</p>
        </div>
    `;

    modalFooter.innerHTML = `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${t('common.close')}</button>`;

    try {
        // Load text_source_mode from database
        let textSourceMode = 'paperless';  // default
        try {
            const settingResponse = await fetch(`${API_BASE}/api/settings/text_source_mode`);
            const settingData = await settingResponse.json();
            if (settingData && settingData.value) {
                textSourceMode = settingData.value;
            }
        } catch (error) {
            console.error('Error loading text_source_mode, using default:', error);
        }

        const response = await fetch(`${API_BASE}/api/documents/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                document_id: documentId,
                auto_update: false,
                text_source_mode: textSourceMode
            })
        });

        const data = await response.json();

        if (data.success) {
            displayProcessingResults(data);
        } else {
            modalBody.innerHTML = `
                <div class="alert alert-danger">
                    <strong>${t('common.error')}:</strong> ${data.message}
                </div>
            `;
        }
    } catch (error) {
        modalBody.innerHTML = `
            <div class="alert alert-danger">
                <strong>${t('common.error')}:</strong> ${error.message}
            </div>
        `;
    }
}

// Display Processing Results
function displayProcessingResults(data) {
    const modalBody = document.getElementById('processingModalBody');
    const modalFooter = document.getElementById('processingModalFooter');

    const metadata = data.analysis.suggested_metadata;
    const currentTags = data.current_metadata.tags || [];

    // Build metadata selection form
    let metadataFields = '';

    // Title
    if (metadata.title) {
        metadataFields += `
            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="apply_title" checked>
                <label class="form-check-label w-100" for="apply_title">
                    <strong>${t('processing.suggested_title')}:</strong>
                    <div class="ms-4 mt-1 p-2 bg-light rounded">
                        <code>${metadata.title}</code>
                    </div>
                </label>
            </div>
        `;
    }

    // Document Date
    if (metadata.document_date) {
        metadataFields += `
            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="apply_document_date" checked>
                <label class="form-check-label w-100" for="apply_document_date">
                    <strong>${t('processing.document_date')}:</strong>
                    <div class="ms-4 mt-1 p-2 bg-light rounded">${metadata.document_date}</div>
                </label>
            </div>
        `;
    }

    // Correspondent
    if (metadata.correspondent) {
        metadataFields += `
            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="apply_correspondent" checked>
                <label class="form-check-label w-100" for="apply_correspondent">
                    <strong>${t('processing.correspondent')}:</strong>
                    <div class="ms-4 mt-1 p-2 bg-light rounded">${metadata.correspondent}</div>
                </label>
            </div>
        `;
    }

    // Document Type
    if (metadata.document_type) {
        metadataFields += `
            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="apply_document_type" checked>
                <label class="form-check-label w-100" for="apply_document_type">
                    <strong>${t('processing.document_type')}:</strong>
                    <div class="ms-4 mt-1 p-2 bg-light rounded">${metadata.document_type}</div>
                </label>
            </div>
        `;
    }

    // Keywords
    if (metadata.keywords) {
        metadataFields += `
            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="apply_keywords" checked>
                <label class="form-check-label w-100" for="apply_keywords">
                    <strong>${t('processing.content_keywords')}:</strong>
                    <div class="ms-4 mt-1 p-2 bg-light rounded">${metadata.keywords}</div>
                </label>
            </div>
        `;
    }

    // Tags
    if (metadata.suggested_tags && metadata.suggested_tags.length > 0) {
        metadataFields += `
            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" id="apply_tags" checked>
                <label class="form-check-label w-100" for="apply_tags">
                    <strong>${t('processing.suggested_tags')}:</strong>
                    <div class="ms-4 mt-1 p-2 bg-light rounded">${metadata.suggested_tags.join(', ')}</div>
                </label>
            </div>
            <div class="form-check ms-5 mb-3">
                <input class="form-check-input" type="checkbox" id="clear_existing_tags">
                <label class="form-check-label" for="clear_existing_tags">
                    <small>${t('processing.clear_existing_tags')}</small>
                </label>
                <div class="form-text small">${t('processing.clear_existing_tags_help')}</div>
            </div>
        `;
    }

    modalBody.innerHTML = `
        <h6 class="border-bottom pb-2 mb-3">${t('processing.select_fields_to_apply')}</h6>
        ${metadataFields || `<p class="text-muted">${t('processing.no_suggestions')}</p>`}

        <div class="alert alert-info small mt-3 mb-0">
            <strong>${t('processing.tokens_used')}:</strong> ${data.analysis.tokens_used || 0}
        </div>
    `;

    // Store document ID and metadata for later use
    window.currentDocumentData = {
        documentId: data.document_id,
        metadata: metadata
    };

    modalFooter.innerHTML = `
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${t('processing.close')}</button>
        <button type="button" class="btn btn-success" onclick="applySelectedMetadata()">
            ${t('processing.apply_metadata')}
        </button>
    `;
}

// Apply Selected Metadata (new function with checkboxes)
async function applySelectedMetadata() {
    if (!window.currentDocumentData) {
        showError(t('common.error') + ': No document data available');
        return;
    }

    const { documentId, metadata } = window.currentDocumentData;

    // Build metadata object with only selected fields
    const selectedMetadata = {};

    // Check each field
    if (document.getElementById('apply_title')?.checked && metadata.title) {
        selectedMetadata.title = metadata.title;
    }

    if (document.getElementById('apply_document_date')?.checked && metadata.document_date) {
        selectedMetadata.document_date = metadata.document_date;
    }

    if (document.getElementById('apply_correspondent')?.checked && metadata.correspondent) {
        selectedMetadata.correspondent = metadata.correspondent;
    }

    if (document.getElementById('apply_document_type')?.checked && metadata.document_type) {
        selectedMetadata.document_type = metadata.document_type;
    }

    if (document.getElementById('apply_keywords')?.checked && metadata.keywords) {
        selectedMetadata.keywords = metadata.keywords;
    }

    if (document.getElementById('apply_tags')?.checked && metadata.suggested_tags) {
        selectedMetadata.suggested_tags = metadata.suggested_tags;
        // Check if existing tags should be cleared
        selectedMetadata.clear_existing_tags = document.getElementById('clear_existing_tags')?.checked || false;
    }

    try {
        const response = await fetch(`${API_BASE}/api/documents/apply-metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                document_id: documentId,
                suggested_metadata: selectedMetadata
            })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(t('success.metadata_updated'));
            bootstrap.Modal.getInstance(document.getElementById('processingModal')).hide();
            await loadDocumentsByFilterTags(); // Refresh document list
        } else {
            showError(t('errors.metadata_update_failed') + ': ' + (data.message || data.detail || 'Unknown error'));
        }
    } catch (error) {
        showError(t('errors.metadata_update_failed') + ': ' + error.message);
    }
}

// Apply Metadata (legacy function - kept for compatibility)
async function applyMetadata(documentId, suggestedMetadata) {
    try {
        const response = await fetch(`${API_BASE}/api/documents/apply-metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                document_id: documentId,
                suggested_metadata: suggestedMetadata
            })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(t('success.metadata_updated'));
            bootstrap.Modal.getInstance(document.getElementById('processingModal')).hide();
            await loadDocumentsByFilterTags(); // Refresh document list
        } else {
            showError(t('errors.metadata_update_failed') + ': ' + data.message);
        }
    } catch (error) {
        showError(t('errors.metadata_update_failed') + ': ' + error.message);
    }
}

// Load Settings
async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE}/api/settings/all`);
        const settings = await response.json();

        const settingsMap = {};
        settings.forEach(s => {
            settingsMap[s.key] = s.value;
        });

        document.getElementById('paperlessUrl').value = settingsMap['paperless_url'] || '';
        document.getElementById('paperlessToken').value = settingsMap['paperless_token'] === '***ENCRYPTED***' ? '' : settingsMap['paperless_token'];
        document.getElementById('openaiKey').value = settingsMap['openai_api_key'] === '***ENCRYPTED***' ? '' : settingsMap['openai_api_key'];
        document.getElementById('openaiModel').value = settingsMap['openai_model'] || 'gpt-4-turbo-preview';
        document.getElementById('maxTextLength').value = settingsMap['max_text_length'] || '10000';
        document.getElementById('displayTextLength').value = settingsMap['display_text_length'] || '5000';

        // Load modular prompts
        await loadModularPrompts();

    } catch (error) {
        showError(t('errors.loading_settings') + ': ' + error.message);
    }
}

// Load Modular Prompts
async function loadModularPrompts() {
    try {
        const response = await fetch(`${API_BASE}/api/prompts/modular`);
        const data = await response.json();

        if (data.success) {
            const prompts = data.modular_prompts;

            document.getElementById('promptDocumentDate').value = prompts.document_date || '';
            document.getElementById('promptCorrespondent').value = prompts.correspondent || '';
            document.getElementById('promptDocumentType').value = prompts.document_type || '';
            document.getElementById('promptContentKeywords').value = prompts.content_keywords || '';
            document.getElementById('promptSuggestedTitle').value = prompts.suggested_title || '';
            document.getElementById('promptSuggestedTag').value = prompts.suggested_tag || '';
            document.getElementById('promptFreeInstructions').value = prompts.free_instructions || '';
        }
    } catch (error) {
        console.error('Error loading modular prompts:', error);
    }
}

// Load Default Modular Prompts
async function loadDefaultModularPrompts() {
    try {
        const response = await fetch(`${API_BASE}/api/prompts/modular/defaults`);
        const data = await response.json();

        if (data.success) {
            const defaults = data.defaults;

            document.getElementById('promptDocumentDate').value = defaults.document_date || '';
            document.getElementById('promptCorrespondent').value = defaults.correspondent || '';
            document.getElementById('promptDocumentType').value = defaults.document_type || '';
            document.getElementById('promptContentKeywords').value = defaults.content_keywords || '';
            document.getElementById('promptSuggestedTitle').value = defaults.suggested_title || '';
            document.getElementById('promptSuggestedTag').value = defaults.suggested_tag || '';
            document.getElementById('promptFreeInstructions').value = defaults.free_instructions || '';

            showSuccess(t('prompt.defaults_loaded'));
        } else {
            showError(t('errors.loading_default'));
        }
    } catch (error) {
        showError(t('errors.loading_default') + ': ' + error.message);
    }
}

// Show Placeholders Information
async function showPlaceholders() {
    const modal = new bootstrap.Modal(document.getElementById('placeholdersModal'));
    const modalBody = document.getElementById('placeholdersModalBody');

    modal.show();

    // Show loading state
    modalBody.innerHTML = `
        <div class="text-center">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">${t('common.loading')}</span>
            </div>
        </div>
    `;

    try {
        const response = await fetch(`${API_BASE}/api/prompts/placeholders`);
        const data = await response.json();

        if (data.success && data.placeholders) {
            let html = `
                <p class="text-muted" data-i18n="prompt.placeholders_note">${t('prompt.placeholders_note')}</p>
                <div class="table-responsive">
                    <table class="table table-sm table-bordered">
                        <thead class="table-light">
                            <tr>
                                <th>Placeholder</th>
                                <th>Description</th>
                                <th>Example</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            data.placeholders.forEach(placeholder => {
                html += `
                    <tr>
                        <td><code>${placeholder.placeholder}</code></td>
                        <td>${placeholder.description}</td>
                        <td class="text-muted small">${placeholder.example}</td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;

            modalBody.innerHTML = html;
        } else {
            modalBody.innerHTML = `
                <div class="alert alert-danger">
                    ${t('errors.loading_placeholders')}
                </div>
            `;
        }
    } catch (error) {
        modalBody.innerHTML = `
            <div class="alert alert-danger">
                ${t('errors.loading_placeholders')}: ${error.message}
            </div>
        `;
    }
}

// ============================================
// Configuration Management Functions
// ============================================

// Load all saved configurations
async function loadConfigurations() {
    try {
        const response = await fetch(`${API_BASE}/api/prompts/configurations`);
        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('configurationSelect');

            // Clear current options except the first placeholder
            select.innerHTML = `<option value="">${t('prompt.select_configuration')}</option>`;

            // Add configurations
            if (data.configurations && data.configurations.length > 0) {
                data.configurations.forEach(config => {
                    const option = document.createElement('option');
                    option.value = config.id;
                    option.textContent = config.name;
                    select.appendChild(option);
                });
            }
        } else {
            console.error('Error loading configurations:', data.message);
        }
    } catch (error) {
        console.error('Error loading configurations:', error);
    }
}

// Load selected configuration into form
async function loadSelectedConfiguration() {
    const configId = document.getElementById('configurationSelect').value;

    if (!configId) {
        showError(t('prompt.select_config_first'));
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/prompts/configurations/${configId}`);
        const data = await response.json();

        if (data.success && data.configuration) {
            const config = data.configuration;

            // Populate form fields with configuration values
            document.getElementById('promptDocumentDate').value = config.document_date || '';
            document.getElementById('promptCorrespondent').value = config.correspondent || '';
            document.getElementById('promptDocumentType').value = config.document_type || '';
            document.getElementById('promptContentKeywords').value = config.content_keywords || '';
            document.getElementById('promptSuggestedTitle').value = config.suggested_title || '';
            document.getElementById('promptSuggestedTag').value = config.suggested_tag || '';
            document.getElementById('promptFreeInstructions').value = config.free_instructions || '';

            showSuccess(t('prompt.config_loaded'));
        } else {
            showError(t('common.error') + ': ' + (data.message || 'Unknown error'));
        }
    } catch (error) {
        showError(t('common.error') + ': ' + error.message);
    }
}

// Show save configuration dialog
function showSaveConfigDialog() {
    // Clear previous input
    document.getElementById('configNameInput').value = '';

    // Show the save configuration modal
    const modal = new bootstrap.Modal(document.getElementById('saveConfigModal'));
    modal.show();

    // Focus on input after modal is shown
    document.getElementById('saveConfigModal').addEventListener('shown.bs.modal', function () {
        document.getElementById('configNameInput').focus();
    }, { once: true });
}

// Save new configuration
async function saveNewConfiguration() {
    const configName = document.getElementById('configNameInput').value.trim();

    if (!configName) {
        showError(t('prompt.name_required'));
        return;
    }

    // Get current form values
    const configData = {
        name: configName,
        document_date: document.getElementById('promptDocumentDate').value,
        correspondent: document.getElementById('promptCorrespondent').value,
        document_type: document.getElementById('promptDocumentType').value,
        content_keywords: document.getElementById('promptContentKeywords').value,
        suggested_title: document.getElementById('promptSuggestedTitle').value,
        suggested_tag: document.getElementById('promptSuggestedTag').value,
        free_instructions: document.getElementById('promptFreeInstructions').value
    };

    try {
        const response = await fetch(`${API_BASE}/api/prompts/configurations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configData)
        });

        const data = await response.json();

        if (data.success) {
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('saveConfigModal'));
            modal.hide();

            // Reload configurations list
            await loadConfigurations();

            // Select the newly created configuration
            if (data.configuration && data.configuration.id) {
                document.getElementById('configurationSelect').value = data.configuration.id;
            }

            showSuccess(t('prompt.config_saved'));
        } else {
            showError(t('common.error') + ': ' + (data.detail || data.message || 'Unknown error'));
        }
    } catch (error) {
        showError(t('common.error') + ': ' + error.message);
    }
}

// Update selected configuration
async function updateSelectedConfiguration() {
    const configId = document.getElementById('configurationSelect').value;

    if (!configId) {
        showError(t('prompt.select_config_first'));
        return;
    }

    // Get selected configuration name for confirmation
    const select = document.getElementById('configurationSelect');
    const configName = select.options[select.selectedIndex].text;

    if (!confirm(t('prompt.update_current').replace('🔄 ', '') + ': ' + configName + '?')) {
        return;
    }

    // Get current form values
    const configData = {
        name: configName, // Keep the same name
        document_date: document.getElementById('promptDocumentDate').value,
        correspondent: document.getElementById('promptCorrespondent').value,
        document_type: document.getElementById('promptDocumentType').value,
        content_keywords: document.getElementById('promptContentKeywords').value,
        suggested_title: document.getElementById('promptSuggestedTitle').value,
        suggested_tag: document.getElementById('promptSuggestedTag').value,
        free_instructions: document.getElementById('promptFreeInstructions').value
    };

    try {
        const response = await fetch(`${API_BASE}/api/prompts/configurations/${configId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configData)
        });

        const data = await response.json();

        if (data.success) {
            showSuccess(t('prompt.config_updated'));
        } else {
            showError(t('common.error') + ': ' + (data.detail || data.message || 'Unknown error'));
        }
    } catch (error) {
        showError(t('common.error') + ': ' + error.message);
    }
}

// Delete selected configuration
async function deleteSelectedConfiguration() {
    const configId = document.getElementById('configurationSelect').value;

    if (!configId) {
        showError(t('prompt.select_config_first'));
        return;
    }

    // Get selected configuration name
    const select = document.getElementById('configurationSelect');
    const configName = select.options[select.selectedIndex].text;

    // Confirm deletion
    if (!confirm(t('prompt.confirm_delete').replace('{name}', configName))) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/prompts/configurations/${configId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            // Reload configurations list
            await loadConfigurations();

            // Reset select to empty
            document.getElementById('configurationSelect').value = '';

            showSuccess(t('prompt.config_deleted'));
        } else {
            showError(t('common.error') + ': ' + (data.detail || data.message || 'Unknown error'));
        }
    } catch (error) {
        showError(t('common.error') + ': ' + error.message);
    }
}

// ============================================
// End Configuration Management Functions
// ============================================

// Show Prompt Test Dialog
function showPromptTestDialog() {
    // Clear previous input
    document.getElementById('testDocumentIdInput').value = '';

    // Show the document ID input modal
    const modal = new bootstrap.Modal(document.getElementById('documentIdModal'));
    modal.show();

    // Focus on input after modal is shown
    document.getElementById('documentIdModal').addEventListener('shown.bs.modal', function () {
        document.getElementById('testDocumentIdInput').focus();
    }, { once: true });
}

// Run Prompt Test
async function runPromptTest() {
    const documentId = document.getElementById('testDocumentIdInput').value;

    if (!documentId) {
        showError(t('errors.document_id_required'));
        return;
    }

    // Close the document ID modal
    const idModal = bootstrap.Modal.getInstance(document.getElementById('documentIdModal'));
    idModal.hide();

    // Show the test results modal
    const resultsModal = new bootstrap.Modal(document.getElementById('promptTestModal'));
    const modalBody = document.getElementById('promptTestModalBody');

    resultsModal.show();

    modalBody.innerHTML = `
        <div class="text-center">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">${t('common.loading')}</span>
            </div>
            <p class="mt-2">${t('prompt.testing')}</p>
        </div>
    `;

    try {
        // Get current modular prompt values from the form
        const modularPrompts = {
            document_id: parseInt(documentId),
            document_date: document.getElementById('promptDocumentDate').value,
            correspondent: document.getElementById('promptCorrespondent').value,
            document_type: document.getElementById('promptDocumentType').value,
            content_keywords: document.getElementById('promptContentKeywords').value,
            suggested_title: document.getElementById('promptSuggestedTitle').value,
            suggested_tag: document.getElementById('promptSuggestedTag').value,
            free_instructions: document.getElementById('promptFreeInstructions').value
        };

        const response = await fetch(`${API_BASE}/api/prompts/modular/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(modularPrompts)
        });

        const data = await response.json();

        if (data.success) {
            modalBody.innerHTML = `
                <div class="mb-3">
                    <h6>${t('prompt.document')}</h6>
                    <p class="text-muted small mb-0">
                        <strong>ID:</strong> ${data.document.id}<br>
                        <strong>${t('processing.current_title')}:</strong> ${data.document.title || t('common.none')}<br>
                        <strong>Filename:</strong> ${data.document.filename}
                    </p>
                </div>

                <div class="mb-3">
                    <h6>${t('prompt.system_prompt_label')}</h6>
                    <div class="bg-light p-2 rounded" style="max-height: 150px; overflow-y: auto; font-family: monospace; font-size: 0.9em; white-space: pre-wrap;">${data.system_prompt}</div>
                </div>

                <div class="mb-3">
                    <h6>${t('prompt.generated_prompt')}</h6>
                    <div class="bg-light p-2 rounded" style="max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 0.9em; white-space: pre-wrap;">${data.user_prompt}</div>
                </div>

                <div class="alert alert-info small mb-0">
                    ${t('prompt.text_stats')
                        .replace('{extracted}', data.text_stats.extracted_length)
                        .replace('{preview}', data.text_stats.preview_length)
                        .replace('{max}', data.text_stats.max_text_length)}
                </div>
            `;
        } else {
            modalBody.innerHTML = `
                <div class="alert alert-danger">
                    <strong>${t('common.error')}:</strong> ${data.detail || data.message}
                </div>
            `;
        }
    } catch (error) {
        modalBody.innerHTML = `
            <div class="alert alert-danger">
                <strong>${t('common.error')}:</strong> ${error.message}
            </div>
        `;
    }
}

// Save Settings
document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const settings = {
        'paperless_url': document.getElementById('paperlessUrl').value,
        'paperless_token': document.getElementById('paperlessToken').value,
        'openai_api_key': document.getElementById('openaiKey').value,
        'openai_model': document.getElementById('openaiModel').value,
        'max_text_length': document.getElementById('maxTextLength').value
    };

    try {
        for (const [key, value] of Object.entries(settings)) {
            if (value) { // Only update non-empty values
                await fetch(`${API_BASE}/api/settings/${key}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key, value })
                });
            }
        }

        showSuccess(t('settings.saved_success'));
    } catch (error) {
        showError(t('errors.saving_settings') + ': ' + error.message);
    }
});

// Test Connections
async function testConnections() {
    try {
        // Test Paperless
        const paperlessResponse = await fetch(`${API_BASE}/api/settings/test-paperless`, { method: 'POST' });
        const paperlessResult = await paperlessResponse.json();

        // Test OpenAI
        const openaiResponse = await fetch(`${API_BASE}/api/settings/test-openai`, { method: 'POST' });
        const openaiResult = await openaiResponse.json();

        let message = `<strong>${t('settings.connection_test')}:</strong><br>`;
        message += `Paperless-NGX: ${paperlessResult.success ? t('settings.paperless_success') : t('settings.paperless_failed') + ' - ' + paperlessResult.message}<br>`;
        message += `OpenAI: ${openaiResult.success ? t('settings.openai_success') : t('settings.openai_failed') + ' - ' + openaiResult.message}`;

        if (paperlessResult.success && openaiResult.success) {
            showSuccess(message);
        } else {
            showError(message);
        }
    } catch (error) {
        showError(t('errors.testing_connections') + ': ' + error.message);
    }
}

// Load History
async function loadHistory() {
    try {
        const response = await fetch(`${API_BASE}/api/documents/history/all?limit=50`);
        const data = await response.json();

        const contentDiv = document.getElementById('historyContent');

        if (data.success && data.history.length > 0) {
            contentDiv.innerHTML = data.history.map(item => {
                const statusKey = item.status === 'completed' ? 'history.status_completed' :
                                 item.status === 'failed' ? 'history.status_failed' : 'history.status_processing';
                return `
                    <div class="history-item status-${item.status}">
                        <h6>${item.document_title || t('documents.untitled')} (${t('documents.id')}: ${item.document_id})</h6>
                        <p class="small text-muted mb-1">
                            <span class="badge bg-${item.status === 'completed' ? 'success' : item.status === 'failed' ? 'danger' : 'warning'}">
                                ${t(statusKey)}
                            </span>
                            ${new Date(item.processed_at).toLocaleString()}
                            ${item.metadata_updated ? ' | <span class="badge bg-info">' + t('history.metadata_updated') + '</span>' : ''}
                        </p>
                        ${item.error_message ? `<p class="text-danger small">${item.error_message}</p>` : ''}
                    </div>
                `;
            }).join('');
        } else {
            contentDiv.innerHTML = `<p class="text-muted">${t('history.no_history')}</p>`;
        }
    } catch (error) {
        showError(t('errors.loading_history') + ': ' + error.message);
    }
}

// Utility Functions
function showError(message) {
    showAlert(message, 'danger');
}

function showSuccess(message) {
    showAlert(message, 'success');
}

function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show alert-custom position-fixed top-0 end-0 m-3`;
    alertDiv.style.zIndex = '9999';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alertDiv);

    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Language Toggle (switches between EN and DE)
function toggleLanguage() {
    const currentLang = i18n.getLanguage();
    const newLang = currentLang === 'en' ? 'de' : 'en';
    i18n.setLanguage(newLang);
}

// Update language button display
function updateLanguageButton() {
    const currentLang = i18n.getLanguage();
    const langDisplay = document.getElementById('currentLang');
    if (langDisplay) {
        langDisplay.textContent = currentLang.toUpperCase();
    }
}

// Translate all UI elements with data-i18n attributes
function translateUI() {
    // Translate all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translation = i18n.t(key);

        // Update different element types appropriately
        if (element.tagName === 'INPUT') {
            // For inputs with type submit or button, update the value
            if (element.type === 'submit' || element.type === 'button') {
                element.value = translation;
            } else {
                // For other inputs, update placeholder
                element.placeholder = translation;
            }
        } else if (element.tagName === 'OPTION') {
            element.textContent = translation;
        } else if (element.tagName === 'BUTTON') {
            // For buttons, update textContent
            element.textContent = translation;
        } else {
            // For all other elements
            element.textContent = translation;
        }
    });

    // Translate elements with data-i18n-placeholder attribute
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        element.placeholder = i18n.t(key);
    });

    // Translate elements with data-i18n-title attribute
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
        const key = element.getAttribute('data-i18n-title');
        element.title = i18n.t(key);
    });
}

// Update UI with current language
function updateUILanguage() {
    // Update language button in header
    updateLanguageButton();

    // Translate all UI elements
    translateUI();
}

// Listen for language change events
window.addEventListener('languageChanged', () => {
    // Update language button
    updateLanguageButton();

    // Translate all UI elements
    translateUI();
});

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize i18n
    await i18n.init();

    // Update language button and translate UI
    updateLanguageButton();
    translateUI();

    // Load initial data
    loadTags();
});
