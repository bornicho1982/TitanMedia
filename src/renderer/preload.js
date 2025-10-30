const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('core', {
    // Core Lifecycle
    startup: () => ipcRenderer.invoke('core-startup'),
    shutdown: () => ipcRenderer.invoke('core-shutdown'),

    // Scene Management
    getSceneList: () => ipcRenderer.invoke('core-get-scene-list'),
    getSceneSources: (sceneName) => ipcRenderer.invoke('core-get-scene-sources', sceneName),
    createScene: (sceneName) => ipcRenderer.invoke('core-create-scene', sceneName),
    removeScene: (sceneName) => ipcRenderer.invoke('core-remove-scene', sceneName),
    setCurrentScene: (sceneName) => ipcRenderer.invoke('core-set-current-scene', sceneName),

    // Studio Mode
    setPreviewScene: (sceneName) => ipcRenderer.invoke('core-set-preview-scene', sceneName),
    transition: () => ipcRenderer.invoke('core-transition'),

    // Source Management
    addSource: (sceneName, sourceId, sourceName) => ipcRenderer.invoke('core-add-source', sceneName, sourceId, sourceName),
    removeSource: (sourceName) => ipcRenderer.invoke('core-remove-source', sourceName),
    getSourceProperties: (sourceName) => ipcRenderer.invoke('core-get-source-properties', sourceName),
    updateSourceProperties: (sourceName, properties) => ipcRenderer.invoke('core-update-source-properties', sourceName, properties),

    // Output Management
    startStreaming: () => ipcRenderer.invoke('core-start-streaming'),
    stopStreaming: () => ipcRenderer.invoke('core-stop-streaming'),
    isStreaming: () => ipcRenderer.invoke('core-is-streaming'),

    // Audio Management
    getAudioLevels: () => ipcRenderer.invoke('core-get-audio-levels'),
    isSourceMuted: (sourceName) => ipcRenderer.invoke('core-is-source-muted', sourceName),
    setSourceMuted: (sourceName, muted) => ipcRenderer.invoke('core-set-source-muted', sourceName, muted),

    // Dialogs
    selectLogo: () => ipcRenderer.invoke('dialog-select-logo'),

    // Overlays
    getOverlayTemplates: () => ipcRenderer.invoke('get-overlay-templates'),

    // Twitch Integration
    twitchLogin: () => ipcRenderer.invoke('twitch-login'),
    twitchLogout: () => ipcRenderer.invoke('twitch-logout'),
    getTwitchUser: () => ipcRenderer.invoke('twitch-get-user'),
    getChannelInfo: () => ipcRenderer.invoke('twitch-get-channel-info'),
    updateChannelInfo: (title, category) => ipcRenderer.invoke('twitch-update-channel-info', title, category),

    // Chat
    onChatMessage: (callback) => ipcRenderer.on('chat-message', (_event, value) => callback(value)),
    chatConnect: () => ipcRenderer.send('chat-connect'),
    chatDisconnect: () => ipcRenderer.send('chat-disconnect'),
    chatSendMessage: (channel, message) => ipcRenderer.send('chat-send-message', channel, message)
});

contextBridge.exposeInMainWorld('platform', {
  os: process.platform
});
