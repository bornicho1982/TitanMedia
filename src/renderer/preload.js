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
  addSource: (sceneName, sourceId, sourceName) => core.addSource(sceneName, sourceId, sourceName)
});

contextBridge.exposeInMainWorld('platform', {
  os: process.platform
});
