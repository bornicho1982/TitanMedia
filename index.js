const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { initTwitch, doTwitchLogin, doTwitchLogout, getApiClient, getTwitchUserId } = require('./src/main/twitch-integration');
const tmi = require('tmi.js');


let chatClient = null;
let mainWindow = null;
let botSettings = { enabled: false, commands: [] };

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
  await initTwitch();
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

// --- Twitch & Chat IPC Handlers ---

ipcMain.handle('twitch-login', async () => {
    try {
        const userInfo = await doTwitchLogin();
        return {
            id: userInfo.id,
            displayName: userInfo.displayName,
            profilePictureUrl: userInfo.profilePictureUrl
        };
    } catch (error) {
        console.error('Login failed:', error);
        return null;
    }
});

ipcMain.handle('twitch-logout', async () => {
    await doTwitchLogout();
});

ipcMain.handle('get-twitch-status', async () => {
    const userId = getTwitchUserId();
    if (!userId) {
        return { loggedIn: false };
    }
    try {
        const apiClient = getApiClient();
        const user = await apiClient.users.getUserById(userId);
        return {
            loggedIn: true,
            id: user.id,
            displayName: user.displayName,
            profilePictureUrl: user.profilePictureUrl
        };
    } catch (error) {
        console.error("Error getting Twitch status:", error);
        return { loggedIn: false };
    }
});


ipcMain.handle('chat-connect', async () => {
    if (chatClient && chatClient.readyState() === 'OPEN') {
        console.log("Chat client is already connected.");
        return;
    }

    const userId = getTwitchUserId();
    if (!userId) {
        console.error("Cannot connect to chat: User not logged in.");
        return;
    }
    const apiClient = getApiClient();
    const user = await apiClient.users.getUserById(userId);

    const chatAuthProvider = apiClient.authProvider;

    chatClient = new tmi.Client({
        identity: {
            username: user.name,
            password: `oauth:${chatAuthProvider.getAccessTokenForUser(userId)}`
        },
        channels: [ user.name ],
         authProvider: chatAuthProvider,
    });

    await chatClient.connect();

    chatClient.on('message', (channel, tags, message, self) => {
        if (self) return;

        if (botSettings.enabled) {
            const command = botSettings.commands.find(c => c.command.toLowerCase() === message.toLowerCase());
            if (command) {
                chatClient.say(channel, command.response);
                return;
            }
        }

        mainWindow.webContents.send('chat-message', {
            username: tags['display-name'],
            message: message,
            color: tags['color'] || '#FFFFFF',
        });
    });
});

ipcMain.on('update-bot-settings', (event, settings) => {
    botSettings = settings;
});

ipcMain.handle('chat-disconnect', () => {
    if (chatClient) {
        chatClient.disconnect();
        chatClient = null;
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
    if (process.platform !== 'darwin') app.quit();
});
