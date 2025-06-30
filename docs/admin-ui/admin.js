// Admin Panel JavaScript
// Auto-detect API base URL based on current location
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:8000' 
    : 'https://sleepy-thunder-45656.pktriot.net';

let config = {};
let currentTab = 'dashboard';

// Initialize the admin panel
document.addEventListener('DOMContentLoaded', function() {
    // Check if admin is authenticated
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
        window.location.href = '../admin-login.html';
        return;
    }
    
    loadConfig();
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    setInterval(checkServerStatus, 30000);
    checkServerStatus();
    
    // Set up form handlers
    setupFormHandlers();
});

// Tab Management
function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Remove active class from all tabs
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
    
    currentTab = tabName;
    
    // Load tab-specific data
    if (tabName === 'collections') {
        loadCollections();
    } else if (tabName === 'schedules') {
        loadSchedules();
        loadCollectionsForSchedule();
    } else if (tabName === 'users') {
        loadUsers();
        loadUsersForAssignment();
        loadSchedulesForAssignment();
    } else if (tabName === 'dashboard') {
        loadDashboard();
    }
}

// API Functions
async function apiCall(endpoint, method = 'GET', data = null) {
    try {
        const adminToken = localStorage.getItem('adminToken');
        
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            credentials: 'include'
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(API_BASE + endpoint, options);
        
        if (response.status === 401 || response.status === 403) {
            // Token expired or invalid - redirect to login
            localStorage.removeItem('adminToken');
            window.location.href = '../admin-login.html';
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        showAlert('API call failed: ' + error.message, 'error');
        throw error;
    }
}

// Configuration Management
async function loadConfig() {
    try {
        config = await apiCall('/admin/config');
        updateConfigUI();
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

async function saveConfig() {
    try {
        await apiCall('/admin/config', 'POST', config);
        showAlert('Configuration saved successfully!', 'success');
    } catch (error) {
        console.error('Failed to save config:', error);
    }
}

function updateConfigUI() {
    // Update timezone
    if (config.settings && config.settings.timezone) {
        document.getElementById('timezone').value = config.settings.timezone;
    }
}

// Dashboard Functions
async function loadDashboard() {
    try {
        const status = await apiCall('/admin/status');
        updateDashboardStatus(status);
        loadCurrentFiles();
    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
}

function updateDashboardStatus(status) {
    const activeCount = status.activeSchedules ? status.activeSchedules.length : 0;
    document.getElementById('active-schedules-count').textContent = `${activeCount} active schedule(s)`;
}

async function loadCurrentFiles() {
    try {
        const files = await apiCall('/api/files');
        const filesDiv = document.getElementById('current-files');
        
        if (files.audioFiles && files.audioFiles.length > 0) {
            filesDiv.innerHTML = files.audioFiles.map(file => 
                `<div class="file-item">📄 ${file.name}</div>`
            ).join('');
        } else {
            filesDiv.innerHTML = '<p>No files currently available</p>';
        }
    } catch (error) {
        document.getElementById('current-files').innerHTML = '<p>Error loading files</p>';
    }
}

// Collections Management
async function loadCollections() {
    try {
        const collections = await apiCall('/admin/collections');
        displayCollections(collections);
    } catch (error) {
        document.getElementById('collections-list').innerHTML = '<p>Error loading collections</p>';
    }
}

function displayCollections(collections) {
    const listDiv = document.getElementById('collections-list');
    
    if (Object.keys(collections).length === 0) {
        listDiv.innerHTML = '<p>No collections found</p>';
        return;
    }
    
    listDiv.innerHTML = Object.entries(collections).map(([id, collection]) => `
        <div class="schedule-item">
            <h4>${collection.name}</h4>
            <p><strong>Path:</strong> ${collection.path}</p>
            <p><strong>Files:</strong> ${collection.files ? collection.files.length : 0}</p>
            <button class="btn btn-primary" onclick="editCollection('${id}')">Edit</button>
            <button class="btn btn-danger" onclick="deleteCollection('${id}')">Delete</button>
        </div>
    `).join('');
}

async function loadCollectionsForSchedule() {
    try {
        const collections = await apiCall('/admin/collections');
        const select = document.getElementById('schedule-collection');
        
        select.innerHTML = '<option value="">Select a collection</option>';
        Object.entries(collections).forEach(([id, collection]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = collection.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load collections for schedule:', error);
    }
}

async function browseFiles() {
    const path = document.getElementById('browse-path').value;
    try {
        const response = await apiCall(`/admin/browse?path=${encodeURIComponent(path)}`);
        displayFileBrowser(response);
    } catch (error) {
        document.getElementById('file-browser').innerHTML = '<p>Error browsing files: ' + error.message + '</p>';
    }
}

function displayFileBrowser(response) {
    const browserDiv = document.getElementById('file-browser');
    const pathInput = document.getElementById('browse-path');
    
    // Handle new response format with currentPath and items
    const files = response.items || response;
    const currentPath = response.currentPath;
    
    // Update the path input with current path
    if (currentPath) {
        pathInput.value = currentPath;
    }
    
    if (!files || files.length === 0) {
        browserDiv.innerHTML = '<p>No files found in this directory</p>';
        return;
    }
    
    // Add current path display and file selection controls
    const audioFiles = files.filter(f => f.type === 'file');
    const hasAudioFiles = audioFiles.length > 0;
    
    const pathDisplay = currentPath ? `<div style="background: #e2e8f0; padding: 10px; border-radius: 5px; margin-bottom: 10px; font-family: monospace; font-size: 0.9em;">📁 ${currentPath}</div>` : '';
    
    // Get file extensions for selective options
    const extensions = [...new Set(audioFiles.map(f => f.name.split('.').pop().toLowerCase()))];
    const extensionButtons = extensions.map(ext => {
        const count = audioFiles.filter(f => f.name.toLowerCase().endsWith(`.${ext}`)).length;
        return `<button type="button" class="btn btn-small" onclick="selectFilesByExtension('${ext}')">${ext.toUpperCase()} (${count})</button>`;
    }).join('');
    
    const selectionControls = hasAudioFiles ? `
        <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
            <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 8px;">
                <span style="font-weight: 600; color: #4a5568;">Quick Select:</span>
                <button type="button" class="btn btn-small" onclick="selectAllAudioFiles()">All Audio Files (${audioFiles.length})</button>
                <button type="button" class="btn btn-small" onclick="clearAllFileSelections()">Clear All</button>
            </div>
            ${extensions.length > 1 ? `
                <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 8px;">
                    <span style="font-weight: 600; color: #4a5568;">By Type:</span>
                    ${extensionButtons}
                </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #718096; font-size: 0.9em;" id="selection-count">0 files selected</span>
                <span style="color: #718096; font-size: 0.8em;">💡 Tip: Use checkboxes or buttons above for quick selection</span>
            </div>
        </div>
    ` : '';
    
    browserDiv.innerHTML = pathDisplay + selectionControls + files.map(file => `
        <div class="file-item">
            ${file.type === 'file' ? 
                `<input type="checkbox" id="file-${file.name}" value="${file.path}" data-filename="${file.name}">` :
                ''
            }
            <label for="file-${file.name}" ${file.type === 'directory' ? 'style="cursor: pointer;" onclick="browseDirectory(\'' + file.path.replace(/'/g, "\\'") + '\')"' : ''}>
                ${file.type === 'directory' ? '📁' : '📄'} ${file.name}
                ${file.type === 'directory' ? ' (click to browse)' : ''}
                ${file.type === 'file' ? ` (${formatFileSize(file.size)})` : ''}
            </label>
        </div>
    `).join('');
    
    // Add event listeners to checkboxes for real-time count updates
    setTimeout(() => {
        const checkboxes = document.querySelectorAll('#file-browser input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', updateSelectionCount);
        });
        updateSelectionCount(); // Initial count
    }, 50);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Schedule Management
async function loadSchedules() {
    try {
        const schedules = await apiCall('/admin/schedules');
        displaySchedules(schedules);
    } catch (error) {
        document.getElementById('schedules-list').innerHTML = '<p>Error loading schedules</p>';
    }
}

function displaySchedules(schedules) {
    const listDiv = document.getElementById('schedules-list');
    
    if (Object.keys(schedules).length === 0) {
        listDiv.innerHTML = '<p>No schedules found</p>';
        return;
    }
    
    listDiv.innerHTML = Object.entries(schedules).map(([id, schedule]) => `
        <div class="schedule-item ${schedule.enabled ? 'active' : 'inactive'}">
            <h4>${schedule.name}</h4>
            <p><strong>Collection:</strong> ${schedule.collection}</p>
            <p><strong>Status:</strong> ${schedule.enabled ? 'Active' : 'Inactive'}</p>
            <div class="time-slot">
                <strong>Time Slots:</strong><br>
                ${schedule.timeSlots.map(slot => 
                    `${formatDaysOfWeek(slot.dayOfWeek)}: ${slot.startTime} - ${slot.endTime}`
                ).join('<br>')}
            </div>
            <button class="btn btn-primary" onclick="editSchedule('${id}')">Edit</button>
            <button class="btn ${schedule.enabled ? 'btn-danger' : 'btn-success'}" 
                    onclick="toggleSchedule('${id}')">${schedule.enabled ? 'Disable' : 'Enable'}</button>
            <button class="btn btn-danger" onclick="deleteSchedule('${id}')">Delete</button>
        </div>
    `).join('');
}

function formatDaysOfWeek(dayOfWeek) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    if (dayOfWeek === '*') {
        return 'Every day';
    }
    
    const days = dayOfWeek.split(',').map(d => parseInt(d.trim()));
    
    // Check for common patterns
    if (days.length === 5 && days.every(d => d >= 1 && d <= 5)) {
        return 'Weekdays (Mon-Fri)';
    }
    
    if (days.length === 2 && days.includes(0) && days.includes(6)) {
        return 'Weekends (Sat-Sun)';
    }
    
    // Custom selection
    if (days.length === 1) {
        return dayNames[days[0]];
    }
    
    return days.map(d => dayNames[d]).join(', ');
}

// Form Handlers
function setupFormHandlers() {
    // Collection form
    document.getElementById('collection-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const name = document.getElementById('collection-name').value;
        // Auto-generate path from collection name since files are manually selected
        const path = `./collections/${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const files = getSelectedFiles();
        const fileLimit = document.getElementById('collection-file-limit').value;
        const fileLimitNumber = fileLimit ? parseInt(fileLimit) : null;
        const editingId = this.dataset.editingId;
        
        try {
            if (editingId) {
                // Update existing collection
                await apiCall(`/admin/collections/${editingId}`, 'PUT', {
                    name,
                    path,
                    files,
                    fileLimit: fileLimitNumber
                });
                showAlert('Collection updated successfully!', 'success');
                cancelEditCollection();
            } else {
                // Create new collection
                await apiCall('/admin/collections', 'POST', {
                    name,
                    path,
                    files,
                    fileLimit: fileLimitNumber
                });
                showAlert('Collection created successfully!', 'success');
                this.reset();
            }
            
            loadCollections();
        } catch (error) {
            console.error('Failed to save collection:', error);
        }
    });
    
    // Schedule form
    document.getElementById('schedule-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const selectedDays = getSelectedDays();
        
        const formData = {
            name: document.getElementById('schedule-name').value,
            collection: document.getElementById('schedule-collection').value,
            enabled: true,
            timeSlots: [{
                id: 'slot1',
                dayOfWeek: selectedDays,
                startTime: document.getElementById('schedule-start-time').value,
                endTime: document.getElementById('schedule-end-time').value,
                timezone: config.settings?.timezone || 'Asia/Kolkata'
            }],
            dateRange: {
                startDate: document.getElementById('schedule-start-date').value || null,
                endDate: document.getElementById('schedule-end-date').value || null
            }
        };
        
        const editingId = this.dataset.editingId;
        
        try {
            if (editingId) {
                // Update existing schedule
                await apiCall(`/admin/schedules/${editingId}`, 'PUT', formData);
                showAlert('Schedule updated successfully!', 'success');
                cancelEditSchedule();
            } else {
                // Create new schedule
                await apiCall('/admin/schedules', 'POST', formData);
                showAlert('Schedule created successfully!', 'success');
                this.reset();
            }
            
            loadSchedules();
        } catch (error) {
            console.error('Failed to save schedule:', error);
        }
    });
    
    // Settings form
    document.getElementById('settings-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const settings = {
            timezone: document.getElementById('timezone').value,
            adminPassword: document.getElementById('admin-password').value || undefined
        };
        
        try {
            await apiCall('/admin/settings', 'POST', settings);
            showAlert('Settings saved successfully!', 'success');
            loadConfig();
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    });
    
    // User schedule assignment form
    document.getElementById('user-schedule-form').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const userId = document.getElementById('user-select').value;
        const scheduleId = document.getElementById('user-schedule-select').value;
        
        try {
            await apiCall('/admin/users/assign-schedule', 'POST', {
                userId,
                scheduleId
            });
            showAlert('Schedule assigned to user successfully!', 'success');
            this.reset();
            loadUsers(); // Refresh user list
        } catch (error) {
            console.error('Failed to assign schedule:', error);
        }
    });
}

// Utility Functions
function getSelectedFiles() {
    const checkboxes = document.querySelectorAll('#file-browser input[type="checkbox"]:checked');
    // Use the filename (data-filename) instead of the full path (value)
    return Array.from(checkboxes).map(cb => cb.dataset.filename || cb.value);
}

// Function to browse into directories
async function browseDirectory(dirPath) {
    document.getElementById('browse-path').value = dirPath;
    await browseFiles();
}

// Function to set path and browse
async function setPath(newPath) {
    document.getElementById('browse-path').value = newPath;
    await browseFiles();
}

// Function to select all audio files in current directory
function selectAllAudioFiles() {
    const checkboxes = document.querySelectorAll('#file-browser input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    updateSelectionCount();
}

// Function to clear all file selections
function clearAllFileSelections() {
    const checkboxes = document.querySelectorAll('#file-browser input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    updateSelectionCount();
}

// Function to select files by extension
function selectFilesByExtension(extension) {
    const checkboxes = document.querySelectorAll('#file-browser input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        const filename = checkbox.getAttribute('data-filename');
        if (filename && filename.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) {
            checkbox.checked = true;
        }
    });
    updateSelectionCount();
}

// Function to update selection count display
function updateSelectionCount() {
    const checkboxes = document.querySelectorAll('#file-browser input[type="checkbox"]');
    const selectedCount = document.querySelectorAll('#file-browser input[type="checkbox"]:checked').length;
    const totalCount = checkboxes.length;
    
    const countElement = document.getElementById('selection-count');
    if (countElement) {
        countElement.textContent = `${selectedCount} of ${totalCount} files selected`;
        
        // Add visual feedback
        if (selectedCount > 0) {
            countElement.style.color = '#38a169';
            countElement.style.fontWeight = '600';
        } else {
            countElement.style.color = '#718096';
            countElement.style.fontWeight = 'normal';
        }
    }
}

// Day selection helper functions
function getSelectedDays() {
    const checkboxes = document.querySelectorAll('.day-checkbox input[type="checkbox"]:checked');
    const selectedDays = Array.from(checkboxes).map(cb => cb.value);
    
    // If all days are selected, return "*"
    if (selectedDays.length === 7) {
        return '*';
    }
    
    // Return comma-separated string of day numbers
    return selectedDays.sort((a, b) => parseInt(a) - parseInt(b)).join(',');
}

function setSelectedDays(dayOfWeek) {
    // Clear all checkboxes first
    clearAllDays();
    
    if (dayOfWeek === '*') {
        // Select all days
        selectAllDays();
    } else {
        // Select specific days
        const days = dayOfWeek.split(',');
        days.forEach(day => {
            const checkbox = document.getElementById(`day-${day.trim()}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        });
    }
}

function selectAllDays() {
    const checkboxes = document.querySelectorAll('.day-checkbox input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
}

function selectWeekdays() {
    clearAllDays();
    [1, 2, 3, 4, 5].forEach(day => {
        document.getElementById(`day-${day}`).checked = true;
    });
}

function selectWeekends() {
    clearAllDays();
    [0, 6].forEach(day => {
        document.getElementById(`day-${day}`).checked = true;
    });
}

function clearAllDays() {
    const checkboxes = document.querySelectorAll('.day-checkbox input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
}

async function checkServerStatus() {
    try {
        await apiCall('/admin/status');
        document.getElementById('server-status').className = 'status-indicator status-online';
        document.getElementById('server-status-text').textContent = 'Online';
    } catch (error) {
        document.getElementById('server-status').className = 'status-indicator status-offline';
        document.getElementById('server-status-text').textContent = 'Offline';
    }
}

function updateCurrentTime() {
    const now = new Date();
    const timezone = config.settings?.timezone || 'America/New_York';
    
    try {
        const timeString = now.toLocaleString('en-US', {
            timeZone: timezone,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        document.getElementById('current-time').textContent = timeString;
    } catch (error) {
        document.getElementById('current-time').textContent = now.toString();
    }
}

function showAlert(message, type) {
    // Create alert element
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    // Insert at top of current tab
    const activeTab = document.querySelector('.tab-content.active');
    activeTab.insertBefore(alert, activeTab.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// Action Functions
async function toggleSchedule(scheduleId) {
    try {
        await apiCall(`/admin/schedules/${scheduleId}/toggle`, 'POST');
        loadSchedules();
        showAlert('Schedule status updated!', 'success');
    } catch (error) {
        console.error('Failed to toggle schedule:', error);
    }
}

async function editSchedule(scheduleId) {
    try {
        const schedules = await apiCall('/admin/schedules');
        const schedule = schedules[scheduleId];
        
        if (!schedule) {
            showAlert('Schedule not found!', 'error');
            return;
        }
        
        // Populate form with existing data
        document.getElementById('schedule-name').value = schedule.name;
        document.getElementById('schedule-collection').value = schedule.collection;
        setSelectedDays(schedule.timeSlots[0]?.dayOfWeek || '*');
        document.getElementById('schedule-start-time').value = schedule.timeSlots[0]?.startTime || '';
        document.getElementById('schedule-end-time').value = schedule.timeSlots[0]?.endTime || '';
        document.getElementById('schedule-start-date').value = schedule.dateRange?.startDate || '';
        document.getElementById('schedule-end-date').value = schedule.dateRange?.endDate || '';
        
        // Change form to edit mode
        const form = document.getElementById('schedule-form');
        const submitButton = form.querySelector('button[type="submit"]');
        
        // Store the schedule ID for updating
        form.dataset.editingId = scheduleId;
        submitButton.textContent = 'Update Schedule';
        submitButton.className = 'btn btn-success';
        
        // Add cancel button
        let cancelButton = form.querySelector('.cancel-edit');
        if (!cancelButton) {
            cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.className = 'btn btn-danger cancel-edit';
            cancelButton.textContent = 'Cancel Edit';
            cancelButton.onclick = cancelEditSchedule;
            submitButton.parentNode.insertBefore(cancelButton, submitButton.nextSibling);
        }
        
        // Scroll to form
        form.scrollIntoView({ behavior: 'smooth' });
        
        showAlert('Editing schedule. Make your changes and click "Update Schedule".', 'success');
        
    } catch (error) {
        console.error('Failed to load schedule for editing:', error);
        showAlert('Failed to load schedule for editing!', 'error');
    }
}

function cancelEditSchedule() {
    const form = document.getElementById('schedule-form');
    const submitButton = form.querySelector('button[type="submit"]');
    const cancelButton = form.querySelector('.cancel-edit');
    
    // Reset form
    form.reset();
    delete form.dataset.editingId;
    
    // Clear day checkboxes
    clearAllDays();
    
    // Reset button
    submitButton.textContent = 'Create Schedule';
    submitButton.className = 'btn btn-primary';
    
    // Remove cancel button
    if (cancelButton) {
        cancelButton.remove();
    }
    
    showAlert('Edit cancelled', 'success');
}

async function deleteSchedule(scheduleId) {
    if (confirm('Are you sure you want to delete this schedule?')) {
        try {
            await apiCall(`/admin/schedules/${scheduleId}`, 'DELETE');
            loadSchedules();
            showAlert('Schedule deleted!', 'success');
        } catch (error) {
            console.error('Failed to delete schedule:', error);
        }
    }
}

async function editCollection(collectionId) {
    try {
        const collections = await apiCall('/admin/collections');
        const collection = collections[collectionId];
        
        if (!collection) {
            showAlert('Collection not found!', 'error');
            return;
        }
        
        // Populate form with existing data
        document.getElementById('collection-name').value = collection.name;
        document.getElementById('collection-file-limit').value = collection.fileLimit || '';
        
        // Change form to edit mode
        const form = document.getElementById('collection-form');
        const submitButton = form.querySelector('button[type="submit"]');
        
        // Store the collection ID for updating
        form.dataset.editingId = collectionId;
        submitButton.textContent = 'Update Collection';
        submitButton.className = 'btn btn-success';
        
        // Add cancel button
        let cancelButton = form.querySelector('.cancel-edit');
        if (!cancelButton) {
            cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.className = 'btn btn-danger cancel-edit';
            cancelButton.textContent = 'Cancel Edit';
            cancelButton.onclick = cancelEditCollection;
            submitButton.parentNode.insertBefore(cancelButton, submitButton.nextSibling);
        }
        
        // Load files for this collection's path
        document.getElementById('browse-path').value = collection.path;
        await browseFiles();
        
        // Pre-select files that are in this collection
        if (collection.files) {
            collection.files.forEach(fileName => {
                const checkbox = document.querySelector(`#file-browser input[data-filename="${fileName}"]`);
                if (checkbox) {
                    checkbox.checked = true;
                }
            });
        }
        
        // Scroll to form
        form.scrollIntoView({ behavior: 'smooth' });
        
        showAlert('Editing collection. Make your changes and click "Update Collection".', 'success');
        
    } catch (error) {
        console.error('Failed to load collection for editing:', error);
        showAlert('Failed to load collection for editing!', 'error');
    }
}

function cancelEditCollection() {
    const form = document.getElementById('collection-form');
    const submitButton = form.querySelector('button[type="submit"]');
    const cancelButton = form.querySelector('.cancel-edit');
    
    // Reset form
    form.reset();
    delete form.dataset.editingId;
    
    // Reset button
    submitButton.textContent = 'Create Collection';
    submitButton.className = 'btn btn-primary';
    
    // Remove cancel button
    if (cancelButton) {
        cancelButton.remove();
    }
    
    // Clear file browser
    document.getElementById('file-browser').innerHTML = '<p>Click "Browse" to see available files</p>';
    
    showAlert('Edit cancelled', 'success');
}

async function deleteCollection(collectionId) {
    if (confirm('Are you sure you want to delete this collection?')) {
        try {
            await apiCall(`/admin/collections/${collectionId}`, 'DELETE');
            loadCollections();
            showAlert('Collection deleted!', 'success');
        } catch (error) {
            console.error('Failed to delete collection:', error);
        }
    }
}

async function exportConfig() {
    try {
        const config = await apiCall('/admin/config');
        const dataStr = JSON.stringify(config, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = 'audio-server-config.json';
        link.click();
        
        showAlert('Configuration exported!', 'success');
    } catch (error) {
        console.error('Failed to export config:', error);
    }
}

async function resetConfig() {
    if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
        try {
            await apiCall('/admin/reset', 'POST');
            loadConfig();
            showAlert('Configuration reset to defaults!', 'success');
        } catch (error) {
            console.error('Failed to reset config:', error);
        }
    }
}

// User Management Functions
async function loadUsers() {
    try {
        const users = await apiCall('/admin/users');
        displayUsers(users);
    } catch (error) {
        document.getElementById('users-list').innerHTML = '<p>Error loading users</p>';
    }
}

function displayUsers(users) {
    const listDiv = document.getElementById('users-list');
    
    if (!users || Object.keys(users).length === 0) {
        listDiv.innerHTML = '<p>No users registered yet</p>';
        return;
    }
    
    listDiv.innerHTML = Object.entries(users).map(([userId, user]) => {
        const userSchedules = config.userSchedules && config.userSchedules[userId] 
            ? config.userSchedules[userId].length 
            : 0;
        
        return `
            <div class="schedule-item">
                <h4>${user.name}</h4>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Registered:</strong> ${new Date(user.createdAt).toLocaleDateString()}</p>
                <p><strong>Assigned Schedules:</strong> ${userSchedules}</p>
                <p><strong>Status:</strong> ${user.verified ? 'Verified' : 'Unverified'}</p>
                <button class="btn btn-danger" onclick="removeUserSchedules('${userId}')">Remove All Schedules</button>
            </div>
        `;
    }).join('');
}

async function loadUsersForAssignment() {
    try {
        const users = await apiCall('/admin/users');
        const select = document.getElementById('user-select');
        
        select.innerHTML = '<option value="">Select a user</option>';
        Object.entries(users).forEach(([userId, user]) => {
            const option = document.createElement('option');
            option.value = userId;
            option.textContent = `${user.name} (${user.email})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load users for assignment:', error);
    }
}

async function loadSchedulesForAssignment() {
    try {
        const schedules = await apiCall('/admin/schedules');
        const select = document.getElementById('user-schedule-select');
        
        select.innerHTML = '<option value="">Select a schedule</option>';
        Object.entries(schedules).forEach(([scheduleId, schedule]) => {
            const option = document.createElement('option');
            option.value = scheduleId;
            option.textContent = schedule.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load schedules for assignment:', error);
    }
}

async function removeUserSchedules(userId) {
    if (confirm('Are you sure you want to remove all schedules from this user?')) {
        try {
            await apiCall('/admin/users/remove-schedules', 'POST', { userId });
            loadUsers();
            showAlert('All schedules removed from user!', 'success');
        } catch (error) {
            console.error('Failed to remove user schedules:', error);
        }
    }
}

// Admin logout function
async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            await apiCall('/admin/logout', 'POST');
            // Clear admin token
            localStorage.removeItem('adminToken');
            // Redirect to admin login
            window.location.href = '../admin-login.html';
        } catch (error) {
            console.error('Logout failed:', error);
            // Force redirect even if API call fails
            localStorage.removeItem('adminToken');
            window.location.href = '../admin-login.html';
        }
    }
}