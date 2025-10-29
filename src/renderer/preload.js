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
  isRecording: () => core.isRecording()
});

contextBridge.exposeInMainWorld('platform', {
  os: process.platform
});
