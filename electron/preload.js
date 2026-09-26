'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('usageSee', {
  getState: () => ipcRenderer.invoke('state:get'),
  connect: (provider, connected) => ipcRenderer.invoke('provider:connect', provider, connected),
  openProvider: provider => ipcRenderer.invoke('provider:open', provider),
  readProvider: provider => ipcRenderer.invoke('provider:read', provider),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  setWidgetVisible: visible => ipcRenderer.invoke('widget:visible', visible),
  showApp: () => ipcRenderer.invoke('app:show'),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  }
});
