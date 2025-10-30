const { ipcMain, BrowserWindow } = require('electron');
const { ApiClient } = require('@twurple/api');
const { StaticAuthProvider } = require('@twurple/auth');
const tmi = require('tmi.js');

const TWITCH_CLIENT_ID = 'gp762nuuo6cf818is57s5od5o2q2q2'; // Public client-id for Twitch's example apps
const TWITCH_REDIRECT_URI = 'http://localhost:3000/callback';
const TWITCH_SCOPES = [
    'chat:read',
    'chat:edit',
    'channel:manage:broadcast',
].join(' ');

class TwitchIntegration {
    constructor() {
        this.mainWindow = null;
        this.authProvider = null;
        this.apiClient = null;
        this.chatClient = null;
        this.userInfo = null;
    }

    initialize(mainWindow) {
        this.mainWindow = mainWindow;
        this.setupIpcHandlers();
    }

    setupIpcHandlers() {
        ipcMain.handle('twitch-login', () => this.startLoginFlow());
        ipcMain.handle('twitch-logout', () => this.logout());
        ipcMain.handle('get-twitch-user', () => this.getUserInfo());
        ipcMain.handle('get-channel-info', () => this.getChannelInfo());
        ipcMain.handle('update-channel-info', (event, title, category) => this.updateChannelInfo(title, category));
        ipcMain.handle('chat-connect', () => this.connectChat());
        ipcMain.handle('chat-disconnect', () => this.disconnectChat());
        ipcMain.handle('chat-send-message', (event, channel, message) => this.sendChatMessage(channel, message));
    }

    async startLoginFlow() {
        const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}&response_type=token&scope=${encodeURIComponent(TWITCH_SCOPES)}`;

        return new Promise((resolve, reject) => {
            const authWindow = new BrowserWindow({ width: 800, height: 600, modal: true, parent: this.mainWindow });
            authWindow.loadURL(authUrl);

            const onWillRedirect = async (event, url) => {
                if (url.startsWith(TWITCH_REDIRECT_URI)) {
                    event.preventDefault();
                    try {
                        const token = this.extractTokenFromUrl(url);
                        this.authProvider = new StaticAuthProvider(TWITCH_CLIENT_ID, token, TWITCH_SCOPES.split(' '));
                        this.apiClient = new ApiClient({ authProvider: this.authProvider });

                        const twitchUser = await this.apiClient.users.getMe();
                        this.userInfo = { username: twitchUser.name, id: twitchUser.id };

                        authWindow.close();
                        resolve(this.userInfo);
                    } catch (error) {
                        authWindow.close();
                        reject(error);
                    }
                }
            };

            authWindow.webContents.on('will-redirect', onWillRedirect);
            authWindow.on('closed', () => !this.apiClient && resolve(null));
        });
    }

    async logout() {
        this.apiClient = null;
        this.authProvider = null;
        this.userInfo = null;
        this.disconnectChat();
        console.log("Logged out from Twitch.");
    }

    extractTokenFromUrl(url) {
        const hash = new URL(url).hash.substring(1);
        const params = new URLSearchParams(hash);
        return params.get('access_token');
    }
    getUserInfo() { return this.userInfo; }

    async getChannelInfo() {
        if (!this.apiClient) throw new Error("Not authenticated.");
        const channel = await this.apiClient.channels.getChannelInfoById(this.userInfo.id);
        return { title: channel.title, category: channel.gameName };
    }

    async updateChannelInfo(title, category) {
        if (!this.apiClient) throw new Error("Not authenticated.");
        const game = await this.apiClient.games.getGameByName(category);
        if (!game) throw new Error(`Category "${category}" not found.`);
        await this.apiClient.channels.updateChannelInfo(this.userInfo.id, { title, gameId: game.id });
        return { success: true };
    }

    connectChat() {
        if (!this.userInfo || !this.authProvider) throw new Error("Cannot connect chat: not logged in.");
        if (this.chatClient && this.chatClient.readyState() === 'OPEN') return;

        this.chatClient = new tmi.Client({
            identity: {
                username: this.userInfo.username,
                password: `oauth:${this.authProvider.accessToken}`,
            },
            channels: [this.userInfo.username],
        });
        this.chatClient.connect().catch(console.error);

        this.chatClient.on('message', (channel, tags, message, self) => {
            if (self) return;
            this.mainWindow.webContents.send('chat-message', {
                username: tags['display-name'], message, color: tags['color'] || '#FFFFFF'
            });
        });
    }

    disconnectChat() {
        if (this.chatClient) {
            this.chatClient.disconnect();
            this.chatClient = null;
        }
    }

    sendChatMessage(channel, message) {
        if (this.chatClient && this.chatClient.readyState() === 'OPEN') {
            this.chatClient.say(channel, message);
        }
    }

    cleanup() {
        this.logout();
    }
}

module.exports = new TwitchIntegration();
