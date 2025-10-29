const { contextBridge } = require('electron');
const path = require('path');

const addonPath = path.join(__dirname, '../../build/Release/titan_media_core');
const core = require(addonPath);

contextBridge.exposeInMainWorld('core', {
  startup: () => core.startup(),
  shutdown: () => core.shutdown(),
  createScene: () => core.createScene(),
  getLatestFrame: () => core.getLatestFrame()
});
