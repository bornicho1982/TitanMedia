const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const core = require('./build/Release/titan_media_core.node');
const twitch = require('./twitch-integration');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'src', 'renderer', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        core.shutdown();
        app.quit();
    }
});

// IPC Handlers
ipcMain.handle('core-startup', () => core.startup());
ipcMain.handle('core-shutdown', () => core.shutdown());
ipcMain.handle('core-get-scene-list', () => core.getSceneList());
ipcMain.handle('core-get-scene-sources', (event, sceneName) => core.getSceneSources(sceneName));
ipcMain.handle('core-create-scene', (event, sceneName) => core.createScene(sceneName));
ipcMain.handle('core-remove-scene', (event, sceneName) => core.removeScene(sceneName));
ipcMain.handle('core-set-current-scene', (event, sceneName) => core.setCurrentScene(sceneName));
ipcMain.handle('core-set-preview-scene', (event, sceneName) => core.setPreviewScene(sceneName));
ipcMain.handle('core-transition', () => core.transition());
ipcMain.handle('core-add-source', (event, sceneName, sourceId, sourceName) => core.addSource(sceneName, sourceId, sourceName));
ipcMain.handle('core-remove-source', (event, sourceName) => core.removeSource(sourceName));
ipcMain.handle('core-get-source-properties', (event, sourceName) => core.getSourceProperties(sourceName));
ipcMain.handle('core-update-source-properties', (event, sourceName, properties) => core.updateSourceProperties(sourceName, properties));
ipcMain.handle('core-start-streaming', () => core.startStreaming());
ipcMain.handle('core-stop-streaming', () => core.stopStreaming());
ipcMain.handle('core-is-streaming', () => core.isStreaming());
ipcMain.handle('core-get-audio-levels', () => core.getAudioLevels());
ipcMain.handle('core-is-source-muted', (event, sourceName) => core.isSourceMuted(sourceName));
ipcMain.handle('core-set-source-muted', (event, sourceName, muted) => core.setSourceMuted(sourceName, muted));
ipcMain.handle('dialog-select-logo', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }]
    });
    if (!canceled) {
        return filePaths[0];
    }
    return null;
});

ipcMain.handle('get-overlay-templates', () => {
    const fs = require('fs');
    const overlaysDir = path.join(__dirname, 'src', 'renderer', 'overlays');
    try {
        const templateDirs = fs.readdirSync(overlaysDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        return templateDirs.map(dir => ({
            name: dir.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            url: `file://${path.join(overlaysDir, dir, 'index.html')}`,
            thumbnail: `./overlays/${dir}/thumbnail.png`
        }));
    } catch (error) {
        console.error("Error reading overlay templates:", error);
        return [];
    }
});


// Twitch Integration IPC Handlers
ipcMain.handle('twitch-login', async () => {
    return twitch.login(mainWindow);
});
ipcMain.handle('twitch-logout', async () => {
    await twitch.logout();
});
ipcMain.handle('twitch-get-user', async () => {
    return twitch.getCurrentUser();
});
ipcMain.handle('twitch-get-channel-info', async () => {
    return twitch.getChannelInfo();
});
ipcMain.handle('twitch-update-channel-info', async (event, title, category) => {
    return twitch.updateChannelInfo(title, category);
});

// Chat IPC Handlers
ipcMain.on('chat-connect', () => {
    twitch.connectChat();
});
ipcMain.on('chat-disconnect', () => {
    twitch.disconnectChat();
});
ipcMain.on('chat-send-message', (event, channel, message) => {
    twitch.sendMessage(channel, message);
});

twitch.onChatMessage((username, message, color) => {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('chat-message', { username, message, color });
    }
});
