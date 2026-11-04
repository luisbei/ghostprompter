const { contextBridge, ipcRenderer } = require('electron');

const listenable = new Set([
  'prompter:cmd', 'prompter:state', 'prompter:visible',
  'rec:toggle', 'app:stop-and-quit', 'cam:config', 'model:progress', 'ui:lang', 'cam:closed', 'power:suspend',
]);

// Privacidade: o app não usa WebRTC (conexões diretas pela rede). Ele é removido das páginas do app
// antes de qualquer script delas rodar, para que nem uma biblioteca de terceiros consiga abrir uma conexão assim.
contextBridge.executeInMainWorld({
  func: () => {
    for (const k of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCIceCandidate', 'RTCSessionDescription']) {
      try { Object.defineProperty(window, k, { value: undefined, writable: false, configurable: false }); } catch {}
    }
  },
});

contextBridge.exposeInMainWorld('api', {
  testMode: process.env.GHOSTPROMPTER_TEST === '1',

  getUiLang: () => ipcRenderer.invoke('ui:lang'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  getSources: () => ipcRenderer.invoke('sources:get'),

  recBegin: () => ipcRenderer.invoke('rec:begin'),
  recOpen: (kind, ext) => ipcRenderer.invoke('rec:open', kind, ext),
  recChunk: (id, data) => ipcRenderer.invoke('rec:chunk', id, data),
  recClose: (id) => ipcRenderer.invoke('rec:close', id),
  recEnd: () => ipcRenderer.invoke('rec:end'),

  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  openFolder: (p) => ipcRenderer.invoke('folder:open', p),
  openText: () => ipcRenderer.invoke('text:open'),

  prompterCmd: (cmd) => ipcRenderer.send('prompter:cmd', cmd),
  prompterState: (s) => ipcRenderer.send('prompter:state', s),
  prompterToggle: (force) => ipcRenderer.send('prompter:toggle', force),
  prompterOpacity: (v) => ipcRenderer.send('prompter:opacity', v),
  quit: () => ipcRenderer.send('app:quit'),

  modelInfo: (lang) => ipcRenderer.invoke('model:info', lang),
  modelDownload: (lang) => ipcRenderer.invoke('model:download', lang),

  camConfig: (cfg) => ipcRenderer.send('cam:config', cfg),
  camBounds: () => ipcRenderer.invoke('cam:bounds'),
  camSetBounds: (b) => ipcRenderer.send('cam:set-bounds', b),

  on: (channel, fn) => {
    if (listenable.has(channel)) ipcRenderer.on(channel, (_e, ...args) => fn(...args));
  },
});
