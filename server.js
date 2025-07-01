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
            // Default multi-admin configuration
            config = {
                systemSettings: {
                    timezone: "Asia/Kolkata",
                    superAdminPassword: "admin123",
                    jwtSecret: "your-secret-key-change-this",
                    emailEnabled: false,
                    smtpSettings: {
                        host: "smtp.gmail.com",
                        port: 587,
                        user: "",
                        password: ""
                    }
                },
                admins: {},
                students: {},
                collections: {},
                schedules: {},
                studentSchedules: {},
                studentProgress: {}
            };
            saveConfig();
        }
    } catch (error) {
        console.error('Error loading config:', error);
        config = { 
            systemSettings: {}, 
            admins: {}, 
            students: {}, 
            collections: {}, 
            schedules: {},
            studentSchedules: {},
            studentProgress: {}
        };
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
    const timezone = schedule.timeSlots[0]?.timezone || config.systemSettings.timezone || 'Asia/Kolkata';
    
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

// Multi-admin helper functions
function isValidInviteCode(code) {
    return /^[A-Z0-9]{6,12}$/.test(code);
}

function isInviteCodeAvailable(inviteCode) {
    return !Object.values(config.admins).find(
        admin => admin.inviteCode === inviteCode
    );
}

function findAdminByInviteCode(inviteCode) {
    return Object.values(config.admins).find(
        admin => admin.inviteCode === inviteCode && admin.isActive
    );
}

function findAdminByEmail(email) {
    return Object.values(config.admins).find(
        admin => admin.email === email.toLowerCase()
    );
}

function findStudentByEmail(email) {
    return Object.values(config.students).find(
        student => student.email === email.toLowerCase()
    );
}

function createAdmin(adminData) {
    const adminId = `admin-${Date.now()}`;
    const hashedPassword = bcrypt.hashSync(adminData.password, 10);
    
    const admin = {
        adminId,
        name: adminData.name,
        email: adminData.email.toLowerCase(),
        password: hashedPassword,
        instituteName: adminData.instituteName,
        inviteCode: adminData.inviteCode,
        isActive: true,
        createdAt: new Date().toISOString(),
        stats: {
            totalStudents: 0,
            activeStudents: 0,
            registrationsThisMonth: 0
        }
    };
    
    config.admins[adminId] = admin;
    saveConfig();
    return admin;
}

function createStudent(studentData, adminId) {
    const studentId = `student-${Date.now()}`;
    const hashedPassword = bcrypt.hashSync(studentData.password, 10);
    
    const student = {
        studentId,
        adminId,
        name: studentData.name,
        email: studentData.email.toLowerCase(),
        password: hashedPassword,
        joinedViaInvite: studentData.inviteCode,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLogin: null
    };
    
    config.students[studentId] = student;
    config.studentProgress[studentId] = {};
    
    // Update admin stats
    if (config.admins[adminId]) {
        // Ensure admin has stats object
        if (!config.admins[adminId].stats) {
            config.admins[adminId].stats = {
                totalStudents: 0,
                activeStudents: 0,
                registrationsThisMonth: 0
            };
        }
        config.admins[adminId].stats.totalStudents++;
        config.admins[adminId].stats.activeStudents++;
        config.admins[adminId].stats.registrationsThisMonth++;
    }
    
    saveConfig();
    return student;
}

function generateStudentToken(student) {
    return jwt.sign(
        { 
            studentId: student.studentId, 
            adminId: student.adminId,
            email: student.email, 
            name: student.name,
            role: 'student'
        },
        config.systemSettings.jwtSecret,
        { expiresIn: '7d' }
    );
}

function generateAdminToken(admin) {
    return jwt.sign(
        { 
            adminId: admin.adminId,
            email: admin.email, 
            name: admin.name,
            role: 'admin'
        },
        config.systemSettings.jwtSecret,
        { expiresIn: '24h' }
    );
}

function getAdminCollections(adminId) {
    return Object.values(config.collections).filter(
        collection => collection.adminId === adminId
    );
}

function getAdminSchedules(adminId) {
    return Object.values(config.schedules).filter(
        schedule => schedule.adminId === adminId
    );
}

function getAdminStudents(adminId) {
    return Object.values(config.students).filter(
        student => student.adminId === adminId && student.isActive
    );
}

// Student helper functions
function getStudentSchedules(studentId) {
    const student = config.students[studentId];
    if (!student) return [];
    
    const studentScheduleIds = config.studentSchedules[studentId] || [];
    const currentTime = new Date();
    
    return studentScheduleIds.map(scheduleId => {
        const schedule = config.schedules[scheduleId];
        if (!schedule || schedule.adminId !== student.adminId) return null;
        
        return {
            id: scheduleId,
            name: schedule.name,
            collection: schedule.collectionId,
            enabled: schedule.enabled,
            dayOfWeek: schedule.timeSlots[0]?.dayOfWeek || '*',
            startTime: schedule.timeSlots[0]?.startTime || '',
            endTime: schedule.timeSlots[0]?.endTime || '',
            isActive: schedule.enabled && isTimeInSchedule(schedule)
        };
    }).filter(s => s !== null);
}

function getStudentAvailableFiles(studentId) {
    const student = config.students[studentId];
    if (!student) return [];
    
    const studentSchedules = getStudentSchedules(studentId);
    const activeStudentSchedules = studentSchedules.filter(s => s.isActive);
    const activeFiles = [];
    
    activeStudentSchedules.forEach(schedule => {
        const collection = config.collections[schedule.collection];
        if (collection && collection.files && collection.adminId === student.adminId) {
            // Get student's progress for this collection
            const studentProgress = getStudentProgress(studentId, schedule.collection);
            const startIndex = Math.max(0, studentProgress.currentPosition - 1); // Convert to 0-based index
            
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

function getStudentProgress(studentId, collectionId) {
    config.studentProgress = config.studentProgress || {};
    config.studentProgress[studentId] = config.studentProgress[studentId] || {};
    
    // Default progress: start at position 1
    if (!config.studentProgress[studentId][collectionId]) {
        config.studentProgress[studentId][collectionId] = {
            currentPosition: 1,
            lastAccessed: new Date().toISOString()
        };
    }
    
    return config.studentProgress[studentId][collectionId];
}

function updateStudentProgress(studentId, collectionId, newPosition) {
    config.studentProgress = config.studentProgress || {};
    config.studentProgress[studentId] = config.studentProgress[studentId] || {};
    
    config.studentProgress[studentId][collectionId] = {
        currentPosition: newPosition,
        lastAccessed: new Date().toISOString()
    };
    
    saveConfig();
}

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, config.systemSettings.jwtSecret, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = decoded;
        next();
    });
}

// Student authentication middleware
function authenticateStudent(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Student authentication required' });
    }

    jwt.verify(token, config.systemSettings.jwtSecret, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired student token' });
        }
        
        if (decoded.role !== 'student') {
            return res.status(403).json({ error: 'Student access required' });
        }
        
        req.student = decoded;
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

    jwt.verify(token, config.systemSettings.jwtSecret, (err, decoded) => {
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

// Super-Admin authentication middleware
function authenticateSuperAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Super-admin authentication required' });
    }

    jwt.verify(token, config.systemSettings.jwtSecret, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired super-admin token' });
        }
        
        // Check if it's a super-admin token
        if (decoded.role !== 'super-admin') {
            return res.status(403).json({ error: 'Super-admin access required' });
        }
        
        req.superAdmin = decoded;
        next();
    });
}

// Admin or Super-Admin authentication middleware
function authenticateAdminOrSuperAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Admin authentication required' });
    }

    jwt.verify(token, config.systemSettings.jwtSecret, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        
        // Check if it's an admin or super-admin token
        if (decoded.role !== 'admin' && decoded.role !== 'super-admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        if (decoded.role === 'super-admin') {
            req.superAdmin = decoded;
        } else {
            req.admin = decoded;
        }
        req.userRole = decoded.role;
        next();
    });
}

// Generate JWT token
function generateToken(user) {
    return jwt.sign(
        { userId: user.id, email: user.email, name: user.name },
        config.systemSettings.jwtSecret,
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
    
    config.students[userId] = user;
    config.studentSchedules[userId] = [];
    config.studentProgress = config.studentProgress || {};
    config.studentProgress[userId] = {};
    saveConfig();
    
    return user;
}

function findUserByEmail(email) {
    if (!config.students) {
        return null;
    }
    return Object.values(config.students).find(student => student.email === email.toLowerCase());
}

function getUserProgress(userId, collectionId) {
    config.studentProgress = config.studentProgress || {};
    config.studentProgress[userId] = config.studentProgress[userId] || {};
    
    // Default progress: start at position 1
    if (!config.studentProgress[userId][collectionId]) {
        config.studentProgress[userId][collectionId] = {
            currentPosition: 1,
            lastAccessed: new Date().toISOString()
        };
    }
    
    return config.studentProgress[userId][collectionId];
}

function updateUserProgress(userId, collectionId, newPosition) {
    config.studentProgress = config.studentProgress || {};
    config.studentProgress[userId] = config.studentProgress[userId] || {};
    
    config.studentProgress[userId][collectionId] = {
        currentPosition: newPosition,
        lastAccessed: new Date().toISOString()
    };
    
    saveConfig();
}

function getUserSchedules(userId) {
    const userSchedules = config.studentSchedules[userId] || [];
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

// Admin registration and authentication routes
app.post('/admin/register', async (req, res) => {
    try {
        const { name, email, password, instituteName, inviteCode } = req.body;
        
        // Validate input
        if (!name || !email || !password || !instituteName || !inviteCode) {
            return res.status(400).json({ 
                error: 'Name, email, password, institution name, and invite code are required' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }
        
        if (!isValidInviteCode(inviteCode)) {
            return res.status(400).json({ 
                error: 'Invalid invite code format. Use 6-12 uppercase letters and numbers only.' 
            });
        }
        
        // Check if email already exists
        if (findAdminByEmail(email)) {
            return res.status(400).json({ error: 'Admin with this email already exists' });
        }
        
        // Check if invite code is available
        if (!isInviteCodeAvailable(inviteCode)) {
            return res.status(400).json({ error: 'Invite code already taken. Please choose another.' });
        }
        
        // Create admin
        const admin = createAdmin({ name, email, password, instituteName, inviteCode });
        
        // Generate token
        const token = generateAdminToken(admin);
        
        console.log(`✅ New admin registered: ${email} (${instituteName}) - Invite code: ${inviteCode}`);
        
        res.json({
            success: true,
            message: 'Admin registered successfully!',
            token,
            admin: {
                adminId: admin.adminId,
                name: admin.name,
                email: admin.email,
                instituteName: admin.instituteName,
                inviteCode: admin.inviteCode
            }
        });
    } catch (error) {
        console.error('Admin registration error:', error);
        res.status(500).json({ error: 'Admin registration failed' });
    }
});

app.post('/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find admin
        const admin = findAdminByEmail(email);
        if (!admin) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Check if admin is active
        if (!admin.isActive) {
            return res.status(401).json({ error: 'Admin account is deactivated' });
        }
        
        // Check password
        const isValidPassword = bcrypt.compareSync(password, admin.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Generate token
        const token = generateAdminToken(admin);
        
        console.log(`✅ Admin logged in: ${email} (${admin.instituteName})`);
        
        res.json({
            success: true,
            message: 'Admin login successful',
            token,
            admin: {
                adminId: admin.adminId,
                name: admin.name,
                email: admin.email,
                instituteName: admin.instituteName,
                inviteCode: admin.inviteCode
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Admin login failed' });
    }
});

// Student registration and authentication routes  
app.post('/student/register', async (req, res) => {
    try {
        const { name, email, password, inviteCode } = req.body;
        
        // Validate input
        if (!name || !email || !password || !inviteCode) {
            return res.status(400).json({ 
                error: 'Name, email, password, and invite code are all required' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }
        
        // Find admin by invite code
        const admin = findAdminByInviteCode(inviteCode);
        if (!admin) {
            return res.status(400).json({ 
                error: 'Invalid invite code. Please check with your teacher and try again.' 
            });
        }
        
        // Check if email already exists
        if (findStudentByEmail(email)) {
            return res.status(400).json({ error: 'Student with this email already exists' });
        }
        
        // Create student and link to admin
        const student = createStudent({ name, email, password, inviteCode }, admin.adminId);
        
        // Generate student token
        const token = generateStudentToken(student);
        
        console.log(`✅ New student registered: ${email} → ${admin.instituteName} (${inviteCode})`);
        
        res.json({
            success: true,
            message: `Welcome to ${admin.instituteName}!`,
            token,
            student: {
                studentId: student.studentId,
                name: student.name,
                email: student.email,
                instituteName: admin.instituteName
            }
        });
    } catch (error) {
        console.error('Student registration error:', error);
        res.status(500).json({ error: 'Student registration failed' });
    }
});

app.post('/student/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find student
        const student = findStudentByEmail(email);
        if (!student) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Check if student is active
        if (!student.isActive) {
            return res.status(401).json({ error: 'Student account is deactivated' });
        }
        
        // Check password
        const isValidPassword = bcrypt.compareSync(password, student.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        
        // Update last login
        config.students[student.studentId].lastLogin = new Date().toISOString();
        saveConfig();
        
        // Get admin info
        const admin = config.admins[student.adminId];
        
        // Generate token
        const token = generateStudentToken(student);
        
        console.log(`✅ Student logged in: ${email} (${admin?.instituteName || 'Unknown Institution'})`);
        
        res.json({
            success: true,
            message: 'Student login successful',
            token,
            student: {
                studentId: student.studentId,
                name: student.name,
                email: student.email,
                instituteName: admin?.instituteName || 'Unknown Institution'
            }
        });
    } catch (error) {
        console.error('Student login error:', error);
        res.status(500).json({ error: 'Student login failed' });
    }
});

// Legacy authentication routes (for backward compatibility)
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
    const user = config.students[req.user.userId];
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

// Super-Admin authentication route
app.post('/super-admin/authenticate', (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }
    
    if (password !== config.systemSettings.superAdminPassword) {
        console.log(`❌ Failed super-admin login attempt`);
        return res.status(401).json({ error: 'Invalid super-admin password' });
    }
    
    // Generate JWT token for super-admin
    const superAdminToken = jwt.sign(
        { 
            role: 'super-admin', 
            authenticated: true,
            permissions: ['view-all', 'manage-all', 'system-settings']
        },
        config.systemSettings.jwtSecret,
        { expiresIn: '24h' }
    );
    
    console.log(`✅ Super-admin authenticated successfully`);
    res.json({ 
        success: true, 
        message: 'Super-admin authentication successful',
        token: superAdminToken,
        role: 'super-admin'
    });
});

// Admin logout route
app.post('/admin/logout', (req, res) => {
    // With JWT, logout is handled client-side by removing the token
    // Server doesn't need to track anything
    console.log(`✅ Admin logged out`);
    res.json({ success: true, message: 'Logged out successfully' });
});

// Super-Admin specific endpoints
app.get('/super-admin/dashboard', authenticateSuperAdmin, (req, res) => {
    const totalAdmins = Object.keys(config.admins).length;
    const totalStudents = Object.keys(config.students).length;
    const totalCollections = Object.keys(config.collections).length;
    const totalSchedules = Object.keys(config.schedules).length;
    
    // Get active admins
    const activeAdmins = Object.values(config.admins).filter(admin => admin.isActive);
    
    // Get active schedules across all admins
    const activeSchedules = Object.values(config.schedules)
        .filter(schedule => schedule.enabled && isTimeInSchedule(schedule))
        .length;
    
    // Recent registrations (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentAdmins = Object.values(config.admins)
        .filter(admin => new Date(admin.createdAt) > thirtyDaysAgo).length;
    
    const recentStudents = Object.values(config.students)
        .filter(student => new Date(student.createdAt) > thirtyDaysAgo).length;
    
    res.json({
        systemStats: {
            totalAdmins,
            activeAdmins: activeAdmins.length,
            totalStudents,
            totalCollections,
            totalSchedules,
            activeSchedules,
            recentAdmins,
            recentStudents
        },
        serverTime: new Date().toISOString(),
        timezone: config.systemSettings.timezone
    });
});

app.get('/super-admin/admins', authenticateSuperAdmin, (req, res) => {
    const adminsWithStats = Object.values(config.admins).map(admin => ({
        ...admin,
        password: undefined, // Don't send password hashes
        studentCount: Object.values(config.students)
            .filter(student => student.adminId === admin.adminId).length,
        collectionCount: Object.values(config.collections)
            .filter(collection => collection.adminId === admin.adminId).length,
        scheduleCount: Object.values(config.schedules)
            .filter(schedule => schedule.adminId === admin.adminId).length
    }));
    
    res.json(adminsWithStats);
});

app.get('/super-admin/students', authenticateSuperAdmin, (req, res) => {
    const studentsWithAdminInfo = Object.values(config.students).map(student => {
        const admin = config.admins[student.adminId];
        return {
            ...student,
            password: undefined, // Don't send password hashes
            adminName: admin?.name || 'Unknown',
            instituteName: admin?.instituteName || 'Unknown'
        };
    });
    
    res.json(studentsWithAdminInfo);
});

app.get('/super-admin/collections', authenticateSuperAdmin, (req, res) => {
    const collectionsWithAdminInfo = Object.values(config.collections).map(collection => {
        const admin = config.admins[collection.adminId];
        return {
            ...collection,
            adminName: admin?.name || 'Unknown',
            instituteName: admin?.instituteName || 'Unknown'
        };
    });
    
    res.json(collectionsWithAdminInfo);
});

app.get('/super-admin/schedules', authenticateSuperAdmin, (req, res) => {
    const schedulesWithAdminInfo = Object.values(config.schedules).map(schedule => {
        const admin = config.admins[schedule.adminId];
        const collection = config.collections[schedule.collectionId];
        return {
            ...schedule,
            adminName: admin?.name || 'Unknown',
            instituteName: admin?.instituteName || 'Unknown',
            collectionName: collection?.name || 'Unknown',
            isActive: schedule.enabled && isTimeInSchedule(schedule)
        };
    });
    
    res.json(schedulesWithAdminInfo);
});

app.post('/super-admin/admin/:adminId/toggle', authenticateSuperAdmin, (req, res) => {
    const { adminId } = req.params;
    
    if (!config.admins[adminId]) {
        return res.status(404).json({ error: 'Admin not found' });
    }
    
    config.admins[adminId].isActive = !config.admins[adminId].isActive;
    saveConfig();
    
    console.log(`✅ Super-admin ${config.admins[adminId].isActive ? 'activated' : 'deactivated'} admin: ${adminId}`);
    
    res.json({ 
        success: true, 
        isActive: config.admins[adminId].isActive,
        message: `Admin ${config.admins[adminId].isActive ? 'activated' : 'deactivated'} successfully`
    });
});

app.delete('/super-admin/admin/:adminId', authenticateSuperAdmin, (req, res) => {
    const { adminId } = req.params;
    
    if (!config.admins[adminId]) {
        return res.status(404).json({ error: 'Admin not found' });
    }
    
    // Get admin info before deletion
    const admin = config.admins[adminId];
    
    // Delete admin's students
    const adminStudents = Object.keys(config.students).filter(
        studentId => config.students[studentId].adminId === adminId
    );
    adminStudents.forEach(studentId => {
        delete config.students[studentId];
        delete config.studentProgress[studentId];
        delete config.studentSchedules[studentId];
    });
    
    // Delete admin's collections
    const adminCollections = Object.keys(config.collections).filter(
        collectionId => config.collections[collectionId].adminId === adminId
    );
    adminCollections.forEach(collectionId => {
        delete config.collections[collectionId];
    });
    
    // Delete admin's schedules
    const adminSchedules = Object.keys(config.schedules).filter(
        scheduleId => config.schedules[scheduleId].adminId === adminId
    );
    adminSchedules.forEach(scheduleId => {
        delete config.schedules[scheduleId];
    });
    
    // Delete admin
    delete config.admins[adminId];
    
    saveConfig();
    
    console.log(`✅ Super-admin deleted admin: ${admin.name} (${adminId}) and all associated data`);
    
    res.json({ 
        success: true, 
        message: `Admin ${admin.name} and all associated data deleted successfully`,
        deletedCounts: {
            students: adminStudents.length,
            collections: adminCollections.length,
            schedules: adminSchedules.length
        }
    });
});

app.post('/super-admin/system-settings', authenticateSuperAdmin, (req, res) => {
    const oldSettings = { ...config.systemSettings };
    config.systemSettings = { ...config.systemSettings, ...req.body };
    
    // If timezone changed, update all existing schedules
    if (req.body.timezone && req.body.timezone !== oldSettings.timezone) {
        console.log(`\n🕒 Super-admin changed timezone from ${oldSettings.timezone} to ${req.body.timezone}`);
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
    
    console.log(`✅ Super-admin updated system settings`);
    res.json({ success: true, systemSettings: config.systemSettings });
});

// Student-specific routes
app.get('/student/schedules', authenticateStudent, (req, res) => {
    const schedules = getStudentSchedules(req.student.studentId);
    res.json(schedules);
});

app.get('/student/available-files', authenticateStudent, (req, res) => {
    const files = getStudentAvailableFiles(req.student.studentId);
    const studentSchedules = getStudentSchedules(req.student.studentId);
    const activeStudentSchedules = studentSchedules.filter(s => s.isActive);
    
    // Calculate progress information for each collection
    const collectionsProgress = {};
    activeStudentSchedules.forEach(schedule => {
        const collection = config.collections[schedule.collection];
        if (collection && collection.files) {
            // Get student's progress for this collection
            const studentProgress = getStudentProgress(req.student.studentId, schedule.collection);
            const totalFiles = collection.files.length;
            const startIndex = Math.max(0, studentProgress.currentPosition - 1);
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
                currentPosition: studentProgress.currentPosition,
                hasLimit: collection.fileLimit > 0
            };
        }
    });
    
    // Get admin info
    const admin = config.admins[req.student.adminId];
    
    res.json({ 
        audioFiles: files, 
        collectionsProgress,
        instituteName: admin?.instituteName || 'Unknown Institution'
    });
});

app.get('/student/stats', authenticateStudent, (req, res) => {
    const studentSchedules = getStudentSchedules(req.student.studentId);
    const availableFiles = getStudentAvailableFiles(req.student.studentId);
    const activeSchedules = studentSchedules.filter(s => s.isActive);
    
    // Get admin info
    const admin = config.admins[req.student.adminId];
    
    res.json({
        totalSchedules: studentSchedules.length,
        activeSchedules: activeSchedules.length,
        availableFiles: availableFiles.length,
        instituteName: admin?.instituteName || 'Unknown Institution'
    });
});

// Student progress API endpoints
app.get('/student/progress/:collectionId', authenticateStudent, (req, res) => {
    const { collectionId } = req.params;
    
    // Verify collection belongs to student's admin
    const collection = config.collections[collectionId];
    if (!collection || collection.adminId !== req.student.adminId) {
        return res.status(403).json({ error: 'Collection not accessible' });
    }
    
    const progress = getStudentProgress(req.student.studentId, collectionId);
    res.json(progress);
});

app.post('/student/progress/:collectionId', authenticateStudent, (req, res) => {
    const { collectionId } = req.params;
    const { newPosition } = req.body;
    
    if (!newPosition || newPosition < 1) {
        return res.status(400).json({ error: 'Invalid position' });
    }
    
    // Verify collection belongs to student's admin
    const collection = config.collections[collectionId];
    if (!collection || collection.adminId !== req.student.adminId) {
        return res.status(403).json({ error: 'Collection not accessible' });
    }
    
    updateStudentProgress(req.student.studentId, collectionId, newPosition);
    res.json({ 
        success: true, 
        message: 'Progress updated',
        newPosition 
    });
});

// Admin UI served both locally and by GitHub Pages
app.use('/admin', express.static(ADMIN_UI_DIR));

// Admin API endpoints (all protected and filtered by adminId)
app.get('/admin/dashboard', authenticateAdmin, (req, res) => {
    const { adminId } = req.admin;
    
    const adminData = config.admins[adminId];
    const collections = getAdminCollections(adminId);
    const schedules = getAdminSchedules(adminId);
    const students = getAdminStudents(adminId);
    
    res.json({
        admin: {
            adminId: adminData.adminId,
            name: adminData.name,
            email: adminData.email,
            instituteName: adminData.instituteName,
            inviteCode: adminData.inviteCode,
            stats: adminData.stats
        },
        collections,
        schedules,
        students: students.map(s => ({
            studentId: s.studentId,
            name: s.name,
            email: s.email,
            joinedViaInvite: s.joinedViaInvite,
            createdAt: s.createdAt,
            lastLogin: s.lastLogin,
            isActive: s.isActive
        }))
    });
});

app.get('/admin/status', authenticateAdmin, (req, res) => {
    const { adminId } = req.admin;
    
    const adminSchedules = getAdminSchedules(adminId);
    const activeSchedules = adminSchedules
        .filter(schedule => schedule.enabled && isTimeInSchedule(schedule))
        .map(schedule => ({ 
            id: schedule.scheduleId, 
            name: schedule.name 
        }));
    
    const adminData = config.admins[adminId];
    
    // Check if admin exists
    if (!adminData) {
        return res.status(404).json({ error: 'Admin not found' });
    }
    
    // Ensure admin has stats object
    if (!adminData.stats) {
        adminData.stats = {
            totalStudents: 0,
            activeStudents: 0,
            registrationsThisMonth: 0
        };
        saveConfig(); // Save the updated config
    }
    
    res.json({
        serverTime: new Date().toISOString(),
        timezone: config.systemSettings.timezone,
        activeSchedules,
        totalCollections: getAdminCollections(adminId).length,
        totalSchedules: adminSchedules.length,
        totalStudents: adminData.stats.totalStudents || 0,
        instituteName: adminData.instituteName
    });
});

app.get('/admin/collections', authenticateAdmin, (req, res) => {
    const collections = getAdminCollections(req.admin.adminId);
    res.json(collections);
});

app.post('/admin/collections', authenticateAdmin, (req, res) => {
    const { name, path, files, fileLimit } = req.body;
    const { adminId } = req.admin;
    const id = `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${adminId}`;
    
    config.collections[id] = {
        collectionId: id,
        adminId,
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
    const { adminId } = req.admin;
    
    const collection = config.collections[id];
    if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
    }
    
    // Verify collection belongs to this admin
    if (collection.adminId !== adminId) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    config.collections[id] = {
        ...collection,
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
    const { adminId } = req.admin;
    
    const collection = config.collections[id];
    if (!collection) {
        return res.status(404).json({ error: 'Collection not found' });
    }
    
    // Verify collection belongs to this admin
    if (collection.adminId !== adminId) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    delete config.collections[id];
    saveConfig();
    res.json({ success: true });
});

app.get('/admin/schedules', authenticateAdmin, (req, res) => {
    const schedules = getAdminSchedules(req.admin.adminId);
    res.json(schedules);
});

app.post('/admin/schedules', authenticateAdmin, (req, res) => {
    const schedule = req.body;
    const { adminId } = req.admin;
    const id = `${schedule.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${adminId}`;
    
    // Verify collection belongs to this admin
    const collection = config.collections[schedule.collectionId];
    if (!collection || collection.adminId !== adminId) {
        return res.status(400).json({ error: 'Invalid collection or access denied' });
    }
    
    // Ensure schedule uses the system timezone
    if (schedule.timeSlots) {
        schedule.timeSlots.forEach(slot => {
            slot.timezone = config.systemSettings.timezone || 'Asia/Kolkata';
        });
    }
    
    config.schedules[id] = {
        ...schedule,
        scheduleId: id,
        adminId
    };
    
    saveConfig();
    res.json({ success: true, id });
});

app.put('/admin/schedules/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const schedule = req.body;
    const { adminId } = req.admin;
    
    const existingSchedule = config.schedules[id];
    if (!existingSchedule) {
        return res.status(404).json({ error: 'Schedule not found' });
    }
    
    // Verify schedule belongs to this admin
    if (existingSchedule.adminId !== adminId) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    // Verify collection belongs to this admin
    const collection = config.collections[schedule.collectionId];
    if (!collection || collection.adminId !== adminId) {
        return res.status(400).json({ error: 'Invalid collection or access denied' });
    }
    
    // Ensure schedule uses the system timezone
    if (schedule.timeSlots) {
        schedule.timeSlots.forEach(slot => {
            slot.timezone = config.systemSettings.timezone || 'Asia/Kolkata';
        });
    }
    
    config.schedules[id] = {
        ...schedule,
        scheduleId: id,
        adminId
    };
    
    saveConfig();
    res.json({ success: true });
});

app.post('/admin/schedules/:id/toggle', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const { adminId } = req.admin;
    
    const schedule = config.schedules[id];
    if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
    }
    
    // Verify schedule belongs to this admin
    if (schedule.adminId !== adminId) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    config.schedules[id].enabled = !config.schedules[id].enabled;
    saveConfig();
    res.json({ success: true, enabled: config.schedules[id].enabled });
});

app.delete('/admin/schedules/:id', authenticateAdmin, (req, res) => {
    const { id } = req.params;
    const { adminId } = req.admin;
    
    const schedule = config.schedules[id];
    if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
    }
    
    // Verify schedule belongs to this admin
    if (schedule.adminId !== adminId) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
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
    const oldTimezone = config.systemSettings.timezone;
    config.systemSettings = { ...config.systemSettings, ...req.body };
    
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
    res.json(config.students || {});
});

app.get('/admin/user-progress/:userId', authenticateAdmin, (req, res) => {
    const { userId } = req.params;
    const userProgress = config.studentProgress?.[userId] || {};
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
    
    if (!config.students[userId]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (!config.schedules[scheduleId]) {
        return res.status(404).json({ error: 'Schedule not found' });
    }
    
    // Initialize user schedules if needed
    if (!config.studentSchedules[userId]) {
        config.studentSchedules[userId] = [];
    }
    
    // Add schedule if not already assigned
    if (!config.studentSchedules[userId].includes(scheduleId)) {
        config.studentSchedules[userId].push(scheduleId);
        saveConfig();
        console.log(`✅ Assigned schedule "${scheduleId}" to user "${config.students[userId].name}"`);
    }
    
    res.json({ success: true });
});

app.post('/admin/users/remove-schedules', authenticateAdmin, (req, res) => {
    const { userId } = req.body;
    
    if (!config.students[userId]) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove all schedules for this user
    config.studentSchedules[userId] = [];
    saveConfig();
    
    console.log(`✅ Removed all schedules from user "${config.students[userId].name}"`);
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
        timezone: config.systemSettings.timezone
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