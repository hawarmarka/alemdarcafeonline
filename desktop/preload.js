'use strict';
// Sayfaya yalnızca birkaç güvenli işlev açılır; Node erişimi yok.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('alemdar', {
  isDesktop: true,
  retry: () => ipcRenderer.send('alemdar:retry'),
  toggleFullscreen: () => ipcRenderer.send('alemdar:fullscreen'),
});
