// Admin Panel JavaScript
// Auto-detect API base URL based on current location
let API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:8000' 
    : 'https://misty-sunset-29095.pktriot.net';

let workingPort = null;

// Function to find working port
async function findWorkingPort() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const ports = [8000, 8001, 8002, 8003, 8004, 8005];
        
        for (const port of ports) {
            try {
                const testUrl = `http://localhost:${port}`;
                const response = await fetch(`${testUrl}/api/health`, { 
                    signal: AbortSignal.timeout(2000),
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
                    }
                });
                
                if (response.ok) {
                    workingPort = port;
                    API_BASE = testUrl;
                    console.log(`✅ Found working server on port ${port}`);
                    return testUrl;
                }
            } catch (error) {
                // Continue trying other ports
            }
        }
    }
    
    return API_BASE;
}

let config = {};
let currentTab = 'dashboard';

// Initialize the admin panel
document.addEventListener('DOMContentLoaded', async function() {
    // Check if admin is authenticated
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) {
        window.location.href = '../admin-login.html';
        return;
    }
    
    // Find working port first
    await findWorkingPort();
    
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
    } else if (tabName === 'assign-students') {
        loadUnassignedStudents();
        loadAssignedStudents();
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
    if (config.config && config.config.timezone) {
        document.getElementById('timezone').value = config.config.timezone;
    } else if (config.settings && config.settings.timezone) {
        document.getElementById('timezone').value = config.settings.timezone;
    }
    
    // Update admin information
    if (config.config && config.config.admin) {
        const admin = config.config.admin;
        
        // Update institution name
        document.getElementById('institution-name').textContent = admin.instituteName || 'Not set';
        
        // Update admin email
        document.getElementById('admin-email').textContent = admin.email || 'Not set';
        
        // Update invitation code
        document.getElementById('invitation-code').textContent = admin.inviteCode || 'Not available';
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
        const response = await apiCall('/admin/collections');
        const collections = response.collections || [];
        // Convert array to object format expected by displayCollections
        const collectionsObj = {};
        collections.forEach(collection => {
            collectionsObj[collection.collectionId] = collection;
        });
        displayCollections(collectionsObj);
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
        const response = await apiCall('/admin/collections');
        const collections = response.collections || [];
        const select = document.getElementById('schedule-collection');
        
        select.innerHTML = '<option value="">Select a collection</option>';
        collections.forEach(collection => {
            const id = collection.collectionId;
            const option = document.createElement('option');
            option.value = id;
            option.textContent = collection.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load collections for schedule:', error);
    }
}

// Function to load audio files with folder browsing support
async function loadAudioFiles() {
    try {
        // Start with the audio folder
        const audioPath = './audio';
        const response = await apiCall(`/admin/browse?path=${encodeURIComponent(audioPath)}`);
        displayFileBrowser(response);
        
        // Update the path input field
        const pathInput = document.getElementById('browse-path');
        if (pathInput && response.currentPath) {
            pathInput.value = response.currentPath;
        }
    } catch (error) {
        console.error('Error loading audio files:', error);
        const errorMessage = error.message || 'Unknown error';
        document.getElementById('file-browser').innerHTML = `
            <div style="background: #fed7d7; color: #c53030; padding: 15px; border-radius: 8px; border: 1px solid #feb2b2;">
                <strong>🚫 Access Denied:</strong> ${errorMessage}
                <br><br>
                <em>Unable to load audio files. Please check the audio folder.</em>
            </div>
        `;
    }
}

async function browseFiles() {
    const path = document.getElementById('browse-path').value;
    await browseToPath(path);
}

async function browseToPath(path) {
    try {
        const response = await apiCall(`/admin/browse?path=${encodeURIComponent(path)}`);
        displayFileBrowser(response);
        updateAllowedDirectories(response.allowedRoots);
        
        // Update the path input field
        const pathInput = document.getElementById('browse-path');
        if (pathInput && response.currentPath) {
            pathInput.value = response.currentPath;
        }
    } catch (error) {
        const errorMessage = error.message || 'Unknown error';
        document.getElementById('file-browser').innerHTML = `
            <div style="background: #fed7d7; color: #c53030; padding: 15px; border-radius: 8px; border: 1px solid #feb2b2;">
                <strong>🚫 Access Denied:</strong> ${errorMessage}
                <br><br>
                <em>For security reasons, you can only browse files within allowed directories.</em>
            </div>
        `;
    }
}

function updateAllowedDirectories(allowedRoots) {
    if (!allowedRoots || allowedRoots.length === 0) return;
    
    const container = document.getElementById('allowed-directories');
    if (!container) return;
    
    // Clear existing dynamic buttons (keep the static ones)
    const existingButtons = container.querySelectorAll('.dynamic-dir-btn');
    existingButtons.forEach(btn => btn.remove());
    
    // Add buttons for allowed directories
    allowedRoots.forEach(root => {
        if (root.path && root.name) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-small dynamic-dir-btn';
            button.textContent = `📂 ${root.name}`;
            button.onclick = () => setPath(root.path);
            container.appendChild(button);
        }
    });
}

function displayFileBrowser(response) {
    const browserDiv = document.getElementById('file-browser');
    
    // Handle new response format with currentPath and files
    const files = response.files || response.items || response;
    const currentPath = response.currentPath || '';
    const parentPath = response.parentPath;
    
    // Separate directories and audio files
    const directories = files.filter(f => f.type === 'directory');
    const audioFiles = files.filter(f => f.type === 'file' && f.isAudio);
    
    // Build navigation section
    let navigationHtml = '';
    if (currentPath) {
        navigationHtml = `
            <div style="background: #e2e8f0; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-weight: 600; color: #2d3748;">📁 Current: ${currentPath}</span>
                    ${parentPath ? `<button type="button" class="btn btn-small" onclick="browseToPath('${parentPath}')">⬆️ Up</button>` : ''}
                </div>
            </div>
        `;
    }
    
    // Build directories section
    let directoriesHtml = '';
    if (directories.length > 0) {
        directoriesHtml = `
            <div style="background: #f7fafc; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                <h4 style="margin: 0 0 10px 0; color: #2d3748;">📂 Folders</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px;">
                    ${directories.map(dir => `
                        <button type="button" class="btn btn-small" onclick="browseToPath('${dir.fullPath}')" 
                                style="text-align: left; padding: 8px 12px;">
                            📁 ${dir.name}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Build audio files section
    let audioFilesHtml = '';
    if (audioFiles.length === 0) {
        audioFilesHtml = '<p style="color: #718096; font-style: italic;">No audio files found in this folder</p>';
    } else {
        // Get file extensions for selective options
        const extensions = [...new Set(audioFiles.map(f => f.name.split('.').pop().toLowerCase()))];
        const extensionButtons = extensions.map(ext => {
            const count = audioFiles.filter(f => f.name.toLowerCase().endsWith(`.${ext}`)).length;
            return `<button type="button" class="btn btn-small" onclick="selectFilesByExtension('${ext}')">${ext.toUpperCase()} (${count})</button>`;
        }).join('');
        
        // File selection controls
        const selectionControls = `
            <div style="background: #f8f9fa; padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                <h4 style="margin: 0 0 10px 0; color: #2d3748;">🎵 Audio Files (${audioFiles.length})</h4>
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
        `;
        
        // Display audio files with checkboxes
        audioFilesHtml = selectionControls + audioFiles.map(file => `
            <div class="file-item">
                <input type="checkbox" id="file-${file.name}" value="${file.path}" data-filename="${file.name}">
                <label for="file-${file.name}">
                    📄 ${file.name} (${formatFileSize(file.size)})
                </label>
            </div>
        `).join('');
    }
    
    // Combine all sections
    browserDiv.innerHTML = navigationHtml + directoriesHtml + audioFilesHtml;
    
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
        const response = await apiCall('/admin/schedules');
        const schedules = response.schedules || [];
        // Convert array to object format expected by displaySchedules
        const schedulesObj = {};
        schedules.forEach(schedule => {
            schedulesObj[schedule.scheduleId] = schedule;
        });
        displaySchedules(schedulesObj);
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
            <p><strong>Collection:</strong> ${schedule.collectionId}</p>
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
        // Use current browsed path instead of hardcoded ./audio
        const path = document.getElementById('browse-path').value || './audio';
        const files = getSelectedFiles();
        
        // DEBUG: Log what we're getting
        console.log('=== COLLECTION FORM DEBUG ===');
        console.log('Collection name:', name);
        console.log('Files selected:', files);
        console.log('Files length:', files.length);
        console.log('Checkboxes in DOM:', document.querySelectorAll('#file-browser input[type="checkbox"]').length);
        console.log('Checked checkboxes:', document.querySelectorAll('#file-browser input[type="checkbox"]:checked').length);
        
        // Validate that files are selected
        if (files.length === 0) {
            showAlert('Please select at least one audio file for the collection. Make sure you have browsed to a folder and selected files.', 'error');
            console.log('ERROR: No files selected');
            return;
        }
        
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
            collectionId: document.getElementById('schedule-collection').value,
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
    console.log('getSelectedFiles DEBUG:');
    console.log('- Found checkboxes:', checkboxes.length);
    
    const files = Array.from(checkboxes).map(cb => {
        console.log('- Checkbox:', cb.id, 'data-filename:', cb.dataset.filename, 'value:', cb.value);
        return cb.dataset.filename || cb.value;
    });
    
    console.log('- Returning files:', files);
    return files;
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

// Function to navigate to audio folder root
async function goToAudioRoot() {
    await browseToPath('./audio');
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
        const response = await apiCall('/admin/schedules');
        const schedules = response.schedules || [];
        // Convert array to object format (same as loadSchedules)
        const schedulesObj = {};
        schedules.forEach(schedule => {
            schedulesObj[schedule.scheduleId] = schedule;
        });
        const schedule = schedulesObj[scheduleId];
        
        if (!schedule) {
            showAlert('Schedule not found!', 'error');
            return;
        }
        
        // Populate form with existing data
        document.getElementById('schedule-name').value = schedule.name;
        document.getElementById('schedule-collection').value = schedule.collectionId;
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
        const response = await apiCall('/admin/collections');
        const collections = response.collections || [];
        // Convert array to object format (same as loadCollections)
        const collectionsObj = {};
        collections.forEach(collection => {
            collectionsObj[collection.collectionId] = collection;
        });
        const collection = collectionsObj[collectionId];
        
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
        
        // Load audio files for editing
        await loadAudioFiles();
        
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
    document.getElementById('file-browser').innerHTML = '<p>Click "Choose Recordings from Audio Folder" to see available audio files</p>';
    
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
        const response = await apiCall('/admin/users');
        const students = response.students || [];
        // Convert array to object format expected by displayUsers
        const usersObj = {};
        students.forEach(student => {
            usersObj[student.studentId] = student;
        });
        displayUsers(usersObj);
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
        // Use the schedule count provided by the backend
        const userSchedules = user.scheduleCount || 0;
        
        const coordinatorInfo = user.coordinatorName ? `
            <p><strong>👨‍🏫 Coordinator:</strong> ${user.coordinatorName} (${user.coordinatorEmail})</p>
            <p><strong>🏛️ Institute:</strong> ${user.instituteName}</p>
        ` : '<p><strong>👨‍🏫 Coordinator:</strong> <span style="color: #e53e3e;">Not assigned</span></p>';
        
        // A student is assigned to me if they have an adminId and coordinator info (since /admin/users only returns my students)
        const isAssignedToMe = user.adminId && user.coordinatorName;
        const borderColor = isAssignedToMe ? '#38a169' : '#f56565';
        const statusColor = isAssignedToMe ? '#38a169' : '#e53e3e';
        const statusText = isAssignedToMe ? 'Assigned to You' : 'Needs Assignment';
        
        return `
            <div class="schedule-item" style="border-left: 4px solid ${borderColor};">
                <h4>${user.name}</h4>
                <p><strong>📧 Email:</strong> ${user.email}</p>
                <p><strong>📅 Registered:</strong> ${new Date(user.createdAt).toLocaleDateString()}</p>
                ${coordinatorInfo}
                <p><strong>📍 Assignment Status:</strong> <span style="color: ${statusColor}; font-weight: 600;">${statusText}</span></p>
                <p><strong>📚 Assigned Schedules:</strong> ${userSchedules}</p>
                <p><strong>✓ Account Status:</strong> ${user.isActive ? 'Active' : 'Inactive'}</p>
                <button class="btn btn-danger" onclick="removeUserSchedules('${userId}')">Remove All Schedules</button>
            </div>
        `;
    }).join('');
}

async function loadUsersForAssignment() {
    try {
        const response = await apiCall('/admin/users');
        const students = response.students || [];
        const select = document.getElementById('user-select');
        
        select.innerHTML = '<option value="">Select a user</option>';
        students.forEach(user => {
            const userId = user.studentId;
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
        const response = await apiCall('/admin/schedules');
        const schedules = response.schedules || [];
        const select = document.getElementById('user-schedule-select');
        
        select.innerHTML = '<option value="">Select a schedule</option>';
        schedules.forEach(schedule => {
            const scheduleId = schedule.scheduleId;
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

// Student Assignment Functions
async function loadUnassignedStudents() {
    try {
        const response = await apiCall('/admin/unassigned-students');
        const students = response.students || [];
        // Convert array to object format expected by displayUnassignedStudents
        const studentsObj = {};
        students.forEach(student => {
            studentsObj[student.studentId] = student;
        });
        displayUnassignedStudents(studentsObj);
    } catch (error) {
        document.getElementById('unassigned-students-list').innerHTML = '<p>Error loading unassigned students</p>';
        console.error('Failed to load unassigned students:', error);
    }
}

async function loadAssignedStudents() {
    try {
        const response = await apiCall('/admin/users');
        const students = response.students || [];
        // Convert array to object format expected by displayAssignedStudents
        const studentsObj = {};
        students.forEach(student => {
            studentsObj[student.studentId] = student;
        });
        displayAssignedStudents(studentsObj);
    } catch (error) {
        document.getElementById('assigned-students-list').innerHTML = '<p>Error loading your assigned students</p>';
        console.error('Failed to load assigned students:', error);
    }
}

function displayUnassignedStudents(students) {
    const listDiv = document.getElementById('unassigned-students-list');
    
    if (!students || Object.keys(students).length === 0) {
        listDiv.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #718096;">
                <div style="font-size: 3em; margin-bottom: 10px;">✅</div>
                <h4>No Unassigned Students</h4>
                <p>All registered students have been assigned to coordinators.</p>
            </div>
        `;
        return;
    }
    
    listDiv.innerHTML = Object.entries(students).map(([studentId, student]) => `
        <div class="schedule-item" style="border-left: 4px solid #3182ce;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                    <h4 style="margin-bottom: 8px; color: #2d3748;">${student.name}</h4>
                    <p style="margin: 4px 0;"><strong>📧 Email:</strong> ${student.email}</p>
                    <p style="margin: 4px 0;"><strong>📅 Registered:</strong> ${new Date(student.createdAt).toLocaleDateString()}</p>
                    <p style="margin: 4px 0;"><strong>📍 Status:</strong> <span style="color: #e53e3e; font-weight: 600;">Unassigned</span></p>
                </div>
                <div style="text-align: right;">
                    <button class="btn btn-success" onclick="assignStudent('${studentId}')" 
                            style="margin-bottom: 8px; display: block; width: 140px;">
                        ✋ Assign to Me
                    </button>
                    <small style="color: #718096;">Click to become<br>their coordinator</small>
                </div>
            </div>
        </div>
    `).join('');
}

function displayAssignedStudents(students) {
    const listDiv = document.getElementById('assigned-students-list');
    
    if (!students || Object.keys(students).length === 0) {
        listDiv.innerHTML = `
            <div style="text-align: center; padding: 30px; color: #718096;">
                <div style="font-size: 3em; margin-bottom: 10px;">👥</div>
                <h4>No Students Assigned</h4>
                <p>You haven't been assigned any students yet. Check the "Available Students" section above to assign students to yourself.</p>
            </div>
        `;
        return;
    }
    
    listDiv.innerHTML = Object.entries(students).map(([studentId, student]) => {
        const coordinatorInfo = student.coordinatorName ? `
            <p style="margin: 4px 0;"><strong>👨‍🏫 Coordinator:</strong> ${student.coordinatorName} (${student.coordinatorEmail})</p>
            <p style="margin: 4px 0;"><strong>🏛️ Institute:</strong> ${student.instituteName}</p>
        ` : '<p style="margin: 4px 0;"><strong>👨‍🏫 Coordinator:</strong> Not assigned</p>';
        
        const scheduleCount = student.scheduleCount || 0;
        
        return `
            <div class="schedule-item" style="border-left: 4px solid #38a169;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <h4 style="margin-bottom: 8px; color: #2d3748;">${student.name}</h4>
                        <p style="margin: 4px 0;"><strong>📧 Email:</strong> ${student.email}</p>
                        <p style="margin: 4px 0;"><strong>📅 Registered:</strong> ${new Date(student.createdAt).toLocaleDateString()}</p>
                        <p style="margin: 4px 0;"><strong>📚 Assigned Schedules:</strong> <span style="color: ${scheduleCount > 0 ? '#38a169' : '#e53e3e'}; font-weight: 600;">${scheduleCount}</span></p>
                        ${coordinatorInfo}
                        <p style="margin: 4px 0;"><strong>📍 Status:</strong> <span style="color: #38a169; font-weight: 600;">Assigned to You</span></p>
                    </div>
                    <div style="text-align: right;">
                        <button class="btn btn-danger" onclick="unassignStudent('${studentId}')" 
                                style="margin-bottom: 8px; display: block; width: 140px;">
                            🚫 Unassign
                        </button>
                        <small style="color: #718096;">Remove from<br>your coordination</small>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function assignStudent(studentId) {
    if (!confirm('Are you sure you want to assign this student to yourself as their coordinator?')) {
        return;
    }
    
    try {
        const result = await apiCall('/admin/assign-student', 'POST', { studentId });
        showAlert(`Student assigned successfully! ${result.message}`, 'success');
        
        // Refresh both lists
        await loadUnassignedStudents();
        await loadAssignedStudents();
        
        // Always refresh the main users list to keep in sync
        await loadUsers();
    } catch (error) {
        console.error('Failed to assign student:', error);
        showAlert('Failed to assign student. Please try again.', 'error');
    }
}

async function unassignStudent(studentId) {
    if (!confirm('Are you sure you want to unassign this student? They will become available for other coordinators to assign.')) {
        return;
    }
    
    try {
        const result = await apiCall('/admin/unassign-student', 'POST', { studentId });
        showAlert(`Student unassigned successfully! ${result.message}`, 'success');
        
        // Refresh both lists
        await loadUnassignedStudents();
        await loadAssignedStudents();
        
        // Always refresh the main users list to keep in sync
        await loadUsers();
    } catch (error) {
        console.error('Failed to unassign student:', error);
        showAlert('Failed to unassign student. Please try again.', 'error');
    }
}

// Copy invitation code to clipboard
async function copyInvitationCode() {
    const codeElement = document.getElementById('invitation-code');
    const copyButton = document.getElementById('copy-invite-btn');
    const invitationCode = codeElement.textContent;
    
    if (!invitationCode || invitationCode === 'Loading...' || invitationCode === 'Not available') {
        showAlert('Invitation code not available to copy', 'error');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(invitationCode);
        
        // Show success feedback
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        copyButton.style.background = '#48bb78';
        copyButton.style.color = 'white';
        
        setTimeout(() => {
            copyButton.textContent = originalText;
            copyButton.style.background = '#e2e8f0';
            copyButton.style.color = '#4a5568';
        }, 2000);
        
        showAlert('Invitation code copied to clipboard!', 'success');
    } catch (error) {
        console.error('Failed to copy invitation code:', error);
        showAlert('Failed to copy invitation code. Please select and copy manually.', 'error');
    }
}