const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const core = require('./build/Release/titan_media_core.node');
const database = require('./src/main/database');
const twitch = require('./src/main/twitch-integration');

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
}

app.whenReady().then(() => {
    database.initialize();
    createWindow();
    twitch.initialize(mainWindow);
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        const sceneData = core.getFullSceneData();
        database.saveFullSceneData(sceneData, (err) => {
            if (err) console.error("Failed to save scenes before quitting:", err);
            else console.log("Successfully saved all scenes.");

            core.shutdown();
            app.quit();
        });
    }
});

// --- Core IPC Handlers ---
ipcMain.handle('core-startup', () => core.startup());
ipcMain.handle('core-shutdown', () => core.shutdown());
ipcMain.handle('core-get-scene-list', () => core.getSceneList());
ipcMain.handle('core-get-scene-sources', (event, sceneName) => core.getSceneSources(sceneName));
ipcMain.handle('core-create-scene', (event, sceneName) => core.createScene(sceneName));
ipcMain.handle('core-remove-scene', (event, sceneName) => core.removeScene(sceneName));
ipcMain.handle('core-set-preview-scene', (event, sceneName) => core.setPreviewScene(sceneName));
ipcMain.handle('core-transition', () => core.transition());
ipcMain.handle('core-add-source', (event, sceneName, sourceId, sourceName) => core.addSource(sceneName, sourceId, sourceName));
ipcMain.handle('core-remove-source', (event, sceneName, sourceName) => core.removeSource(sceneName, sourceName));
ipcMain.handle('core-get-source-properties', (event, sourceName) => core.getSourceProperties(sourceName));
ipcMain.handle('core-update-source-properties', (event, sourceName, properties) => core.updateSourceProperties(sourceName, properties));
ipcMain.handle('core-start-streaming', (event, server, key) => core.startStreaming(server, key));
ipcMain.handle('core-stop-streaming', () => core.stopStreaming());
ipcMain.handle('core-is-streaming', () => core.isStreaming());
ipcMain.handle('core-start-recording', () => core.startRecording());
ipcMain.handle('core-stop-recording', () => core.stopRecording());
ipcMain.handle('core-is-recording', () => core.isRecording());
ipcMain.handle('core-get-audio-levels', () => core.getAudioLevels());
ipcMain.handle('core-is-source-muted', (event, sourceName) => core.isSourceMuted(sourceName));
ipcMain.handle('core-set-source-muted', (event, sourceName, muted) => core.setSourceMuted(sourceName, muted));
ipcMain.handle('core-get-program-scene', () => obs.obs_frontend_get_current_scene()); // Placeholder

// --- Database IPC Handlers ---
ipcMain.handle('db-load-scenes', async () => new Promise((r, j) => database.getSceneNames((e, rows) => e ? j(e) : r(rows.map(i => i.name)))));
ipcMain.handle('db-load-full-scene-data', async (event, sceneNames) => new Promise((r, j) => {
    database.loadFullSceneData(sceneNames, (err, data) => {
        if (err) return j(err);
        if (data) core.loadFullSceneData(data);
        r();
    });
}));

// --- Filesystem IPC Handlers ---
ipcMain.handle('select-logo', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] });
    if (canceled) return null;
    const userDataPath = app.getPath('userData');
    const brandingDir = path.join(userDataPath, 'branding');
    if (!fs.existsSync(brandingDir)) fs.mkdirSync(brandingDir);
    const newPath = path.join(brandingDir, path.basename(filePaths[0]));
    fs.copyFileSync(filePaths[0], newPath);
    return newPath;
});

// --- Twitch Integration IPC Handlers ---
ipcMain.handle('twitch-login', async () => twitch.login(mainWindow));
ipcMain.handle('twitch-logout', async () => twitch.logout());
ipcMain.handle('twitch-get-user', async () => twitch.getCurrentUser());
ipcMain.handle('twitch-get-channel-info', async () => twitch.getChannelInfo());
ipcMain.handle('twitch-update-channel-info', async (event, title, category) => twitch.updateChannelInfo(title, category));

// --- Chat IPC Handlers ---
ipcMain.on('chat-connect', () => twitch.connectChat());
ipcMain.on('chat-disconnect', () => twitch.disconnectChat());
ipcMain.on('chat-send-message', (event, channel, message) => twitch.sendMessage(channel, message));

twitch.onChatMessage((username, message, color) => {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('chat-message', { username, message, color });
    }
});
