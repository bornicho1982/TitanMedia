const tmi = require('tmi.js');
const { ipcMain, BrowserWindow } = require('electron');
const axios = require('axios');

// --- Constantes de la API de Twitch ---
// IMPORTANTE: En una aplicación real, esto debería ser más seguro.
const TWITCH_CLIENT_ID = 'gp762nuuo6cf818is57s5od5o2q2q2'; // Public client-id for Twitch's example apps
const TWITCH_REDIRECT_URI = 'http://localhost:3000/callback';
const TWITCH_SCOPES = [
    'chat:read',
    'chat:edit',
    'channel:read:subscriptions',
    'channel:manage:broadcast' // Para gestionar título y categoría
].join(' ');

class TwitchIntegration {
    constructor() {
        this.chatClient = null;
        this.mainWindow = null;
        this.accessToken = null;
        this.userInfo = null;
    }

    initialize(mainWindow) {
        this.mainWindow = mainWindow;
        this.setupIpcHandlers();
    }

    setupIpcHandlers() {
        // Auth
        ipcMain.handle('twitch-login', () => this.startLoginFlow());
        ipcMain.handle('twitch-logout', () => this.logout());
        ipcMain.handle('get-twitch-user', () => this.getUserInfo());

        // Chat
        ipcMain.handle('chat-connect', (event, options) => this.connectChat(options));
        ipcMain.handle('chat-disconnect', () => this.disconnectChat());
        ipcMain.handle('chat-send-message', (event, channel, message) => this.sendChatMessage(channel, message));

        // Stream Management
        ipcMain.handle('get-channel-info', () => this.getChannelInfo());
        ipcMain.handle('update-channel-info', (event, title, category) => this.updateChannelInfo(title, category));
    }

    // --- Autenticación ---

    async startLoginFlow() {
        const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(TWITCH_SCOPES)}`;

        return new Promise((resolve, reject) => {
            const authWindow = new BrowserWindow({
                width: 800,
                height: 600,
                modal: true,
                parent: this.mainWindow,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });

            authWindow.loadURL(authUrl);

            const onWillRedirect = async (event, url) => {
                if (url.startsWith(TWITCH_REDIRECT_URI)) {
                    event.preventDefault(); // Stop the navigation

                    try {
                        const token = this.extractTokenFromUrl(url);
                        this.accessToken = token;

                        // Get user info from Twitch API
                        const twitchUser = await this.fetchUserInfo(token);
                        this.userInfo = {
                            username: twitchUser.display_name,
                            id: twitchUser.id
                        };

                        authWindow.close();
                        resolve(this.userInfo);

                    } catch (error) {
                        authWindow.close();
                        reject(error);
                    }
                }
            };

            authWindow.webContents.on('will-redirect', onWillRedirect);
            authWindow.on('closed', () => {
                // If the window is closed without a token, resolve with null
                if (!this.accessToken) {
                    resolve(null);
                }
            });
        });
    }

    extractTokenFromUrl(url) {
        const hash = new URL(url).hash.substring(1);
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        if (!token) {
            throw new Error('No se pudo extraer el token de acceso de la URL.');
        }
        return token;
    }

    async fetchUserInfo(token) {
        try {
            const response = await axios.get('https://api.twitch.tv/helix/users', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': TWITCH_CLIENT_ID
                }
            });
            return response.data.data[0];
        } catch (error) {
            console.error("Error fetching Twitch user info:", error);
            throw new Error('No se pudo obtener la información del usuario de Twitch.');
        }
    }

    logout() {
        this.accessToken = null;
        this.userInfo = null;
        this.disconnectChat();
        console.log("Logged out from Twitch.");
    }

    getUserInfo() {
        return this.userInfo;
    }

    // --- Chat ---

    connectChat() {
        if (!this.userInfo || !this.accessToken) {
            console.error("Cannot connect to chat: not logged in.");
            return;
        }

        if (this.chatClient && this.chatClient.readyState() === 'OPEN') {
            console.log("Chat client is already connected.");
            return;
        }

        const options = {
            identity: {
                username: this.userInfo.username,
                password: `oauth:${this.accessToken}`,
            },
            channels: [this.userInfo.username],
        };

        console.log(`Connecting to Twitch chat as ${this.userInfo.username}...`);
        this.chatClient = new tmi.Client(options);

        this.chatClient.on('message', (channel, tags, message, self) => {
            if (self) return;
            this.mainWindow.webContents.send('chat-message', {
                username: tags['display-name'],
                message: message,
                color: tags['color'] || '#FFFFFF'
            });
        });

        this.chatClient.connect().catch(console.error);
    }

    disconnectChat() {
        if (this.chatClient) {
            this.chatClient.disconnect();
            this.chatClient = null;
            console.log("Disconnected from Twitch chat.");
        }
    }

    sendChatMessage(channel, message) {
        if (this.chatClient && this.chatClient.readyState() === 'OPEN') {
            this.chatClient.say(channel, message);
        } else {
            console.error("Cannot send message, chat client is not connected.");
        }
    }

    cleanup() {
        this.disconnectChat();
    }

    // --- Stream Management ---

    async getChannelInfo() {
        if (!this.accessToken || !this.userInfo) {
            throw new Error("User not authenticated.");
        }

        try {
            const response = await axios.get(`https://api.twitch.tv/helix/channels?broadcaster_id=${this.userInfo.id}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Client-Id': TWITCH_CLIENT_ID
                }
            });
            const channelData = response.data.data[0];
            return {
                title: channelData.title,
                category: channelData.game_name
            };
        } catch (error) {
            console.error("Error fetching Twitch channel info:", error);
            throw new Error('Could not fetch channel information from Twitch.');
        }
    }

    async updateChannelInfo(title, category) {
         if (!this.accessToken || !this.userInfo) {
            throw new Error("User not authenticated.");
        }

        try {
            // First, get the category ID from the category name
            const gameResponse = await axios.get(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(category)}`, {
                 headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Client-Id': TWITCH_CLIENT_ID
                }
            });

            const gameId = gameResponse.data.data[0]?.id;
            if (!gameId) {
                throw new Error(`Category or game "${category}" not found on Twitch.`);
            }

            // Now, update the channel information
            await axios.patch(`https://api.twitch.tv/helix/channels?broadcaster_id=${this.userInfo.id}`, {
                title: title,
                game_id: gameId
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Client-Id': TWITCH_CLIENT_ID,
                    'Content-Type': 'application/json'
                }
            });

            return { success: true };

        } catch (error) {
            console.error("Error updating Twitch channel info:", error.response?.data || error.message);
            throw new Error('Could not update channel information on Twitch.');
        }
    }
}

module.exports = new TwitchIntegration();
