const { BrowserWindow } = require('electron');
const { StaticAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');
const { ChatClient } = require('@twurple/chat');

const CLIENT_ID = 'gp762nuuo5f0n31uz9q24233e3z0v4'; // Public client ID for OBS
const REDIRECT_URI = 'http://localhost:3000/auth';

let authProvider = null;
let apiClient = null;
let chatClient = null;
let currentUser = null;
let onChatMessageCallback = null;
let authWindow = null;

function initialize(mainWindow) {
    // This function will be used for any future initialization if needed
}

function onChatMessage(callback) {
    onChatMessageCallback = callback;
}

async function login(mainWindow) {
    return new Promise((resolve, reject) => {
        authWindow = new BrowserWindow({
            width: 800,
            height: 600,
            parent: mainWindow,
            modal: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        });

        const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=token&scope=chat:read+chat:edit+channel:manage:broadcast`;
        authWindow.loadURL(authUrl);

        const { webContents } = authWindow;

        const onNavigate = async (event, url) => {
            if (url.startsWith(REDIRECT_URI)) {
                const urlParams = new URLSearchParams(new URL(url).hash.substring(1));
                const accessToken = urlParams.get('access_token');

                if (accessToken) {
                    authProvider = new StaticAuthProvider(CLIENT_ID, accessToken);
                    apiClient = new ApiClient({ authProvider });

                    const user = await apiClient.users.getMe();
                    currentUser = {
                        id: user.id,
                        username: user.displayName
                    };

                    authWindow.close();
                    resolve(currentUser);
                } else {
                    authWindow.close();
                    reject(new Error('Authentication failed: No access token received.'));
                }
            }
        };

        webContents.on('will-navigate', onNavigate);
        webContents.on('will-redirect', onNavigate);

        authWindow.on('closed', () => {
            // If the window is closed before authentication is complete
            if (!currentUser) {
                resolve(null);
            }
        });
    });
}

async function logout() {
    disconnectChat();
    authProvider = null;
    apiClient = null;
    currentUser = null;
}

function getCurrentUser() {
    return currentUser;
}

async function getChannelInfo() {
    if (!apiClient || !currentUser) throw new Error("Not logged in");
    const channel = await apiClient.channels.getChannelInfoById(currentUser.id);
    return {
        title: channel.title,
        category: channel.gameName
    };
}

async function updateChannelInfo(title, category) {
    if (!apiClient || !currentUser) throw new Error("Not logged in");
    await apiClient.channels.updateChannelInfo(currentUser.id, {
        title: title,
        gameId: (await apiClient.games.getGameByName(category))?.id
    });
}

function connectChat() {
    if (!authProvider || !currentUser) throw new Error("Not logged in");
    if (chatClient && chatClient.isConnected) return;

    chatClient = new ChatClient({ authProvider, channels: [currentUser.username] });
    chatClient.connect();

    chatClient.onMessage((channel, user, message, msg) => {
        if (onChatMessageCallback) {
            onChatMessageCallback(msg.userInfo.displayName, message, msg.userInfo.color);
        }
    });
}

function disconnectChat() {
    if (chatClient) {
        chatClient.quit();
        chatClient = null;
    }
}

function sendMessage(channel, message) {
    if (chatClient && chatClient.isConnected) {
        chatClient.say(channel, message);
    }
}

module.exports = {
    initialize,
    login,
    logout,
    getCurrentUser,
    getChannelInfo,
    updateChannelInfo,
    connectChat,
    disconnectChat,
    sendMessage,
    onChatMessage
};
