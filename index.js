const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const tmi = require('tmi.js');
const database = require('./src/main/database');

let chatClient = null;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'src/renderer/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('src/renderer/index.html');
}

app.whenReady().then(() => {
  database.initialize();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle('select-logo', async (event) => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Images', extensions: ['jpg', 'png', 'gif'] }
        ]
    });

    if (result.canceled) {
        return null;
    }

    const originalPath = result.filePaths[0];
    const userDataPath = app.getPath('userData');
    const brandingDir = path.join(userDataPath, 'branding');

    if (!fs.existsSync(brandingDir)) {
        fs.mkdirSync(brandingDir);
    }

    const newPath = path.join(brandingDir, path.basename(originalPath));
    fs.copyFileSync(originalPath, newPath);

    return newPath;
});

// --- Chat IPC Handlers ---
ipcMain.handle('chat-connect', (event, options) => {
    if (chatClient && chatClient.readyState() === 'OPEN') {
        console.log("Chat client is already connected.");
        return;
    }

    console.log("Connecting to Twitch chat with options:", options);
    chatClient = new tmi.Client(options);

    chatClient.on('message', (channel, tags, message, self) => {
        if(self) return; // Ignore messages from the bot itself
        mainWindow.webContents.send('chat-message', {
            username: tags['display-name'],
            message: message,
            color: tags['color'] || '#FFFFFF' // Use Twitch color or default to white
        });
    });

    chatClient.connect().catch(console.error);
});

ipcMain.handle('chat-disconnect', () => {
    if (chatClient) {
        chatClient.disconnect();
        chatClient = null;
        console.log("Disconnected from Twitch chat.");
    }
});

ipcMain.handle('chat-send-message', (event, channel, message) => {
    if (chatClient && chatClient.readyState() === 'OPEN') {
        chatClient.say(channel, message);
    } else {
        console.error("Cannot send message, chat client is not connected.");
    }
});


app.on('window-all-closed', function () {
    if (chatClient) {
        chatClient.disconnect();
    }
    const core = require('./build/Release/titan_media_core.node');
    const sceneData = core.getFullSceneData();
    database.saveFullSceneData(sceneData, (err) => {
        if (err) console.error("Failed to save scenes before quitting:", err);
        else console.log("Successfully saved all scenes.");

        core.shutdown();
        if (process.platform !== 'darwin') app.quit();
    });
});

// Database IPC Handlers
ipcMain.handle('db-load-scenes', async () => {
    return new Promise((resolve, reject) => {
        database.getSceneNames((err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(r => r.name));
        });
    });
});

ipcMain.handle('db-load-full-scene-data', async (event, sceneNames) => {
    const core = require('./build/Release/titan_media_core.node');
    return new Promise((resolve, reject) => {
        database.loadFullSceneData(sceneNames, (err, sceneData) => {
            if (err) return reject(err);
            if (sceneData) core.loadFullSceneData(sceneData);
            resolve();
        });
    });
});
