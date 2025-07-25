/**
 * Session Manager for Dynamic Port Allocation
 * Handles session lifecycle, heartbeat, and cleanup
 */

class SessionManager {
    constructor() {
        this.sessionId = null;
        this.tunnelUrl = null;
        this.port = null;
        this.heartbeatInterval = null;
        this.heartbeatFrequency = 30000; // 30 seconds
        this.isInitialized = false;
        this.mainServerUrl = 'https://misty-sunset-29095.pktriot.net'; // Main server URL
        
        // Bind methods to preserve context
        this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handlePageHide = this.handlePageHide.bind(this);
        this.sendHeartbeat = this.sendHeartbeat.bind(this);
        
        this.setupEventListeners();
    }
    
    /**
     * Initialize session by allocating a port
     */
    async initializeSession() {
        try {
            console.log('🚀 Initializing session...');
            
            const response = await fetch(`${this.mainServerUrl}/api/allocate-port`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.sessionId = data.sessionId;
                this.tunnelUrl = data.tunnelUrl;
                this.port = data.port;
                this.isInitialized = true;
                
                console.log(`✅ Session initialized: ${this.sessionId}`);
                console.log(`🌐 Tunnel URL: ${this.tunnelUrl}`);
                console.log(`📡 Port: ${this.port}`);
                
                // Start heartbeat
                this.startHeartbeat();
                
                return {
                    sessionId: this.sessionId,
                    tunnelUrl: this.tunnelUrl,
                    port: this.port
                };
            } else {
                throw new Error(data.error || 'Failed to initialize session');
            }
            
        } catch (error) {
            console.error('❌ Session initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * Start sending heartbeat to keep session alive
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, this.heartbeatFrequency);
        
        console.log(`💓 Heartbeat started (every ${this.heartbeatFrequency/1000}s)`);
    }
    
    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            console.log('💔 Heartbeat stopped');
        }
    }
    
    /**
     * Send heartbeat to server
     */
    async sendHeartbeat() {
        if (!this.isInitialized || !this.sessionId) {
            return;
        }
        
        try {
            const response = await fetch(`${this.mainServerUrl}/api/session-heartbeat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.sessionId
                })
            });
            
            if (response.ok) {
                console.log('💓 Heartbeat sent successfully');
            } else {
                console.warn('⚠️ Heartbeat failed:', response.status);
            }
            
        } catch (error) {
            console.error('❌ Heartbeat error:', error);
        }
    }
    
    /**
     * Mark session for cleanup (immediate)
     */
    async markForCleanup() {
        if (!this.isInitialized || !this.sessionId) {
            return;
        }
        
        try {
            const response = await fetch(`${this.mainServerUrl}/api/mark-for-cleanup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.sessionId
                })
            });
            
            if (response.ok) {
                console.log('🔴 Session marked for cleanup');
            } else {
                console.warn('⚠️ Mark for cleanup failed:', response.status);
            }
            
        } catch (error) {
            console.error('❌ Mark for cleanup error:', error);
        }
    }
    
    /**
     * Release session (explicit cleanup)
     */
    async releaseSession() {
        if (!this.isInitialized || !this.sessionId) {
            return;
        }
        
        try {
            this.stopHeartbeat();
            
            const response = await fetch(`${this.mainServerUrl}/api/release-port`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.sessionId
                })
            });
            
            if (response.ok) {
                console.log('✅ Session released successfully');
            } else {
                console.warn('⚠️ Session release failed:', response.status);
            }
            
            this.cleanup();
            
        } catch (error) {
            console.error('❌ Session release error:', error);
        }
    }
    
    /**
     * Clean up local session data
     */
    cleanup() {
        this.stopHeartbeat();
        this.sessionId = null;
        this.tunnelUrl = null;
        this.port = null;
        this.isInitialized = false;
        console.log('🧹 Session cleaned up locally');
    }
    
    /**
     * Setup event listeners for tab closure detection
     */
    setupEventListeners() {
        // Handle page unload (tab close, navigation, refresh)
        window.addEventListener('beforeunload', this.handleBeforeUnload);
        
        // Handle visibility changes (tab switching)
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        
        // Handle page hide (more reliable than beforeunload)
        window.addEventListener('pagehide', this.handlePageHide);
        
        // Handle browser back/forward button
        window.addEventListener('popstate', this.handleBeforeUnload);
    }
    
    /**
     * Handle before unload event
     */
    handleBeforeUnload(event) {
        console.log('📴 Page unloading - marking session for cleanup');
        
        // Use sendBeacon for reliable delivery during unload
        if (this.sessionId && navigator.sendBeacon) {
            const data = JSON.stringify({
                sessionId: this.sessionId
            });
            
            navigator.sendBeacon(
                `${this.mainServerUrl}/api/mark-for-cleanup`,
                data
            );
        } else {
            // Fallback for browsers without sendBeacon
            this.markForCleanup();
        }
    }
    
    /**
     * Handle visibility change event
     */
    handleVisibilityChange() {
        if (document.hidden) {
            console.log('📴 Tab hidden - reducing heartbeat frequency');
            // Reduce heartbeat frequency when tab is hidden
            this.heartbeatFrequency = 60000; // 1 minute
            this.startHeartbeat();
        } else {
            console.log('👁️ Tab visible - resuming normal heartbeat');
            // Resume normal heartbeat when tab is visible
            this.heartbeatFrequency = 30000; // 30 seconds
            this.startHeartbeat();
        }
    }
    
    /**
     * Handle page hide event
     */
    handlePageHide(event) {
        console.log('📴 Page hidden - marking session for cleanup');
        
        // Use sendBeacon for reliable delivery
        if (this.sessionId && navigator.sendBeacon) {
            const data = JSON.stringify({
                sessionId: this.sessionId
            });
            
            navigator.sendBeacon(
                `${this.mainServerUrl}/api/mark-for-cleanup`,
                data
            );
        }
    }
    
    /**
     * Get current session info
     */
    getSessionInfo() {
        return {
            sessionId: this.sessionId,
            tunnelUrl: this.tunnelUrl,
            port: this.port,
            isInitialized: this.isInitialized
        };
    }
    
    /**
     * Make API call using the allocated tunnel
     */
    async apiCall(endpoint, options = {}) {
        if (!this.isInitialized || !this.tunnelUrl) {
            throw new Error('Session not initialized');
        }
        
        const url = `${this.tunnelUrl}${endpoint}`;
        return fetch(url, options);
    }
}

// Export for use in other scripts
window.SessionManager = SessionManager;

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎬 DOM loaded - SessionManager ready');
    
    // Example usage:
    // const sessionManager = new SessionManager();
    // await sessionManager.initializeSession();
    // Now use sessionManager.tunnelUrl for all API calls
});