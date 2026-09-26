'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('usageSee', {
  getState: () => ipcRenderer.invoke('state:get'),
  connect: (provider, connected) => ipcRenderer.invoke('provider:connect', provider, connected),
  openProvider: provider => ipcRenderer.invoke('provider:open', provider),
  authenticated: provider => ipcRenderer.invoke('provider:auth', provider),
  readProvider: provider => ipcRenderer.invoke('provider:read', provider),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  setWidgetVisible: visible => ipcRenderer.invoke('widget:visible', visible),
  setWidgetOpacity: value => ipcRenderer.invoke('widget:opacity', value),
  showApp: () => ipcRenderer.invoke('app:show'),
  setupApiBalance: (adminKey, startingBalance) => ipcRenderer.invoke('apiBalance:setup', adminKey, startingBalance),
  refreshApiBalance: () => ipcRenderer.invoke('apiBalance:refresh'),
  resetApiBalance: () => ipcRenderer.invoke('apiBalance:reset'),
  updateApiBalanceStart: value => ipcRenderer.invoke('apiBalance:updateStartingBalance', value),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  }
});
