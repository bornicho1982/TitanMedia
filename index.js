const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const twitchIntegration = require('./src/main/twitch-integration');
const db = require('./src/main/database');

const addonPath = path.join(__dirname, 'build/Release/titan_media_core');
const core = require(addonPath);

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

app.whenReady().then(async () => {
  await db.connect();
  await db.initialize();

  createWindow();
  twitchIntegration.initialize(mainWindow);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle('db-load-scenes', async () => {
    return await db.loadSceneCollection();
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

app.on('window-all-closed', async function () {
    try {
        const sceneData = core.getFullSceneData();
        await db.saveSceneCollection(sceneData);
    } catch (error) {
        console.error("Failed to save scene configuration:", error);
    }

    twitchIntegration.cleanup();
    await db.close();
    if (process.platform !== 'darwin') app.quit();
});
