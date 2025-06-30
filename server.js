const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 8000;
const CONFIG_FILE = path.join(__dirname, 'config.json');
const ADMIN_UI_DIR = path.join(__dirname, 'docs/admin-ui');

// Middleware
app.use(express.json());
app.use(cors({
    origin: [
        'https://keshava9nus.github.io', 
        'http://localhost:3000', 
        'http://127.0.0.1:3000',
        'http://localhost:8080',
        'http://127.0.0.1:8080'
    ],
    methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Range', 'Content-Type', 'Accept-Ranges', 'Authorization'],
    exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
    credentials: true
}));

app.use(session({
    secret: 'audio-server-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Static files are served both locally and by GitHub Pages
app.use(express.static(path.join(__dirname, 'docs')));

// Configuration management
let config = {};

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
            config = JSON.parse(configData);
        } else {
            // Default configuration
            config = {
                settings: {
                    timezone: "Asia/Kolkata",
                    adminPassword: "admin123",
                    defaultCollectionPath: "./collections",
                    jwtSecret: "your-secret-key-change-this",
                    emailEnabled: false,
                    smtpSettings: {
                        host: "smtp.gmail.com",
                        port: 587,
                        user: "",
                        password: ""
                    }
                },
                users: {},
                userSchedules: {},
                activeSchedules: [],
                collections: {},
                schedules: {}
            };
            saveConfig();
        }
    } catch (error) {
        console.error('Error loading config:', error);
        config = { settings: {}, collections: {}, schedules: {}, activeSchedules: [] };
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error saving config:', error);
    }
}

// Time and scheduling utilities
function isTimeInSchedule(schedule) {
    const now = new Date();
    const timezone = schedule.timeSlots[0]?.timezone || config.settings.timezone || 'Asia/Kolkata';
    
    try {
        // Get current time in the specified timezone
        const timeFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const currentTime = timeFormatter.format(now);
        
        const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const currentDate = now.toISOString().split('T')[0];
        
        console.log(`[Schedule Check] ${schedule.name}:`);
        console.log(`  Current time: ${currentTime} (${timezone})`);
        console.log(`  Current day: ${currentDay} (0=Sun, 1=Mon...)`);
        console.log(`  Current date: ${currentDate}`);
        
        // Check date range
        if (schedule.dateRange && schedule.dateRange.startDate && currentDate < schedule.dateRange.startDate) {
            console.log(`  ❌ Before start date: ${schedule.dateRange.startDate}`);
            return false;
        }
        if (schedule.dateRange && schedule.dateRange.endDate && currentDate > schedule.dateRange.endDate) {
            console.log(`  ❌ After end date: ${schedule.dateRange.endDate}`);
            return false;
        }
        
        // Check time slots
        for (const slot of schedule.timeSlots) {
            console.log(`  Checking slot: ${slot.startTime}-${slot.endTime}, days: ${slot.dayOfWeek}`);
            
            // Check day of week
            if (slot.dayOfWeek !== '*') {
                const allowedDays = slot.dayOfWeek.split(',').map(d => parseInt(d));
                if (!allowedDays.includes(currentDay)) {
                    console.log(`  ❌ Day ${currentDay} not in allowed days: ${allowedDays}`);
                    continue;
                }
            }
            
            // Check time range - convert times to minutes for easier comparison
            const currentMinutes = timeToMinutes(currentTime);
            const startMinutes = timeToMinutes(slot.startTime);
            const endMinutes = timeToMinutes(slot.endTime);
            
            console.log(`  Time comparison: ${currentMinutes} (${currentTime}) between ${startMinutes} (${slot.startTime}) and ${endMinutes} (${slot.endTime})`);
            
            if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
                console.log(`  ✅ Schedule is ACTIVE!`);
                return true;
            }
        }
        
        console.log(`  ❌ Schedule is not active`);
        return false;
    } catch (error) {
        console.error('Error checking schedule:', error);
        return false;
    }
}

function timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, config.settings.jwtSecret, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// Admin JWT authentication middleware
function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }

    jwt.verify(token, config.settings.jwtSecret, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired admin token' });
        }
        
        // Check if it's an admin token
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        req.admin = decoded;
        next();
    });
}

// Generate JWT token
function generateToken(user) {
    return jwt.sign(
        { userId: user.id, email: user.email, name: user.name },
        config.settings.jwtSecret,
        { expiresIn: '24h' }
    );
}

// User management functions
function createUser(userData) {
    const userId = uuidv4();
    const hashedPassword = bcrypt.hashSync(userData.password, 10);
    
    const user = {
        id: userId,
        name: userData.name,
        email: userData.email.toLowerCase(),
        password: hashedPassword,
        verified: false,
        createdAt: new Date().toISOString(),
        schedules: []
    };
    
    config.users[userId] = user;
    config.userSchedules[userId] = [];
    config.userProgress = config.userProgress || {};
    config.userProgress[userId] = {};
    saveConfig();
    
    return user;
}

function findUserByEmail(email) {
    return Object.values(config.users).find(user => user.email === email.toLowerCase());
}

function getUserProgress(userId, collectionId) {
    config.userProgress = config.userProgress || {};
    config.userProgress[userId] = config.userProgress[userId] || {};
    
    // Default progress: start at position 1
    if (!config.userProgress[userId][collectionId]) {
        config.userProgress[userId][collectionId] = {
            currentPosition: 1,
            lastAccessed: new Date().toISOString()
        };
    }
    
    return config.userProgress[userId][collectionId];
}

function updateUserProgress(userId, collectionId, newPosition) {
    config.userProgress = config.userProgress || {};
    config.userProgress[userId] = config.userProgress[userId] || {};
    
    config.userProgress[userId][collectionId] = {
        currentPosition: newPosition,
        lastAccessed: new Date().toISOString()
    };
    
    saveConfig();
}

function getUserSchedules(userId) {
    const userSchedules = config.userSchedules[userId] || [];
    const currentTime = new Date();
    
    return userSchedules.map(scheduleId => {
        const schedule = config.schedules[scheduleId];
        if (!schedule) return null;
        
        return {
            id: scheduleId,
            name: schedule.name,
            collection: schedule.collection,
            enabled: schedule.enabled,
            dayOfWeek: schedule.timeSlots[0]?.dayOfWeek || '*',
            startTime: schedule.timeSlots[0]?.startTime || '',
            endTime: schedule.timeSlots[0]?.endTime || '',
            isActive: schedule.enabled && isTimeInSchedule(schedule)
        };
    }).filter(s => s !== null);
}

function getUserAvailableFiles(userId) {
    const userSchedules = getUserSchedules(userId);
    const activeUserSchedules = userSchedules.filter(s => s.isActive);
    const activeFiles = [];
    
    activeUserSchedules.forEach(schedule => {
        const collection = config.collections[schedule.collection];
        if (collection && collection.files) {
            // Get user's progress for this collection
            const userProgress = getUserProgress(userId, schedule.collection);
            const startIndex = Math.max(0, userProgress.currentPosition - 1); // Convert to 0-based index
            
            const filesToShow = collection.fileLimit && collection.fileLimit > 0 
                ? collection.files.slice(startIndex, startIndex + collection.fileLimit)
                : collection.files.slice(startIndex);
            
            filesToShow.forEach(file => {
                if (!activeFiles.some(f => f.name === file)) {
                    activeFiles.push({
                        name: file,
                        url: `/${encodeURIComponent(file)}`,
                        collection: schedule.collection,
                        schedule: schedule.id
                    });
                }
            });
        }
    });
    
    return activeFiles;
}

function getActiveFiles() {
    const activeFiles = [];
    
    console.log('\n=== Checking Active Files ===');
    console.log(`Total schedules: ${Object.keys(config.schedules).length}`);
    
    // Check all enabled schedules
    Object.entries(config.schedules).forEach(([scheduleId, schedule]) => {
        console.log(`\nSchedule: ${scheduleId} (${schedule.name})`);
        console.log(`  Enabled: ${schedule.enabled}`);
        
        if (!schedule.enabled) {
            console.log(`  ❌ Schedule is disabled`);
            return;
        }
        
        const isActive = isTimeInSchedule(schedule);
        console.log(`  Time check result: ${isActive}`);
        
        if (isActive) {
            const collection = config.collections[schedule.collection];
            console.log(`  Collection: ${schedule.collection}`);
            
            if (collection && collection.files) {
                console.log(`  Files in collection: ${collection.files.length}`);
                // For public access, show files from beginning up to limit
                const filesToShow = collection.fileLimit && collection.fileLimit > 0 
                    ? collection.files.slice(0, collection.fileLimit)
                    : collection.files;
                console.log(`  Files to show (limit: ${collection.fileLimit || 'none'}): ${filesToShow.length}`);
                
                filesToShow.forEach(file => {
                    if (!activeFiles.some(f => f.name === file)) {
                        console.log(`  ✅ Adding file: ${file}`);
                        activeFiles.push({
                            name: file,
                            url: `/${encodeURIComponent(file)}`,
                            collection: schedule.collection,
                            schedule: scheduleId
                        });
                    }
                });
            } else {
                console.log(`  ❌ Collection not found or no files: ${schedule.collection}`);
            }
        }
    });
    
    console.log(`\nTotal active files: ${activeFiles.length}`);
    console.log('===============================\n');
    
    return activeFiles;
}

// Authentication routes
app.post('/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }
        
        // Check if user already exists
        if (findUserByEmail(email)) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        
        // Create user
        const user = createUser({ name, email, password });
        
        // Generate token
        const token = generateToken(user);
        
        console.log(`✅ New user registered: ${email}`);
        
        res.json({
            message: 'User registered successfully',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                verified: user.verified
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const user = findUserByEmail(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Check password
        const isValidPassword = bcrypt.compareSync(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Generate token
        const token = generateToken(user);
        
        console.log(`✅ User logged in: ${email}`);
        
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                verified: user.verified
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/auth/me', authenticateToken, (req, res) => {
    const user = config.users[req.user.userId];
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            verified: user.verified
        }
    });
});

// Admin authentication route
app.post('/admin/authenticate', (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }
    
    if (password !== config.settings.adminPassword) {
        console.log(`❌ Failed admin login attempt`);
        return res.status(401).json({ error: 'Invalid admin password' });
    }
    
    // Generate JWT token for admin
    const adminToken = jwt.sign(
        { role: 'admin', authenticated: true },
        config.settings.jwtSecret,
        { expiresIn: '24h' }
    );
    
    console.log(`✅ Admin authenticated successfully`);
    res.json({ 
        success: true, 
        message: 'Admin authentication successful',
        token: adminToken
    });
});

// Admin logout route
app.post('/admin/logout', (req, res) => {
    // With JWT, logout is handled client-side by removing the token
    // Server doesn't need to track anything
    console.log(`✅ Admin logged out`);
    res.json({ success: true, message: 'Logged out successfully' });
});

// User-specific routes
app.get('/user/schedules', authenticateToken, (req, res) => {
    const schedules = getUserSchedules(req.user.userId);
    res.json(schedules);
});

app.get('/user/available-files', authenticateToken, (req, res) => {
    const files = getUserAvailableFiles(req.user.userId);
    const userSchedules = getUserSchedules(req.user.userId);
    const activeUserSchedules = userSchedules.filter(s => s.isActive);
    
    // Calculate progress information for each collection
    const collectionsProgress = {};
    activeUserSchedules.forEach(schedule => {
        const collection = config.collections[schedule.collection];
        if (collection && collection.files) {
            // Get user's progress for this collection
            const userProgress = getUserProgress(req.user.userId, schedule.collection);
            const totalFiles = collection.files.length;
            const startIndex = Math.max(0, userProgress.currentPosition - 1);
            const endIndex = collection.fileLimit && collection.fileLimit > 0 
                ? Math.min(startIndex + collection.fileLimit, totalFiles)
                : totalFiles;
            const visibleFiles = endIndex - startIndex;
            const remainingFiles = totalFiles - endIndex;
            const completedFiles = startIndex;
            
            collectionsProgress[schedule.collection] = {
                name: collection.name,
                totalFiles,
                visibleFiles,
                remainingFiles,
                completedFiles,
                currentPosition: userProgress.currentPosition,
                hasLimit: collection.fileLimit > 0
            };
        }
    });
    
    res.json({ 
        audioFiles: files, 
        collectionsProgress 
    });
});

app.get('/user/stats', authenticateToken, (req, res) => {
    const userSchedules = getUserSchedules(req.user.userId);
    const availableFiles = getUserAvailableFiles(req.user.userId);
    const activeSchedules = userSchedules.filter(s => s.isActive);
    
    res.json({
        totalSchedules: userSchedules.length,
        activeSchedules: activeSchedules.length,
        availableFiles: availableFiles.length
    });
});

// User progress API endpoints
app.get('/user/progress/:collectionId', authenticateToken, (req, res) => {
    const { collectionId } = req.params;
    const progress = getUserProgress(req.user.userId, collectionId);
    res.json(progress);
});

app.post('/user/progress/:collectionId', authenticateToken, (req, res) => {
    const { collectionId } = req.params;
    const { newPosition } = req.body;
    
    if (!newPosition || newPosition < 1) {
        return res.status(400).json({ error: 'Invalid position' });
    }
    
    updateUserProgress(req.user.userId, collectionId, newPosition);
    res.json({ 
        success: true, 
        message: 'Progress updated',
        newPosition 
    });
});

// Admin UI served both locally and by GitHub Pages
app.use('/admin', express.static(ADMIN_UI_DIR));

// Admin API endpoints (all protected)
app.get('/admin/config', authenticateAdmin, (req, res) => {
    res.json(config);
});

app.post('/admin/config', authenticateAdmin, (req, res) => {
    config = { ...config, ...req.body };
    saveConfig();
    res.json({ success: true });
});

app.get('/admin/status', authenticateAdmin, (req, res) => {
    const activeSchedules = Object.entries(config.schedules)
        .filter(([id, schedule]) => schedule.enabled && isTimeInSchedule(schedule))
        .map(([id, schedule]) => ({ id, name: schedule.name }));
    
    res.json({
        serverTime: new Date().toISOString(),
        timezone: config.settings.timezone,
        activeSchedules,
        totalCollections: Object.keys(config.collections).length,
        totalSchedules: Object.keys(config.schedules).length
    });
});

app.get('/admin/collections', authenticateAdmin, (req, res) => {
    res.json(config.collections);
});

app.post('/admin/collections', authenticateAdmin, (req, res) => {
    const { name, path, files, fileLimit } = req.body;
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    config.collections[id] = {
        name,
        path,
        files: files || [],
        fileLimit: fileLimit || null
    };
    
    saveConfig();
    res.json({ success: true, id });
});

app.put('/admin/collections/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const { name, path, files, fileLimit } = req.body;
    
    if (!config.collections[id]) {
        return res.status(404).json({ error: 'Collection not found' });
    }
    
    config.collections[id] = {
        name,
        path,
        files: files || [],
        fileLimit: fileLimit || null
    };
    
    saveConfig();
    res.json({ success: true });
});

app.delete('/admin/collections/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    delete config.collections[id];
    saveConfig();
    res.json({ success: true });
});

app.get('/admin/schedules', authenticateAdmin, (req, res) => {
    res.json(config.schedules);
});

app.post('/admin/schedules', authenticateAdmin, (req, res) => {
    const schedule = req.body;
    const id = schedule.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    // Ensure schedule uses the system timezone
    if (schedule.timeSlots) {
        schedule.timeSlots.forEach(slot => {
            slot.timezone = config.settings.timezone || 'Asia/Kolkata';
        });
    }
    
    config.schedules[id] = schedule;
    saveConfig();
    res.json({ success: true, id });
});

app.put('/admin/schedules/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const schedule = req.body;
    
    if (!config.schedules[id]) {
        return res.status(404).json({ error: 'Schedule not found' });
    }
    
    // Ensure schedule uses the system timezone
    if (schedule.timeSlots) {
        schedule.timeSlots.forEach(slot => {
            slot.timezone = config.settings.timezone || 'Asia/Kolkata';
        });
    }
    
    config.schedules[id] = schedule;
    saveConfig();
    res.json({ success: true });
});

app.post('/admin/schedules/:id/toggle', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    if (config.schedules[id]) {
        config.schedules[id].enabled = !config.schedules[id].enabled;
        saveConfig();
        res.json({ success: true, enabled: config.schedules[id].enabled });
    } else {
        res.status(404).json({ error: 'Schedule not found' });
    }
});

app.delete('/admin/schedules/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    delete config.schedules[id];
    saveConfig();
    res.json({ success: true });
});

app.get('/admin/browse', authenticateAdmin, (req, res) => {
    let browsePath = req.query.path || './collections';
    
    // Handle absolute vs relative paths
    let fullPath;
    if (path.isAbsolute(browsePath)) {
        fullPath = browsePath;
    } else {
        fullPath = path.resolve(__dirname, browsePath);
    }
    
    try {
        // Security check: ensure path exists and is readable
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'Directory not found' });
        }
        
        const stats = fs.statSync(fullPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Path is not a directory' });
        }
        
        const items = fs.readdirSync(fullPath).map(item => {
            const itemPath = path.join(fullPath, item);
            const stats = fs.statSync(itemPath);
            
            return {
                name: item,
                // For files, just use the filename (not full path)
                // For directories, use the absolute path
                path: stats.isDirectory() ? itemPath : item,
                fullPath: itemPath, // Always store absolute path
                relativePath: path.relative(__dirname, itemPath), // Keep relative for backwards compatibility
                type: stats.isDirectory() ? 'directory' : 'file',
                size: stats.size,
                isAudio: stats.isFile() && (
                    item.toLowerCase().endsWith('.mp3') || 
                    item.toLowerCase().endsWith('.wav') || 
                    item.toLowerCase().endsWith('.m4a') || 
                    item.toLowerCase().endsWith('.aac')
                )
            };
        });
        
        console.log(`\n📁 Browsing: ${fullPath}`);
        items.forEach(item => {
            console.log(`  ${item.type === 'directory' ? '📁' : '📄'} ${item.name} -> ${item.path}`);
        });
        
        // Add parent directory navigation (except for root directory)
        const parentDir = path.dirname(fullPath);
        if (parentDir !== fullPath) {
            items.unshift({
                name: '..',
                path: parentDir,
                fullPath: parentDir,
                type: 'directory',
                size: 0,
                isAudio: false
            });
        }
        
        res.json({
            currentPath: fullPath,
            items: items.filter(item => item.type === 'directory' || item.isAudio)
        });
    } catch (error) {
        console.error('Browse error:', error);
        res.status(500).json({ error: 'Unable to browse directory: ' + error.message });
    }
});

app.post('/admin/settings', authenticateAdmin, (req, res) => {
    const oldTimezone = config.settings.timezone;
    config.settings = { ...config.settings, ...req.body };
    
    // If timezone changed, update all existing schedules
    if (req.body.timezone && req.body.timezone !== oldTimezone) {
        console.log(`\n🕒 Timezone changed from ${oldTimezone} to ${req.body.timezone}`);
        console.log('Updating all existing schedules...');
        
        Object.entries(config.schedules).forEach(([scheduleId, schedule]) => {
            if (schedule.timeSlots) {
                schedule.timeSlots.forEach(slot => {
                    console.log(`  Updated ${scheduleId}: ${slot.timezone} -> ${req.body.timezone}`);
                    slot.timezone = req.body.timezone;
                });
            }
        });
        
        console.log('All schedules updated to use new timezone\n');
    }
    
    saveConfig();
    res.json({ success: true });
});

// Admin user management endpoints
app.get('/admin/users', authenticateAdmin, (req, res) => {
    res.json(config.users || {});
});

app.get('/admin/user-progress/:userId', authenticateAdmin, (req, res) => {
    const { userId } = req.params;
    const userProgress = config.userProgress?.[userId] || {};
    res.json(userProgress);
});

app.post('/admin/user-progress/:userId/:collectionId', authenticateAdmin, (req, res) => {
    const { userId, collectionId } = req.params;
    const { newPosition } = req.body;
    
    if (!newPosition || newPosition < 1) {
        return res.status(400).json({ error: 'Invalid position' });
    }
    
    updateUserProgress(userId, collectionId, newPosition);
    res.json({ 
        success: true, 
        message: 'User progress updated',
        newPosition 
    });
});

app.post('/admin/users/assign-schedule', authenticateAdmin, (req, res) => {
    const { userId, scheduleId } = req.body;
    
    if (!config.users[userId]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (!config.schedules[scheduleId]) {
        return res.status(404).json({ error: 'Schedule not found' });
    }
    
    // Initialize user schedules if needed
    if (!config.userSchedules[userId]) {
        config.userSchedules[userId] = [];
    }
    
    // Add schedule if not already assigned
    if (!config.userSchedules[userId].includes(scheduleId)) {
        config.userSchedules[userId].push(scheduleId);
        saveConfig();
        console.log(`✅ Assigned schedule "${scheduleId}" to user "${config.users[userId].name}"`);
    }
    
    res.json({ success: true });
});

app.post('/admin/users/remove-schedules', authenticateAdmin, (req, res) => {
    const { userId } = req.body;
    
    if (!config.users[userId]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove all schedules for this user
    config.userSchedules[userId] = [];
    saveConfig();
    
    console.log(`✅ Removed all schedules from user "${config.users[userId].name}"`);
    res.json({ success: true });
});

app.post('/admin/reset', authenticateAdmin, (req, res) => {
    config = {
        settings: {
            timezone: "Asia/Kolkata",
            adminPassword: "admin123",
            defaultCollectionPath: "./collections"
        },
        activeSchedules: [],
        collections: {},
        schedules: {}
    };
    saveConfig();
    res.json({ success: true });
});

// Track active streams
const activeStreams = new Map();

// Audio file serving with schedule checking (supports multiple formats)
app.get(/.*\.(mp3|wav|m4a|aac)$/i, (req, res) => {
    const filename = decodeURIComponent(req.path.substring(1));
    const streamId = `${filename}_${Date.now()}`;
    
    console.log(`\n🎵 Audio request for: ${filename}`);
    console.log(`🆔 Stream ID: ${streamId}`);
    
    // Check if there are other active streams for the same file
    const existingStreams = Array.from(activeStreams.keys()).filter(id => id.startsWith(filename));
    if (existingStreams.length > 0) {
        console.log(`⚠️  Warning: ${existingStreams.length} other active streams for this file: ${existingStreams.join(', ')}`);
    }
    
    // Add this stream to active tracking  
    activeStreams.set(streamId, { filename, startTime: Date.now(), clientIP: req.ip });
    console.log(`📊 Total active streams: ${activeStreams.size}`);
    
    const activeFiles = getActiveFiles();
    console.log(`Active files: ${activeFiles.map(f => f.name).join(', ')}`);
    
    // Check if file is currently available
    const isFileActive = activeFiles.some(file => file.name === filename);
    console.log(`Is file active: ${isFileActive}`);
    
    if (!isFileActive) {
        console.log(`❌ File not available: ${filename}`);
        return res.status(403).json({ 
            error: 'File not available at this time',
            message: 'This audio file is only available during scheduled times.'
        });
    }
    
    // Find the file in collections
    let filePath = null;
    console.log(`Searching for file in collections...`);
    
    Object.entries(config.collections).forEach(([collectionId, collection]) => {
        console.log(`  Checking collection: ${collectionId} (${collection.name})`);
        console.log(`    Path: ${collection.path}`);
        console.log(`    Files: ${collection.files?.join(', ') || 'none'}`);
        
        if (collection.files && collection.files.includes(filename)) {
            // Handle both absolute and relative paths
            let potentialPath;
            if (path.isAbsolute(collection.path)) {
                potentialPath = path.join(collection.path, filename);
            } else {
                potentialPath = path.join(__dirname, collection.path, filename);
            }
            
            console.log(`    Potential path: ${potentialPath}`);
            console.log(`    File exists: ${fs.existsSync(potentialPath)}`);
            
            if (fs.existsSync(potentialPath)) {
                filePath = potentialPath;
                console.log(`    ✅ Found file at: ${filePath}`);
            }
        }
    });
    
    if (!filePath || !fs.existsSync(filePath)) {
        console.log(`❌ File not found in any collection: ${filename}`);
        return res.status(404).send('File not found');
    }
    
    console.log(`🎵 Serving file: ${filePath}`);
    
    // Log client connection details and timing
    const startTime = Date.now();
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    console.log(`📱 Client: ${clientIP} | User-Agent: ${userAgent?.slice(0, 50)}...`);
    console.log(`⏰ Stream started at: ${new Date().toISOString()}`);
    console.log(`🔗 Request URL: ${req.url}`);
    console.log(`📋 Request headers:`, JSON.stringify(req.headers, null, 2));
    
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'audio/mpeg'; // default
    
    switch (ext) {
        case '.mp3':
            contentType = 'audio/mpeg';
            break;
        case '.wav':
            contentType = 'audio/wav';
            break;
        case '.m4a':
            contentType = 'audio/mp4';
            break;
        case '.aac':
            contentType = 'audio/aac';
            break;
    }
    
    // Set content type and headers for better streaming
    res.set({
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=300, max=1000', // Extended keep-alive
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Range',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline'
    });
    
    // Set longer timeout for audio streaming
    res.setTimeout(0); // Disable timeout
    req.setTimeout(0); // Disable timeout
    
    if (range) {
        // Handle range requests for audio streaming
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        
        const file = fs.createReadStream(filePath, { start, end });
        
        res.status(206);
        res.set({
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': chunksize
        });
        
        // Handle stream errors
        file.on('error', (err) => {
            console.error(`Stream error for ${filename}:`, err);
            if (!res.headersSent) {
                res.status(500).send('Stream error');
            }
        });
        
        // Handle connection close
        res.on('close', () => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`🔌 Client disconnected while streaming ${filename} (Range: ${start}-${end}/${fileSize}) after ${duration}s`);
            activeStreams.delete(streamId);
            console.log(`📉 Active streams now: ${activeStreams.size}`);
            file.destroy();
        });
        
        // Handle request abort
        req.on('aborted', () => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`❌ Request aborted for ${filename} (Range: ${start}-${end}/${fileSize}) after ${duration}s`);
            activeStreams.delete(streamId);
            console.log(`📉 Active streams now: ${activeStreams.size}`);
            file.destroy();
        });
        
        // Handle connection errors
        req.on('error', (err) => {
            console.log(`🚫 Request error for ${filename}:`, err.message);
            file.destroy();
        });
        
        res.on('error', (err) => {
            console.log(`🚫 Response error for ${filename}:`, err.message);
            file.destroy();
        });
        
        file.pipe(res);
    } else {
        // Send entire file
        res.set('Content-Length', fileSize);
        const file = fs.createReadStream(filePath);
        
        // Handle stream errors
        file.on('error', (err) => {
            console.error(`Stream error for ${filename}:`, err);
            if (!res.headersSent) {
                res.status(500).send('Stream error');
            }
        });
        
        // Handle connection close
        res.on('close', () => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`🔌 Client disconnected while streaming ${filename} (Full file: ${fileSize} bytes) after ${duration}s`);
            activeStreams.delete(streamId);
            console.log(`📉 Active streams now: ${activeStreams.size}`);
            file.destroy();
        });
        
        // Handle request abort
        req.on('aborted', () => {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`❌ Request aborted for ${filename} (Full file: ${fileSize} bytes) after ${duration}s`);
            activeStreams.delete(streamId);
            console.log(`📉 Active streams now: ${activeStreams.size}`);
            file.destroy();
        });
        
        // Handle connection errors
        req.on('error', (err) => {
            console.log(`🚫 Request error for ${filename}:`, err.message);
            file.destroy();
        });
        
        res.on('error', (err) => {
            console.log(`🚫 Response error for ${filename}:`, err.message);
            file.destroy();
        });
        
        file.pipe(res);
    }
});

// Public API endpoints
app.get('/api/files', (req, res) => {
    const activeFiles = getActiveFiles();
    
    // Calculate progress information for all active collections
    const collectionsProgress = {};
    Object.entries(config.schedules).forEach(([scheduleId, schedule]) => {
        if (schedule.enabled && isTimeInSchedule(schedule)) {
            const collection = config.collections[schedule.collection];
            if (collection && collection.files && !collectionsProgress[schedule.collection]) {
                const totalFiles = collection.files.length;
                const visibleFiles = collection.fileLimit && collection.fileLimit > 0 
                    ? Math.min(collection.fileLimit, totalFiles)
                    : totalFiles;
                const remainingFiles = totalFiles - visibleFiles;
                
                collectionsProgress[schedule.collection] = {
                    name: collection.name,
                    totalFiles,
                    visibleFiles,
                    remainingFiles,
                    completedFiles: 0,
                    currentPosition: 1,
                    hasLimit: collection.fileLimit > 0
                };
            }
        }
    });
    
    res.json({ 
        audioFiles: activeFiles,
        collectionsProgress 
    });
});

// Connection test endpoint
app.get('/api/connection-test', (req, res) => {
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    console.log(`🔍 Connection test from ${clientIP} | ${userAgent?.slice(0, 50)}...`);
    
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        clientIP: clientIP,
        userAgent: userAgent,
        headers: req.headers,
        message: 'Connection test successful'
    });
});

app.get('/api/status', (req, res) => {
    const activeFiles = getActiveFiles();
    const activeSchedules = Object.entries(config.schedules)
        .filter(([id, schedule]) => schedule.enabled && isTimeInSchedule(schedule))
        .map(([id, schedule]) => ({ id, name: schedule.name }));
    
    res.json({
        filesAvailable: activeFiles.length,
        activeSchedules: activeSchedules.length,
        serverTime: new Date().toISOString(),
        timezone: config.settings.timezone
    });
});

// Audio files page is now served by GitHub Pages as dashboard.html
// This route is no longer needed since the dashboard handles audio file display
// app.get('/audio-files', (req, res) => { ... });

// Initialize and start server
loadConfig();

// Update active schedules every minute
setInterval(() => {
    const activeSchedules = Object.entries(config.schedules)
        .filter(([id, schedule]) => schedule.enabled && isTimeInSchedule(schedule))
        .map(([id]) => id);
    
    config.activeSchedules = activeSchedules;
}, 60000);

const server = app.listen(PORT, () => {
    console.log(`🎵 Scheduled Audio Server running at http://localhost:${PORT}`);
    console.log(`📱 Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`🌐 Public URL: https://sleepy-thunder-45656.pktriot.net`);
    console.log(`⚙️  Configuration file: ${CONFIG_FILE}`);
    console.log("✅ CORS and scheduling enabled");
    console.log("Press Ctrl+C to stop the server");
});

// Set server timeout to 0 (unlimited) for long audio streams
server.timeout = 0;
server.keepAliveTimeout = 65000; // 65 seconds
server.headersTimeout = 66000; // 66 seconds