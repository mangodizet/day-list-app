const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('load-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, data) => cb(data)),
  enterMiniMode: () => ipcRenderer.invoke('enter-mini-mode'),
  exitMiniMode: () => ipcRenderer.invoke('exit-mini-mode'),
  getMiniOpacity: () => ipcRenderer.invoke('get-mini-opacity'),
  setMiniOpacity: (value) => ipcRenderer.invoke('set-mini-opacity', value),
  getMiniPinned: () => ipcRenderer.invoke('get-mini-pinned'),
  setMiniPinned: (pinned) => ipcRenderer.invoke('set-mini-pinned', pinned),
  onDataChanged: (cb) => ipcRenderer.on('data-changed', () => cb()),
});
