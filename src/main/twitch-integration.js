
const { BrowserWindow, app } = require('electron');
const { RefreshingAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');
const { promises: fs } = require('fs');
const path = require('path');
const url = require('url');

// Load config securely
const config = require('../../config.json');
const { clientId, clientSecret } = config.twitch;

const tokenPath = path.join(app.getPath('userData'), 'tokens.json'); // CORRECT: Use user data path
const redirectUri = 'http://localhost:3000/auth/twitch/callback';
const scopes = ['chat:read', 'chat:edit', 'channel:read:editors', 'channel:manage:broadcast'];

let authProvider;
let apiClient;
let twitchUserId = null;


async function initTwitch() {
    let tokenData = null;
    try {
        const tokenFile = await fs.readFile(tokenPath, 'utf-8');
        tokenData = JSON.parse(tokenFile);
    } catch (e) {
        console.log('No token file found, starting fresh.');
    }

    authProvider = new RefreshingAuthProvider({
        clientId,
        clientSecret,
        onRefresh: async (userId, newTokenData) => {
            const currentTokens = JSON.parse(await fs.readFile(tokenPath, 'utf-8'));
            currentTokens[userId] = newTokenData;
            await fs.writeFile(tokenPath, JSON.stringify(currentTokens, null, 4), 'utf-8');
        }
    });

    if (tokenData) {
        twitchUserId = Object.keys(tokenData)[0];
        if (twitchUserId) {
            await authProvider.addUser(twitchUserId, tokenData[twitchUserId], ['chat']);
        }
    }

    apiClient = new ApiClient({ authProvider });
}

function getApiClient() {
    return apiClient;
}

function getTwitchUserId() {
    return twitchUserId;
}

function doTwitchLogin() {
    return new Promise((resolve, reject) => {
        const authWindow = new BrowserWindow({
            width: 800,
            height: 600,
            show: true,
        });

        const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes.join(' '))}`;

        authWindow.loadURL(authUrl);

        const onWillRedirect = async (event, newUrl) => {
            const parsedUrl = url.parse(newUrl, true);
            if (parsedUrl.hostname === 'localhost') {
                const { code } = parsedUrl.query;
                authWindow.close();

                try {
                    const tokenData = await authProvider.getAccessTokenForCode(code, redirectUri);
                    const userInfo = await apiClient.users.getMe();
                    twitchUserId = userInfo.id;

                    await fs.writeFile(tokenPath, JSON.stringify({ [twitchUserId]: tokenData }, null, 4), 'utf-8');
                    await authProvider.addUser(twitchUserId, tokenData, ['chat']);

                    resolve(userInfo);
                } catch (error) {
                    console.error('Error exchanging code for token:', error);
                    reject(error);
                }
            }
        };

        authWindow.webContents.on('will-redirect', onWillRedirect);
    });
}

async function doTwitchLogout() {
    if (twitchUserId) {
        try {
            await authProvider.removeUser(twitchUserId);
            await fs.unlink(tokenPath);
            twitchUserId = null;
            apiClient = new ApiClient({ authProvider }); // Re-create client with no user
            console.log('User logged out and tokens deleted.');
        } catch (error) {
            console.error('Error during logout:', error);
        }
    }
}


module.exports = {
    initTwitch,
    getApiClient,
    getTwitchUserId,
    doTwitchLogin,
    doTwitchLogout
};
