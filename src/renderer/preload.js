const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

const addonPath = path.join(__dirname, '../../build/Release/titan_media_core');
const core = require(addonPath);

contextBridge.exposeInMainWorld('core', {
  // Core lifecycle
  startup: () => core.startup(),
  shutdown: () => core.shutdown(),

  // Scene Serialization
  getFullSceneData: () => core.getFullSceneData(),
  loadFullSceneData: (data) => core.loadFullSceneData(data),

  // Video Rendering
  getLatestFrame: () => core.getLatestFrame(),

  // Scene Management
  createScene: (name) => core.createScene(name),
  getSceneList: () => core.getSceneList(),

  // Studio Mode
  setPreviewScene: (sceneName) => core.setPreviewScene(sceneName),
  executeTransition: () => core.executeTransition(),
  getProgramSceneName: () => core.getProgramSceneName(),
  getSceneSources: (sceneName) => core.getSceneSources(sceneName),

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

  // Overlay Management
  getOverlayTemplates: () => {
    const overlaysDir = path.join(__dirname, 'overlays');
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
  },

  selectLogo: () => ipcRenderer.invoke('select-logo'),

  // Chat Management
  chatConnect: (options) => ipcRenderer.invoke('chat-connect', options),
  chatDisconnect: () => ipcRenderer.invoke('chat-disconnect'),
  chatSendMessage: (channel, message) => ipcRenderer.invoke('chat-send-message', channel, message),
  onChatMessage: (callback) => ipcRenderer.on('chat-message', (_event, value) => callback(value)),

  // Database
  loadScenes: () => ipcRenderer.invoke('db-load-scenes'),
});

contextBridge.exposeInMainWorld('platform', {
  os: process.platform
});
