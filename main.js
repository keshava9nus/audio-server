const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs'); // Import the file system module

// Keep a global reference of the window object and child processes, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;
let nodeServer;
let pktriotTunnel;

function createWindow() {
    const isWindows = os.platform() === 'win32';

    // --- Start Node Server ---
    const nodeExecutable = isWindows ? 'node.exe' : 'node';
    // Handle both development and production paths
    let resourcesPath;
    if (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, nodeExecutable))) {
        // Production mode - binaries are in the app bundle
        resourcesPath = process.resourcesPath;
    } else {
        // Development mode - binaries are in local resources/bin
        resourcesPath = path.join(__dirname, 'resources', 'bin');
    }
    const nodePath = path.join(resourcesPath, nodeExecutable);
    const serverPath = path.join(__dirname, 'server.js');

    // Set execute permissions for non-Windows platforms
    if (!isWindows) {
        try {
            fs.chmodSync(nodePath, '755');
        } catch (err) {
            console.error('Failed to set permissions for node:', err);
        }
    }

    nodeServer = spawn(nodePath, [serverPath]);

    nodeServer.stdout.on('data', (data) => {
        console.log(`Node Server: ${data}`);
    });

    nodeServer.stderr.on('data', (data) => {
        console.error(`Node Server Error: ${data}`);
    });

    console.log('Node.js server started using:', nodePath);


    // --- Start pktriot Tunnel ---
    const pktriotExecutable = isWindows ? 'pktriot.exe' : 'pktriot';
    // Use the same resourcesPath logic as node
    const pktriotPath = path.join(resourcesPath, pktriotExecutable);

    // Set execute permissions for non-Windows platforms
    if (!isWindows) {
        try {
            fs.chmodSync(pktriotPath, '755');
        } catch (err) {
            console.error('Failed to set permissions for pktriot:', err);
        }
    }

    pktriotTunnel = spawn(pktriotPath, ['http', '8000']);

    pktriotTunnel.stdout.on('data', (data) => {
        console.log(`Pktriot Tunnel: ${data}`);
    });

    pktriotTunnel.stderr.on('data', (data) => {
        console.error(`Pktriot Tunnel Error: ${data}`);
    });

    console.log('Pktriot tunnel started using:', pktriotPath);


    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
    });

    // and load the landing page of the app.
    // We add a small delay to give the server time to start
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:8000/index.html');
    }, 3000); // 3-second delay


    // Emitted when the window is closed.
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// On macOS it's common to re-create a window in the app when the
// dock icon is clicked and there are no other windows open.
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// Make sure to kill the child processes when the app quits.
app.on('will-quit', () => {
    if (nodeServer) {
        nodeServer.kill();
        console.log('Node.js server stopped.');
    }
    if (pktriotTunnel) {
        pktriotTunnel.kill();
        console.log('Pktriot tunnel stopped.');
    }
});
