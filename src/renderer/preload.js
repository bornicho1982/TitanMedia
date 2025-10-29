const { contextBridge } = require('electron');
const path = require('path');
const core = require(path.join(__dirname, '../../build/Release/libtitan_media_core.so'));

contextBridge.exposeInMainWorld('core', {
  hello: () => core.hello(),
  startup: () => core.startup(),
  shutdown: () => core.shutdown()
});
