// Paperless-onS Frontend Application
// Updated: 2025-11-22 23:30 - Database storage for text_source_mode

const API_BASE = '';

// Global state for ID sorting (default: descending = newest first)
let idSortOrder = 'desc';

// Global state for document limit (default: 50)
let documentLimit = 50;

// Global Paperless URL (loaded on startup)
let paperlessUrl = '';

// Global state for pending text source selection
let pendingDocumentId = null;
let pendingBulkConfig = null;

// Global state for aborting processing
let currentAbortController = null;
let bulkProcessingAborted = false;

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

// Load Paperless URL from settings
async function loadPaperlessUrl() {
    try {
        const response = await fetch(`${API_BASE}/api/settings/paperless_url`);
        const data = await response.json();
        if (data && data.value) {
            paperlessUrl = data.value;
            // Remove trailing slash if present
            if (paperlessUrl.endsWith('/')) {
                paperlessUrl = paperlessUrl.slice(0, -1);
            }
        }
    } catch (error) {
        console.error('Error loading paperless_url:', error);
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

// Toggle ID sort order
function toggleIdSort() {
    // Toggle between asc and desc
    idSortOrder = idSortOrder === 'desc' ? 'asc' : 'desc';

    // Update icon
    const icon = document.getElementById('sortIcon');
    icon.textContent = idSortOrder === 'desc' ? '⬇️' : '⬆️';

    // Reload documents with new sort order
    loadDocumentsByFilterTags();
}

// Change document limit
function changeDocumentLimit() {
    const select = document.getElementById('documentLimit');
    const value = select.value;

    // Set global limit ('all' means no limit)
    documentLimit = value === 'all' ? null : parseInt(value);

    // Reload documents with new limit
    loadDocumentsByFilterTags();
}

// Toggle select all documents
function toggleSelectAll() {
    const masterCheckbox = document.getElementById('selectAllDocuments');
    const checkboxes = document.querySelectorAll('.document-checkbox');

    checkboxes.forEach(checkbox => {
        checkbox.checked = masterCheckbox.checked;
    });

    updateBulkSelectionUI();
}

// Update bulk selection UI
function updateBulkSelectionUI() {
    const checkboxes = document.querySelectorAll('.document-checkbox');
    const checkedBoxes = document.querySelectorAll('.document-checkbox:checked');
    const masterCheckbox = document.getElementById('selectAllDocuments');
    const bulkProcessBtn = document.getElementById('bulkProcessBtn');
    const selectedCount = document.getElementById('selectedCount');

    // Update master checkbox state
    if (checkedBoxes.length === 0) {
        masterCheckbox.checked = false;
        masterCheckbox.indeterminate = false;
    } else if (checkedBoxes.length === checkboxes.length) {
        masterCheckbox.checked = true;
        masterCheckbox.indeterminate = false;
    } else {
        masterCheckbox.checked = false;
        masterCheckbox.indeterminate = true;
    }

    // Update bulk action button visibility and count
    if (checkedBoxes.length > 0) {
        bulkProcessBtn.style.display = 'inline-block';
        selectedCount.textContent = checkedBoxes.length;
    } else {
        bulkProcessBtn.style.display = 'none';
    }
}

// Start bulk processing - show configuration modal
async function startBulkProcessing() {
    const checkedBoxes = document.querySelectorAll('.document-checkbox:checked');
    const documentIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value));

    if (documentIds.length === 0) {
        showError(t('documents.no_documents_selected'));
        return;
    }

    // Store document IDs globally for later use
    window.bulkProcessingDocumentIds = documentIds;

    // Load available tags for the bulk processing tag selector
    try {
        const response = await fetch(`${API_BASE}/api/tags/all`);
        const data = await response.json();

        if (data.success) {
            const tagSelect = document.getElementById('bulkProcessingTagSelect');
            tagSelect.innerHTML = `<option value="">${t('documents.select_tag')}</option>`;

            data.tags.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.id;
                option.textContent = tag.name;
                tagSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading tags for bulk processing:', error);
    }

    // Reset all checkboxes to checked state
    document.getElementById('bulkUpdateTitle').checked = true;
    document.getElementById('bulkUpdateDate').checked = true;
    document.getElementById('bulkUpdateCorrespondent').checked = true;
    document.getElementById('bulkUpdateDocumentType').checked = true;
    document.getElementById('bulkUpdateStoragePath').checked = true;
    document.getElementById('bulkUpdateKeywords').checked = true;
    document.getElementById('bulkUpdateTags').checked = true;
    document.getElementById('bulkClearExistingTags').checked = false;
    document.getElementById('bulkAddProcessingTag').checked = false;
    document.getElementById('bulkProcessingTagSelect').disabled = true;

    // Show configuration modal
    const configModal = new bootstrap.Modal(document.getElementById('bulkProcessingConfigModal'), {
        backdrop: 'static',
        keyboard: false
    });
    configModal.show();
}

// Confirm and start bulk processing after configuration - Show text source modal first
async function confirmBulkProcessing() {
    const documentIds = window.bulkProcessingDocumentIds;

    if (!documentIds || documentIds.length === 0) {
        showError(t('documents.no_documents_selected'));
        return;
    }

    // Get selected fields
    const selectedFields = {
        title: document.getElementById('bulkUpdateTitle').checked,
        document_date: document.getElementById('bulkUpdateDate').checked,
        correspondent: document.getElementById('bulkUpdateCorrespondent').checked,
        document_type: document.getElementById('bulkUpdateDocumentType').checked,
        storage_path: document.getElementById('bulkUpdateStoragePath').checked,
        keywords: document.getElementById('bulkUpdateKeywords').checked,
        tags: document.getElementById('bulkUpdateTags').checked
    };

    // Get tag options
    const clearExistingTags = document.getElementById('bulkClearExistingTags').checked;
    const addProcessingTag = document.getElementById('bulkAddProcessingTag').checked;
    const processingTagId = addProcessingTag ? document.getElementById('bulkProcessingTagSelect').value : null;

    // Validate processing tag selection
    if (addProcessingTag && !processingTagId) {
        showError(t('documents.bulk_tag_required'));
        return;
    }

    // Save bulk configuration to global variable
    pendingBulkConfig = {
        documentIds,
        selectedFields,
        clearExistingTags,
        addProcessingTag,
        processingTagId
    };

    // Close configuration modal
    bootstrap.Modal.getInstance(document.getElementById('bulkProcessingConfigModal')).hide();

    // Reset text source selection to default (paperless)
    document.getElementById('textSourceOptionPaperless').checked = true;

    // Show text source selection modal
    const textSourceModal = new bootstrap.Modal(document.getElementById('textSourceModal'), {
        backdrop: 'static',
        keyboard: false
    });
    textSourceModal.show();
}

// Process bulk documents with selected text source
async function processBulkDocuments(textSourceMode, bulkConfig) {
    const { documentIds, selectedFields, clearExistingTags, addProcessingTag, processingTagId } = bulkConfig;

    // Reset abort flag
    bulkProcessingAborted = false;

    // Show progress modal
    const modal = new bootstrap.Modal(document.getElementById('processingModal'), {
        backdrop: 'static',
        keyboard: false
    });
    const modalBody = document.getElementById('processingModalBody');
    const modalFooter = document.getElementById('processingModalFooter');

    // Add event listener for modal close to abort processing
    const processingModalElement = document.getElementById('processingModal');
    const handleModalHide = () => {
        bulkProcessingAborted = true;
        if (currentAbortController) {
            currentAbortController.abort();
        }
    };
    processingModalElement.addEventListener('hidden.bs.modal', handleModalHide, { once: true });

    modal.show();

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    modalBody.innerHTML = `
        <div class="text-center">
            <h6 data-i18n="documents.bulk_processing">Bulk Processing</h6>
            <p><span data-i18n="documents.processing_documents">Processing documents</span>: <span id="bulkProgress">${processed}/${documentIds.length}</span></p>
            <div class="progress mb-3">
                <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar"
                     style="width: 0%" id="bulkProgressBar"></div>
            </div>
            <p class="text-muted small"><span data-i18n="documents.succeeded">Succeeded</span>: <span id="bulkSucceeded">${succeeded}</span> |
               <span data-i18n="documents.failed">Failed</span>: <span id="bulkFailed">${failed}</span></p>
        </div>
    `;

    modalFooter.innerHTML = `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal" disabled data-i18n="common.close">Close</button>`;

    // Process documents sequentially
    for (const documentId of documentIds) {
        // Check if processing was aborted
        if (bulkProcessingAborted) {
            break;
        }

        try {
            // Create AbortController for this request
            currentAbortController = new AbortController();

            // Process document with OpenAI
            const response = await fetch(`${API_BASE}/api/documents/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_id: documentId,
                    auto_update: false,  // We'll manually apply metadata with selected fields
                    text_source_mode: textSourceMode
                }),
                signal: currentAbortController.signal
            });

            const data = await response.json();

            if (data.success) {
                // Build metadata object with only selected fields
                const metadata = data.analysis.suggested_metadata;
                const selectedMetadata = {};

                if (selectedFields.title && metadata.title) {
                    selectedMetadata.title = metadata.title;
                }

                if (selectedFields.document_date && metadata.document_date) {
                    selectedMetadata.document_date = metadata.document_date;
                }

                if (selectedFields.correspondent && metadata.correspondent) {
                    selectedMetadata.correspondent = metadata.correspondent;
                }

                if (selectedFields.document_type && metadata.document_type) {
                    selectedMetadata.document_type = metadata.document_type;
                }

                if (selectedFields.storage_path && metadata.storage_path) {
                    selectedMetadata.storage_path = metadata.storage_path;
                }

                if (selectedFields.keywords && metadata.keywords) {
                    selectedMetadata.keywords = metadata.keywords;
                }

                if (selectedFields.tags && metadata.suggested_tags) {
                    selectedMetadata.suggested_tags = metadata.suggested_tags;
                    selectedMetadata.clear_existing_tags = clearExistingTags;
                }

                // Add bulk processing tag if requested
                if (addProcessingTag && processingTagId) {
                    // Add to suggested tags or create new array
                    if (!selectedMetadata.suggested_tags) {
                        selectedMetadata.suggested_tags = [];
                    }
                    // Add the processing tag by ID (will be converted to name by backend)
                    selectedMetadata.bulk_processing_tag_id = processingTagId;
                }

                // Apply selected metadata
                const applyResponse = await fetch(`${API_BASE}/api/documents/apply-metadata`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        document_id: documentId,
                        suggested_metadata: selectedMetadata
                    })
                });

                const applyData = await applyResponse.json();

                if (applyData.success) {
                    succeeded++;
                } else {
                    failed++;
                }
            } else {
                failed++;
            }
        } catch (error) {
            // Check if the error is due to abort
            if (error.name === 'AbortError') {
                console.log(`Processing aborted for document ${documentId}`);
                // Don't count as failed, just break the loop
                break;
            } else {
                console.error(`Error processing document ${documentId}:`, error);
                failed++;
            }
        }

        processed++;

        // Update progress
        const progressPercent = (processed / documentIds.length) * 100;
        document.getElementById('bulkProgress').textContent = `${processed}/${documentIds.length}`;
        document.getElementById('bulkProgressBar').style.width = `${progressPercent}%`;
        document.getElementById('bulkSucceeded').textContent = succeeded;
        document.getElementById('bulkFailed').textContent = failed;
    }

    // Show completion message
    const wasAborted = bulkProcessingAborted && processed < documentIds.length;
    const alertType = wasAborted ? 'warning' : (failed === 0 ? 'success' : 'warning');

    modalBody.innerHTML = `
        <div class="alert alert-${alertType}">
            <h6 data-i18n="documents.bulk_processing_complete">Bulk Processing Complete</h6>
            ${wasAborted ? '<p class="text-warning"><strong>⚠️ Processing was aborted by user</strong></p>' : ''}
            <p><span data-i18n="documents.total_processed">Total processed</span>: ${processed} / ${documentIds.length}</p>
            <p><span data-i18n="documents.succeeded">Succeeded</span>: ${succeeded}</p>
            <p><span data-i18n="documents.failed">Failed</span>: ${failed}</p>
        </div>
    `;

    modalFooter.innerHTML = `<button type="button" class="btn btn-primary" data-bs-dismiss="modal" data-i18n="common.close">Close</button>`;

    // Reload documents and clear selection
    await loadDocumentsByFilterTags();

    // Clear checkboxes after reload
    setTimeout(() => {
        document.getElementById('selectAllDocuments').checked = false;
        updateBulkSelectionUI();
    }, 500);
}

// Load all documents on homepage
async function loadDocumentsByFilterTags() {
    const loadingDiv = document.getElementById('documentsLoading');
    const contentDiv = document.getElementById('documentsContent');
    const countDiv = document.getElementById('documentCount');

    loadingDiv.style.display = 'block';
    contentDiv.innerHTML = '';

    try {
        // Use global idSortOrder
        const ordering = idSortOrder === 'desc' ? '-id' : 'id';

        // Load ALL documents (not filtered by auto-processing tag) with sorting
        const response = await fetch(`${API_BASE}/api/documents/filter?ordering=${ordering}`);
        const data = await response.json();

        loadingDiv.style.display = 'none';

        if (data.success && data.documents && data.documents.length > 0) {
            // Apply document limit
            const totalCount = data.documents.length;
            const displayDocuments = documentLimit ? data.documents.slice(0, documentLimit) : data.documents;

            contentDiv.innerHTML = displayDocuments.map(doc => createDocumentCard(doc)).join('');

            // Show count with limit info
            if (documentLimit && totalCount > documentLimit) {
                countDiv.textContent = `${displayDocuments.length} ${t('documents.of')} ${totalCount} ${t('documents.documents_found')}`;
            } else {
                countDiv.textContent = `${totalCount} ${t('documents.documents_found')}`;
            }
        } else {
            contentDiv.innerHTML = `<p class="text-muted">${t('documents.no_documents')}</p>`;
            countDiv.textContent = '';
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

        // Load storage paths
        const storagePathsResponse = await fetch(`${API_BASE}/api/storage-paths/all`);
        const storagePathsData = await storagePathsResponse.json();

        if (storagePathsData.success) {
            const filterStoragePathSelect = document.getElementById('filterStoragePath');
            filterStoragePathSelect.innerHTML = `<option value="">${t('documents.all_storage_paths')}</option>`;

            storagePathsData.storage_paths.forEach(storagePath => {
                const option = document.createElement('option');
                option.value = storagePath.id;
                option.textContent = storagePath.name;
                filterStoragePathSelect.appendChild(option);
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
    const countDiv = document.getElementById('documentCount');

    // Get filter values
    const selectedTags = Array.from(document.getElementById('filterDocumentTags').selectedOptions).map(opt => opt.value);
    const selectedCorrespondent = document.getElementById('filterCorrespondent').value;
    const selectedDocType = document.getElementById('filterDocumentType').value;
    const selectedStoragePath = document.getElementById('filterStoragePath').value;
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;

    // Use global idSortOrder
    const ordering = idSortOrder === 'desc' ? '-id' : 'id';

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

        if (selectedStoragePath) {
            params.append('storage_path', selectedStoragePath);
        }

        if (dateFrom) {
            params.append('created_after', dateFrom);
        }

        if (dateTo) {
            params.append('created_before', dateTo);
        }

        // Add ordering parameter
        params.append('ordering', ordering);

        // Fetch filtered documents
        const response = await fetch(`${API_BASE}/api/documents/filter?${params.toString()}`);
        const data = await response.json();

        loadingDiv.style.display = 'none';

        if (data.success && data.documents && data.documents.length > 0) {
            // Apply document limit
            const totalCount = data.documents.length;
            const displayDocuments = documentLimit ? data.documents.slice(0, documentLimit) : data.documents;

            contentDiv.innerHTML = displayDocuments.map(doc => createDocumentCard(doc)).join('');

            // Show count with limit info
            if (documentLimit && totalCount > documentLimit) {
                countDiv.textContent = `${displayDocuments.length} ${t('documents.of')} ${totalCount} ${t('documents.documents_found')}`;
            } else {
                countDiv.textContent = `${totalCount} ${t('documents.documents_found')}`;
            }
        } else {
            contentDiv.innerHTML = `<p class="text-muted">${t('documents.no_documents')}</p>`;
            countDiv.textContent = '';
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
    document.getElementById('filterStoragePath').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';

    // Reset sorting to default (descending)
    idSortOrder = 'desc';
    document.getElementById('sortIcon').textContent = '⬇️';

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
                storage_path: document.getElementById('promptStoragePath').value,
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
    // Build Paperless document URL
    const paperlessDocUrl = paperlessUrl ? `${paperlessUrl}/documents/${doc.id}/details` : '#';

    // Build tags display
    let tagsHtml = '';
    if (doc.tag_names && doc.tag_names.length > 0) {
        tagsHtml = `
            <div class="mt-2">
                ${doc.tag_names.map(tagName => `<span class="badge bg-secondary me-1">${tagName}</span>`).join('')}
            </div>
        `;
    }

    return `
        <div class="card document-card">
            <div class="card-body">
                <div class="d-flex align-items-start">
                    <div class="form-check me-3">
                        <input class="form-check-input document-checkbox" type="checkbox" value="${doc.id}" id="doc-${doc.id}" onchange="updateBulkSelectionUI()">
                    </div>
                    <div class="flex-grow-1">
                        <h6 class="card-title">
                            <a href="${paperlessDocUrl}" target="_blank" rel="noopener noreferrer" class="text-decoration-none">
                                ${doc.title || t('documents.untitled')}
                            </a>
                        </h6>
                        <p class="card-text text-muted small mb-1">
                            ${t('documents.id')}: ${doc.id} |
                            ${t('documents.created')}: ${new Date(doc.created).toLocaleDateString()}
                            ${doc.correspondent_name ? ' | ' + t('documents.from') + ': ' + doc.correspondent_name : ''}
                            ${doc.document_type_name ? ' | ' + t('processing.document_type') + ': ' + doc.document_type_name : ''}
                            ${doc.storage_path_name ? ' | ' + t('processing.storage_path') + ': ' + doc.storage_path_name : ''}
                        </p>
                        ${tagsHtml}
                    </div>
                    <button class="btn btn-primary btn-sm btn-process" onclick="processDocument(${doc.id})">
                        ${t('documents.analyze')}
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Process Document - Show text source modal first
async function processDocument(documentId) {
    // Store document ID for later use
    pendingDocumentId = documentId;

    // Reset text source selection to default (paperless)
    document.getElementById('textSourceOptionPaperless').checked = true;

    // Show text source selection modal
    const textSourceModal = new bootstrap.Modal(document.getElementById('textSourceModal'), {
        backdrop: 'static',
        keyboard: false
    });
    textSourceModal.show();
}

// Continue with document processing after text source selection
async function continueWithTextSource() {
    // Get selected text source
    const selectedOption = document.querySelector('input[name="textSourceOption"]:checked');
    const textSourceMode = selectedOption ? selectedOption.value : 'paperless';

    // Close text source modal
    bootstrap.Modal.getInstance(document.getElementById('textSourceModal')).hide();

    // Check if this is bulk processing or single document processing
    if (pendingBulkConfig) {
        // Bulk processing
        await processBulkDocuments(textSourceMode, pendingBulkConfig);
        pendingBulkConfig = null;
    } else if (pendingDocumentId) {
        // Single document processing
        // Show processing modal
        const modal = new bootstrap.Modal(document.getElementById('processingModal'), {
            backdrop: 'static',
            keyboard: false
        });
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
            const response = await fetch(`${API_BASE}/api/documents/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_id: pendingDocumentId,
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
        } finally {
            // Clear pending document ID
            pendingDocumentId = null;
        }
    }
}

// Display Processing Results
async function displayProcessingResults(data) {
    const modalBody = document.getElementById('processingModalBody');
    const modalFooter = document.getElementById('processingModalFooter');

    const metadata = data.analysis.suggested_metadata;
    const currentTags = data.current_metadata.tags || [];

    // Load available lists for dropdowns
    let availableCorrespondents = [];
    let availableDocumentTypes = [];
    let availableStoragePaths = [];
    let availableTags = [];

    try {
        const [correspsResp, docTypesResp, storagePathsResp, tagsResp] = await Promise.all([
            fetch(`${API_BASE}/api/correspondents/all`),
            fetch(`${API_BASE}/api/document-types/all`),
            fetch(`${API_BASE}/api/storage-paths/all`),
            fetch(`${API_BASE}/api/tags/all`)
        ]);

        const [correspsData, docTypesData, storagePathsData, tagsData] = await Promise.all([
            correspsResp.json(),
            docTypesResp.json(),
            storagePathsResp.json(),
            tagsResp.json()
        ]);

        if (correspsData.success) availableCorrespondents = correspsData.correspondents;
        if (docTypesData.success) availableDocumentTypes = docTypesData.document_types;
        if (storagePathsData.success) availableStoragePaths = storagePathsData.storage_paths;
        if (tagsData.success) availableTags = tagsData.tags;
    } catch (error) {
        console.error('Error loading metadata lists:', error);
    }

    // Build metadata selection form
    let metadataFields = '';

    // Title - Editable text field
    if (metadata.title) {
        metadataFields += `
            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="apply_title" checked>
                <label class="form-check-label w-100" for="apply_title">
                    <strong>${t('processing.suggested_title')}:</strong>
                    <div class="ms-4 mt-1">
                        <input type="text" class="form-control" id="edit_title" value="${metadata.title.replace(/"/g, '&quot;')}">
                    </div>
                </label>
            </div>
        `;
    }

    // Document Date - Editable date field
    if (metadata.document_date) {
        metadataFields += `
            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="apply_document_date" checked>
                <label class="form-check-label w-100" for="apply_document_date">
                    <strong>${t('processing.document_date')}:</strong>
                    <div class="ms-4 mt-1">
                        <input type="date" class="form-control" id="edit_document_date" value="${metadata.document_date}">
                    </div>
                </label>
            </div>
        `;
    }

    // Correspondent - Dropdown
    if (metadata.correspondent) {
        let correspondentOptions = availableCorrespondents.map(c =>
            `<option value="${c.name}" ${c.name === metadata.correspondent ? 'selected' : ''}>${c.name}</option>`
        ).join('');

        // Add AI suggestion if not in list
        const correspondentExists = availableCorrespondents.some(c => c.name === metadata.correspondent);
        if (!correspondentExists) {
            correspondentOptions = `<option value="${metadata.correspondent}" selected>${metadata.correspondent} (${t('common.new')})</option>` + correspondentOptions;
        }

        metadataFields += `
            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="apply_correspondent" checked>
                <label class="form-check-label w-100" for="apply_correspondent">
                    <strong>${t('processing.correspondent')}:</strong>
                    <div class="ms-4 mt-1">
                        <select class="form-select" id="edit_correspondent">
                            ${correspondentOptions}
                        </select>
                    </div>
                </label>
            </div>
        `;
    }

    // Document Type - Dropdown
    if (metadata.document_type) {
        let docTypeOptions = availableDocumentTypes.map(dt =>
            `<option value="${dt.name}" ${dt.name === metadata.document_type ? 'selected' : ''}>${dt.name}</option>`
        ).join('');

        // Add AI suggestion if not in list
        const docTypeExists = availableDocumentTypes.some(dt => dt.name === metadata.document_type);
        if (!docTypeExists) {
            docTypeOptions = `<option value="${metadata.document_type}" selected>${metadata.document_type} (${t('common.new')})</option>` + docTypeOptions;
        }

        metadataFields += `
            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="apply_document_type" checked>
                <label class="form-check-label w-100" for="apply_document_type">
                    <strong>${t('processing.document_type')}:</strong>
                    <div class="ms-4 mt-1">
                        <select class="form-select" id="edit_document_type">
                            ${docTypeOptions}
                        </select>
                    </div>
                </label>
            </div>
        `;
    }

    // Storage Path - Dropdown (only existing)
    if (metadata.storage_path) {
        let storagePathOptions = '<option value="">' + t('common.none') + '</option>';
        storagePathOptions += availableStoragePaths.map(sp =>
            `<option value="${sp.name}" ${sp.name === metadata.storage_path ? 'selected' : ''}>${sp.name}</option>`
        ).join('');

        metadataFields += `
            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="apply_storage_path" checked>
                <label class="form-check-label w-100" for="apply_storage_path">
                    <strong>${t('processing.storage_path')}:</strong>
                    <div class="ms-4 mt-1">
                        <select class="form-select" id="edit_storage_path">
                            ${storagePathOptions}
                        </select>
                    </div>
                </label>
            </div>
        `;
    }

    // Keywords - Editable text field
    if (metadata.keywords) {
        metadataFields += `
            <div class="form-check mb-3">
                <input class="form-check-input" type="checkbox" id="apply_keywords" checked>
                <label class="form-check-label w-100" for="apply_keywords">
                    <strong>${t('processing.content_keywords')}:</strong>
                    <div class="ms-4 mt-1">
                        <input type="text" class="form-control" id="edit_keywords" value="${metadata.keywords.replace(/"/g, '&quot;')}">
                    </div>
                </label>
            </div>
        `;
    }

    // Tags - Multi-Select
    if (metadata.suggested_tags && metadata.suggested_tags.length > 0) {
        let tagOptions = availableTags.map(tag => {
            const isSelected = metadata.suggested_tags.includes(tag.name);
            return `<option value="${tag.name}" ${isSelected ? 'selected' : ''}>${tag.name}</option>`;
        }).join('');

        // Add AI-suggested tags that don't exist yet
        metadata.suggested_tags.forEach(suggestedTag => {
            const tagExists = availableTags.some(t => t.name === suggestedTag);
            if (!tagExists) {
                tagOptions = `<option value="${suggestedTag}" selected>${suggestedTag} (${t('common.new')})</option>` + tagOptions;
            }
        });

        metadataFields += `
            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" id="apply_tags" checked>
                <label class="form-check-label w-100" for="apply_tags">
                    <strong>${t('processing.suggested_tags')}:</strong>
                    <div class="ms-4 mt-1">
                        <select class="form-select" id="edit_tags" multiple size="5">
                            ${tagOptions}
                        </select>
                        <div class="form-text small">${t('common.hold_ctrl')}</div>
                    </div>
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

    // Build extracted text section if available (Vision API)
    let extractedTextSection = '';
    if (data.analysis.extracted_text && data.analysis.text_source === 'vision_api') {
        const truncatedText = data.analysis.extracted_text.length > 1000
            ? data.analysis.extracted_text.substring(0, 1000) + '...'
            : data.analysis.extracted_text;

        extractedTextSection = `
            <div class="card mb-3">
                <div class="card-header bg-light">
                    <h6 class="mb-0">
                        <button class="btn btn-link text-decoration-none p-0 w-100 text-start" type="button"
                                data-bs-toggle="collapse" data-bs-target="#extractedTextCollapse"
                                aria-expanded="false" aria-controls="extractedTextCollapse">
                            <i class="bi bi-eye"></i> Vision API - Extracted Text (OCR)
                            <small class="text-muted">(${data.analysis.extracted_text.length} characters)</small>
                        </button>
                    </h6>
                </div>
                <div class="collapse" id="extractedTextCollapse">
                    <div class="card-body">
                        <div class="bg-light p-3 rounded" style="max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 0.85em; white-space: pre-wrap;">${data.analysis.extracted_text}</div>
                    </div>
                </div>
            </div>
        `;
    }

    // Build text source info badge
    let textSourceBadge = '';
    if (data.analysis?.text_source === 'vision_api') {
        textSourceBadge = ' <span class="badge bg-primary">Vision API</span>';
    } else if (data.analysis?.text_source === 'paperless') {
        textSourceBadge = ' <span class="badge bg-secondary">Paperless OCR</span>';
    } else if (data.analysis?.text_source === 'pdf_extraction') {
        textSourceBadge = ' <span class="badge bg-success">PDF Text Extraction</span>';
    }

    // Build text source info message
    let textSourceInfo = '';
    if (data.analysis?.text_source_info) {
        textSourceInfo = `<div class="small text-muted mt-2"><i class="bi bi-info-circle"></i> ${data.analysis.text_source_info}</div>`;
    }

    modalBody.innerHTML = `
        <h6 class="border-bottom pb-2 mb-3">${t('processing.select_fields_to_apply')}</h6>
        ${metadataFields || `<p class="text-muted">${t('processing.no_suggestions')}</p>`}

        ${extractedTextSection}

        <div class="alert alert-info small mt-3 mb-0">
            <strong>${t('processing.tokens_used')}:</strong> ${data.analysis.tokens_used || 0}${textSourceBadge}
            ${textSourceInfo}
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

    // Build metadata object with only selected fields (using edited values)
    const selectedMetadata = {};

    // Check each field and read edited value
    if (document.getElementById('apply_title')?.checked) {
        const editedValue = document.getElementById('edit_title')?.value;
        if (editedValue) {
            selectedMetadata.title = editedValue;
        }
    }

    if (document.getElementById('apply_document_date')?.checked) {
        const editedValue = document.getElementById('edit_document_date')?.value;
        if (editedValue) {
            selectedMetadata.document_date = editedValue;
        }
    }

    if (document.getElementById('apply_correspondent')?.checked) {
        const editedValue = document.getElementById('edit_correspondent')?.value;
        if (editedValue) {
            selectedMetadata.correspondent = editedValue;
        }
    }

    if (document.getElementById('apply_document_type')?.checked) {
        const editedValue = document.getElementById('edit_document_type')?.value;
        if (editedValue) {
            selectedMetadata.document_type = editedValue;
        }
    }

    if (document.getElementById('apply_storage_path')?.checked) {
        const editedValue = document.getElementById('edit_storage_path')?.value;
        if (editedValue) {
            selectedMetadata.storage_path = editedValue;
        }
    }

    if (document.getElementById('apply_keywords')?.checked) {
        const editedValue = document.getElementById('edit_keywords')?.value;
        if (editedValue) {
            selectedMetadata.keywords = editedValue;
        }
    }

    if (document.getElementById('apply_tags')?.checked) {
        const tagsSelect = document.getElementById('edit_tags');
        if (tagsSelect) {
            const selectedTags = Array.from(tagsSelect.selectedOptions).map(opt => opt.value);
            if (selectedTags.length > 0) {
                selectedMetadata.suggested_tags = selectedTags;
                // Check if existing tags should be cleared
                selectedMetadata.clear_existing_tags = document.getElementById('clear_existing_tags')?.checked || false;
            }
        }
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

// Toggle token edit mode
function toggleTokenEdit(fieldId) {
    const field = document.getElementById(fieldId);
    const btn = document.getElementById(`edit${fieldId.charAt(0).toUpperCase() + fieldId.slice(1)}Btn`);

    if (field.readOnly) {
        // Unlock field
        field.readOnly = false;
        field.value = '';
        field.placeholder = fieldId === 'paperlessToken' ? t('settings.paperless_token_placeholder') : 'sk-...';
        field.classList.remove('bg-light');
        btn.innerHTML = '🔒';
        btn.classList.remove('btn-outline-secondary');
        btn.classList.add('btn-outline-success');
    } else {
        // Lock field (reload settings to restore locked state)
        loadSettings();
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
        document.getElementById('openaiModel').value = settingsMap['openai_model'] || 'gpt-4-turbo-preview';
        document.getElementById('maxTextLength').value = settingsMap['max_text_length'] || '10000';
        document.getElementById('displayTextLength').value = settingsMap['display_text_length'] || '5000';

        // Handle Paperless Token
        const paperlessToken = document.getElementById('paperlessToken');
        const paperlessBtn = document.getElementById('editPaperlessTokenBtn');
        if (settingsMap['paperless_token'] === '***ENCRYPTED***') {
            paperlessToken.value = '';
            paperlessToken.placeholder = t('settings.token_is_set');
            paperlessToken.readOnly = true;
            paperlessToken.classList.add('bg-light');
            paperlessBtn.innerHTML = '🔓';
            paperlessBtn.classList.remove('btn-outline-success');
            paperlessBtn.classList.add('btn-outline-secondary');
        } else {
            paperlessToken.value = settingsMap['paperless_token'] || '';
            paperlessToken.readOnly = false;
            paperlessToken.classList.remove('bg-light');
            paperlessBtn.innerHTML = '🔓';
        }

        // Handle OpenAI Key
        const openaiKey = document.getElementById('openaiKey');
        const openaiBtn = document.getElementById('editOpenaiKeyBtn');
        if (settingsMap['openai_api_key'] === '***ENCRYPTED***') {
            openaiKey.value = '';
            openaiKey.placeholder = t('settings.key_is_set');
            openaiKey.readOnly = true;
            openaiKey.classList.add('bg-light');
            openaiBtn.innerHTML = '🔓';
            openaiBtn.classList.remove('btn-outline-success');
            openaiBtn.classList.add('btn-outline-secondary');
        } else {
            openaiKey.value = settingsMap['openai_api_key'] || '';
            openaiKey.readOnly = false;
            openaiKey.classList.remove('bg-light');
            openaiBtn.innerHTML = '🔓';
        }

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
            document.getElementById('promptStoragePath').value = prompts.storage_path || '';
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
            document.getElementById('promptStoragePath').value = defaults.storage_path || '';
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
            document.getElementById('promptStoragePath').value = config.storage_path || '';
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
        storage_path: document.getElementById('promptStoragePath').value,
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
        storage_path: document.getElementById('promptStoragePath').value,
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
            storage_path: document.getElementById('promptStoragePath').value,
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

    // Load Paperless URL for document links
    await loadPaperlessUrl();

    // Load initial data
    loadTags();

    // Toggle bulk processing tag select based on checkbox
    const bulkAddTagCheckbox = document.getElementById('bulkAddProcessingTag');
    if (bulkAddTagCheckbox) {
        bulkAddTagCheckbox.addEventListener('change', (e) => {
            document.getElementById('bulkProcessingTagSelect').disabled = !e.target.checked;
        });
    }
});
