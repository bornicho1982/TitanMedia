const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// In this architecture, we are NOT using IPC for core functions for now
// to avoid breaking the render loop. This is a temporary measure.
const addonPath = path.join(__dirname, '../../build/Release/titan_media_core');
const core = require(addonPath);

contextBridge.exposeInMainWorld('core', {
  // Core lifecycle
  startup: () => core.startup(),
  shutdown: () => core.shutdown(),
  getLatestFrame: () => core.getLatestFrame(),

  // Scene Management
  createScene: (name) => core.createScene(name),
  removeScene: (name) => core.removeScene(name),
  getSceneList: () => core.getSceneList(),
  getSceneSources: (sceneName) => core.getSceneSources(sceneName),

  // Studio Mode
  setPreviewScene: (sceneName) => core.setPreviewScene(sceneName),
  transition: () => core.executeTransition(),
  getProgramScene: () => core.getProgramSceneName(),

  // Source Management
  addSource: (sceneName, sourceId, sourceName) => core.addSource(sceneName, sourceId, sourceName),
  removeSource: (sceneName, sourceName) => core.removeSource(sceneName, sourceName),
  getSourceProperties: (sourceName) => core.getSourceProperties(sourceName),
  updateSourceProperties: (sourceName, properties) => core.updateSourceProperties(sourceName, properties),

  // Audio Management
  setSourceMuted: (sourceName, muted) => core.setSourceMuted(sourceName, muted),
  isSourceMuted: (sourceName) => core.isSourceMuted(sourceName),
  getAudioLevels: () => core.getAudioLevels(),

  // Output Management
  startStreaming: (server, key) => core.startStreaming(server, key),
  stopStreaming: () => core.stopStreaming(),
  isStreaming: () => core.isStreaming(),
  startRecording: () => core.startRecording(),
  stopRecording: () => core.stopRecording(),
  isRecording: () => core.isRecording(),

  // Overlays (from main process due to FS access)
  getOverlayTemplates: () => ipcRenderer.invoke('get-overlay-templates'),

  // Filesystem (from main process for dialogs)
  selectLogo: () => ipcRenderer.invoke('select-logo'),

  // Database (from main process)
  loadScenes: () => ipcRenderer.invoke('db-load-scenes'),
  loadFullSceneData: (sceneNames) => ipcRenderer.invoke('db-load-full-scene-data', sceneNames),

  // Twitch Integration (from main process)
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
