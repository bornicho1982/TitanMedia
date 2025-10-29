const { contextBridge } = require('electron');
const path = require('path');

const addonPath = path.join(__dirname, '../../build/Release/titan_media_core');
const core = require(addonPath);

contextBridge.exposeInMainWorld('core', {
  // Core lifecycle
  startup: () => core.startup(),
  shutdown: () => core.shutdown(),

  // Video Rendering
  getLatestFrame: () => core.getLatestFrame(),

  // Scene Management
  createScene: (name) => core.createScene(name),
  setCurrentScene: (name) => core.setCurrentScene(name),
  getSceneList: () => core.getSceneList(),
  getSceneSources: (sceneName) => core.getSceneSources(sceneName),

  // Source Management
  addSource: (sceneName, sourceId, sourceName) => core.addSource(sceneName, sourceId, sourceName),
  removeSource: (sceneName, sourceName) => core.removeSource(sceneName, sourceName),
  getSourceProperties: (sourceName) => core.getSourceProperties(sourceName),
  updateSourceProperties: (sourceName, properties) => core.updateSourceProperties(sourceName, properties),

  // Audio Management
  setSourceMuted: (sourceName, muted) => core.setSourceMuted(sourceName, muted),
  isSourceMuted: (sourceName) => core.isSourceMuted(sourceName),
  getAudioLevels: () => core.getAudioLevels()
});

contextBridge.exposeInMainWorld('platform', {
  os: process.platform
});
