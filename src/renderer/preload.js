const { contextBridge } = require('electron');
const path = require('path');

// Build a platform-agnostic path to the native addon
// require() will automatically look for .so, .dll, or .dylib
const addonPath = path.join(__dirname, '../../build/Release/titan_media_core');
const core = require(addonPath);

contextBridge.exposeInMainWorld('core', {
  hello: () => core.hello(),
  startup: () => core.startup(),
  shutdown: () => core.shutdown(),
  createScene: () => core.createScene(),
  addVideoCapture: () => core.addVideoCapture(),
  addBrowserSource: (url, width, height) => core.addBrowserSource(url, width, height),
  addMicSource: () => core.addMicSource(),
  addDesktopAudioSource: () => core.addDesktopAudioSource()
});
